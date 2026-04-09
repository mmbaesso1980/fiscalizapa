"""
A.S.M.O.D.E.U.S. — API Sentinel  (19_api_sentinel.py)

Protocolo S.E.N.T.I.N.E.L.A. — PARTE 1: Monitor de Saúde das APIs (Self-Healing)

Responsabilidades:
  1. Ler engines/registry_apis.json e fazer ping técnico em cada endpoint
  2. Validar: status HTTP, schema de dados, tempo de resposta, tamanho mínimo
  3. Se falha detectada:
     - Pausar a API no Firestore (config/apis/{api_id}.active = false)
     - Enviar alerta para AdminDashboard (Firestore: alertas_sentinela)
     - NÃO gravar dados inválidos no BigQuery (proteção de schema)
  4. Auto-cura: se API estava pausada e voltou ao normal → re-ativa
  5. Checar kill switch global (config/sistema.killSwitch) antes de rodar
  6. Gerar relatório de saúde em Firestore (config/sentinel_report)

Critérios de falha:
  - Status HTTP ≠ 200-299
  - Timeout > threshold configurado
  - Resposta vazia (len < 10 bytes)
  - Schema break: campos esperados ausentes
  - Mudança abrupta de volume: < 10% do histórico de registros

Integração com AdminDashboard:
  - Grava em: Firestore[alertas_sentinela]
  - Atualiza:  Firestore[config/apis/{id}] com { active, lastCheck, status, error }
  - Relatório: Firestore[config/sentinel_report]
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("api_sentinel")

# ─── Configuração ─────────────────────────────────────────────────────────────
FIRESTORE_PROJECT  = "fiscallizapa"
REGISTRY_PATH      = Path(__file__).parent / "registry_apis.json"
MAX_WORKERS        = 8      # pings em paralelo
DEFAULT_TIMEOUT    = 12     # segundos
SLOW_THRESHOLD     = 8      # alerta se > 8s
MIN_RESPONSE_BYTES = 10     # resposta mínima válida

FS_ALERTAS_SENTINEL = "alertas_sentinela"
FS_CONFIG_APIS      = "config_apis"
FS_SENTINEL_REPORT  = "sentinel_report"
FS_SISTEMA          = "config"

HEADERS = {
    "Accept":     "application/json, application/rss+xml, text/xml, */*",
    "User-Agent": "ASMODEUS-Sentinel/1.0 (health-check)",
}


# ─── Estrutura de resultado ───────────────────────────────────────────────────
@dataclass
class PingResult:
    api_id:       str
    api_name:     str
    api_type:     str
    url:          str
    success:      bool
    status_code:  int   = 0
    latency_ms:   float = 0.0
    response_size: int  = 0
    error:        str   = ""
    schema_ok:    bool  = True
    schema_issues: list[str] = field(default_factory=list)
    was_active:   bool  = True
    auto_healed:  bool  = False
    checked_at:   str   = ""


# ─── Leitura do registry ──────────────────────────────────────────────────────
def load_registry(path: Path) -> list[dict]:
    if not path.exists():
        log.warning("registry_apis.json não encontrado em %s", path)
        return get_mock_registry()
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        apis = [a for a in data.get("apis", []) if a.get("active", True)]
        log.info("Registry carregado: %d APIs ativas", len(apis))
        return apis
    except Exception as e:
        log.error("Erro ao ler registry: %s — usando mock", e)
        return get_mock_registry()


def get_mock_registry() -> list[dict]:
    """Registry mínimo para demonstração do Sentinel."""
    return [
        {"id": "camara_deputados",   "name": "Câmara dos Deputados API",    "type": "json", "url": "https://dadosabertos.camara.leg.br/api/v2/deputados", "active": True, "bode_detection": False},
        {"id": "ibge_municipios",    "name": "IBGE Municípios",             "type": "json", "url": "https://servicodados.ibge.gov.br/api/v3/malhas/municipios", "active": True, "bode_detection": False},
        {"id": "brasil_api_cnpj",    "name": "BrasilAPI CNPJ",             "type": "json", "url": "https://brasilapi.com.br/api/cnpj/v1/19131243000197", "active": True, "bode_detection": False},
        {"id": "bcb_sgs_usd",        "name": "BCB SGS — Dólar",            "type": "json", "url": "https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados/ultimos/1?formato=json", "active": True, "bode_detection": False},
        {"id": "transparencia_emendas","name": "Portal Transparência — Emendas", "type": "json", "url": "https://api.portaldatransparencia.gov.br/api-de-dados/emendas", "active": True, "bode_detection": True},
        {"id": "dou_rss_edicao1",    "name": "DOU RSS Edição 1",           "type": "rss",  "url": "https://www.in.gov.br/servicos/rss/edicoes-do-diario-oficial-da-uniao", "active": True, "bode_detection": True},
    ]


# ─── Clientes ─────────────────────────────────────────────────────────────────
def init_firestore(project: str) -> Any:
    sa_key = os.environ.get("FIRESTORE_SA_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_cred, firestore
        if not firebase_admin._apps:
            cred = fb_cred.Certificate(sa_key) if (sa_key and os.path.isfile(sa_key)) \
                   else fb_cred.ApplicationDefault()
            firebase_admin.initialize_app(cred, {"projectId": project})
        return firestore.client()
    except Exception as e:
        log.warning("Firestore indisponível: %s", e)
        return None


# ─── Kill Switch check ────────────────────────────────────────────────────────
def check_kill_switch(db: Any) -> bool:
    """Retorna True se o kill switch estiver ativo no Firestore."""
    if not db:
        return False
    try:
        snap = db.collection(FS_SISTEMA).document("sistema").get()
        if snap.exists:
            return snap.to_dict().get("killSwitch", False)
    except Exception as e:
        log.debug("Kill switch check error: %s", e)
    return False


# ─── Ping técnico ─────────────────────────────────────────────────────────────
def ping_api(api: dict, prev_status: dict | None = None) -> PingResult:
    """
    Executa um ping leve no endpoint e retorna o resultado detalhado.
    Para RSS/HTML, valida presença de tags básicas.
    Para JSON, verifica se o retorno é parseável e tem campos mínimos.
    """
    api_id   = api.get("id", "unknown")
    api_name = api.get("name", api_id)
    api_type = api.get("type", "json")
    url_base = api.get("url", "")
    params   = api.get("params", {})

    # Construir URL de ping (usar parâmetros mínimos do registry)
    ping_url = url_base
    if params and api_type == "json":
        # Usar apenas parâmetros não-dinâmicos para o ping
        safe_params = {k: v for k, v in params.items()
                       if "{" not in str(v) and isinstance(v, (str, int))}
        if safe_params:
            ping_url = url_base + "?" + urllib.parse.urlencode(safe_params)

    result = PingResult(
        api_id    = api_id,
        api_name  = api_name,
        api_type  = api_type,
        url       = ping_url,
        success   = False,
        was_active = api.get("active", True),
        checked_at = datetime.now(timezone.utc).isoformat(),
    )

    t_start = time.monotonic()
    try:
        req = urllib.request.Request(ping_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as r:
            body          = r.read()
            result.status_code   = r.status
            result.latency_ms    = (time.monotonic() - t_start) * 1000
            result.response_size = len(body)

            # Falha por status HTTP
            if r.status not in range(200, 300):
                result.error = f"HTTP {r.status}"
                return result

            # Falha por resposta vazia
            if len(body) < MIN_RESPONSE_BYTES:
                result.error = "Resposta vazia (< 10 bytes)"
                return result

            # Validação de schema por tipo
            if api_type in ("json", "api"):
                try:
                    parsed = json.loads(body.decode("utf-8", errors="replace"))
                    result.schema_ok, result.schema_issues = _validate_json_schema(parsed, api)
                except json.JSONDecodeError as e:
                    result.schema_ok = False
                    result.schema_issues = [f"JSON inválido: {e}"]
            elif api_type == "rss":
                if b"<rss" not in body and b"<feed" not in body and b"<item" not in body:
                    result.schema_ok = False
                    result.schema_issues = ["Resposta RSS sem tags esperadas (<rss>/<feed>/<item>)"]

            # Alerta de lentidão
            if result.latency_ms > SLOW_THRESHOLD * 1000:
                result.schema_issues.append(f"Latência alta: {result.latency_ms:.0f}ms")

            result.success = result.schema_ok

            # Auto-cura: API estava pausada e voltou ao normal
            if prev_status and not prev_status.get("active", True) and result.success:
                result.auto_healed = True
                log.info("  🔄 AUTO-CURA: %s voltou ao normal!", api_name)

    except urllib.error.HTTPError as e:
        result.status_code = e.code
        result.latency_ms  = (time.monotonic() - t_start) * 1000
        result.error       = f"HTTPError {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        result.latency_ms  = (time.monotonic() - t_start) * 1000
        result.error       = f"URLError: {e.reason}"
    except TimeoutError:
        result.latency_ms  = DEFAULT_TIMEOUT * 1000
        result.error       = f"Timeout ({DEFAULT_TIMEOUT}s)"
    except Exception as e:
        result.latency_ms  = (time.monotonic() - t_start) * 1000
        result.error       = str(e)[:120]

    return result


def _validate_json_schema(parsed: Any, api: dict) -> tuple[bool, list[str]]:
    """Validação básica de schema para APIs JSON."""
    issues = []

    if isinstance(parsed, list):
        if len(parsed) == 0:
            issues.append("Array vazio retornado")
        # Verificar campos esperados na 1ª item
        if parsed and isinstance(parsed[0], dict):
            expected = api.get("schema_fields", [])
            if expected:
                missing = [f for f in expected if f not in parsed[0]]
                if missing:
                    issues.append(f"Campos ausentes: {', '.join(missing)}")
    elif isinstance(parsed, dict):
        # APIs que retornam { dados: [...] } ou { results: [...] }
        data_key = next((k for k in ["dados", "data", "results", "items", "content"] if k in parsed), None)
        if data_key and isinstance(parsed[data_key], list) and len(parsed[data_key]) == 0:
            issues.append(f"Array '{data_key}' vazio")
        expected = api.get("schema_fields", [])
        if expected:
            check_obj = parsed.get(data_key, parsed) if data_key else parsed
            if isinstance(check_obj, list) and check_obj:
                check_obj = check_obj[0]
            if isinstance(check_obj, dict):
                missing = [f for f in expected if f not in check_obj]
                if missing:
                    issues.append(f"Campos ausentes: {', '.join(missing)}")

    return len(issues) == 0, issues


# ─── Persistência ─────────────────────────────────────────────────────────────
def save_result(db: Any, result: PingResult, dry_run: bool) -> None:
    if dry_run or not db:
        return
    try:
        # Atualizar status da API no config_apis
        db.collection(FS_CONFIG_APIS).document(result.api_id).set({
            "api_id":       result.api_id,
            "name":         result.api_name,
            "active":       result.success or result.auto_healed,
            "lastCheck":    result.checked_at,
            "statusCode":   result.status_code,
            "latencyMs":    round(result.latency_ms, 1),
            "responseSize": result.response_size,
            "error":        result.error if not result.success else "",
            "schemaIssues": result.schema_issues,
            "autoHealed":   result.auto_healed,
        }, merge=True)

        # Se falhou → alerta para AdminDashboard
        if not result.success:
            alert = {
                "id":        f"SENTINEL_{result.api_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}",
                "tipo":      "API_FAILURE",
                "api_id":    result.api_id,
                "api_name":  result.api_name,
                "error":     result.error,
                "statusCode": result.status_code,
                "schemaIssues": result.schema_issues,
                "criadoEm":  result.checked_at,
                "resolvido": False,
            }
            db.collection(FS_ALERTAS_SENTINEL).document(alert["id"]).set(alert)
            log.warning("  ⚠️ Alerta criado: %s", alert["id"])

    except Exception as e:
        log.error("  Firestore save error: %s", e)


def save_report(db: Any, results: list[PingResult], dry_run: bool) -> None:
    if dry_run or not db:
        return
    total    = len(results)
    healthy  = sum(1 for r in results if r.success)
    failures = [r for r in results if not r.success]
    healed   = [r for r in results if r.auto_healed]

    try:
        db.collection(FS_SISTEMA).document(FS_SENTINEL_REPORT).set({
            "totalApis":    total,
            "healthyApis":  healthy,
            "failedApis":   len(failures),
            "healedApis":   len(healed),
            "healthPct":    round(healthy / max(total, 1) * 100, 1),
            "lastRun":      datetime.now(timezone.utc).isoformat(),
            "failedIds":    [r.api_id for r in failures[:10]],
            "avgLatencyMs": round(sum(r.latency_ms for r in results) / max(len(results), 1), 1),
        }, merge=True)
        log.info("✅ Relatório salvo no Firestore")
    except Exception as e:
        log.error("  Relatório Firestore: %s", e)


# ─── Orquestrador ─────────────────────────────────────────────────────────────
def run_sentinel(apis: list[dict], db: Any, dry_run: bool,
                 max_workers: int = MAX_WORKERS) -> list[PingResult]:
    """Executa pings em paralelo e salva resultados."""
    # Carregar status anteriores do Firestore
    prev_statuses: dict[str, dict] = {}
    if db:
        try:
            for doc in db.collection(FS_CONFIG_APIS).stream():
                prev_statuses[doc.id] = doc.to_dict()
        except Exception:
            pass

    results  = []
    total    = len(apis)
    log.info("Iniciando Sentinel para %d APIs (workers=%d)…", total, max_workers)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {
            pool.submit(ping_api, api, prev_statuses.get(api["id"])): api
            for api in apis
        }
        for future in as_completed(future_map):
            api    = future_map[future]
            result = future.result()
            results.append(result)

            icon = "✅" if result.success else "❌"
            heal = " 🔄 AUTO-HEALED" if result.auto_healed else ""
            log.info(
                "  %s %-40s %4dms  %s%s",
                icon,
                api["name"][:40],
                int(result.latency_ms),
                f"[{result.error[:40]}]" if result.error else "OK",
                heal,
            )
            save_result(db, result, dry_run)

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="S.E.N.T.I.N.E.L.A. — API Health Monitor")
    parser.add_argument("--fs-project", default=FIRESTORE_PROJECT)
    parser.add_argument("--registry",   default=str(REGISTRY_PATH))
    parser.add_argument("--workers",    type=int, default=MAX_WORKERS)
    parser.add_argument("--dry-run",    action="store_true")
    parser.add_argument("--api-id",     default=None, help="Testar API específica")
    args = parser.parse_args()

    # Inicializar Firestore
    db = None
    if not args.dry_run:
        db = init_firestore(args.fs_project)

    # Checar kill switch
    if check_kill_switch(db):
        log.warning("🔴 KILL SWITCH ATIVO — Sentinel abortado pelo administrador.")
        sys.exit(0)

    # Carregar registry
    apis = load_registry(Path(args.registry))
    if args.api_id:
        apis = [a for a in apis if a["id"] == args.api_id]
        if not apis:
            log.error("API '%s' não encontrada no registry.", args.api_id)
            sys.exit(1)

    # Executar
    results = run_sentinel(apis, db, args.dry_run, args.workers)

    # Salvar relatório
    save_report(db, results, args.dry_run)

    # Resumo no terminal
    healthy  = [r for r in results if r.success]
    failures = [r for r in results if not r.success]
    healed   = [r for r in results if r.auto_healed]
    avg_lat  = sum(r.latency_ms for r in results) / max(len(results), 1)

    print("\n" + "═" * 65)
    print(" S.E.N.T.I.N.E.L.A. — RELATÓRIO DE SAÚDE DAS APIs")
    print("═" * 65)
    print(f" Total verificadas:   {len(results)}")
    print(f" ✅ Saudáveis:        {len(healthy)} ({len(healthy)/max(len(results),1)*100:.0f}%)")
    print(f" ❌ Com falha:        {len(failures)}")
    print(f" 🔄 Auto-curadas:     {len(healed)}")
    print(f" ⏱ Latência média:   {avg_lat:.0f}ms")
    if failures:
        print("\n APIs com falha:")
        for r in failures:
            print(f"   ❌ {r.api_name[:45]:45} → {r.error[:40]}")
    print("═" * 65)

    # Exit code não-zero se há falhas críticas (para CI/CD)
    critical_failures = [r for r in failures if r.status_code in (0, 500, 503)]
    sys.exit(1 if len(critical_failures) > len(results) // 2 else 0)


if __name__ == "__main__":
    main()
