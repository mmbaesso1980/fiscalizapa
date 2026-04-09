"""
A.S.M.O.D.E.U.S. — Motor de Assiduidade e Autoria  (13_ingest_presencas.py)

Responsabilidades:
  1. Buscar registros de presença dos deputados na API da Câmara dos Deputados
     (endpoint: /deputados/{id}/presencas)
  2. Separar Sessões Plenárias de Reuniões de Comissões
  3. Calcular taxa de presença por tipo (plenário x comissões)
  4. Buscar proposições de AUTORIA PRINCIPAL (sem co-autorias infladas)
  5. Armazenar tudo em BigQuery (fiscalizapa.presencas_detalhadas)
     e Firestore (presencas/{id} + proposicoes_proprias/{id})

Endpoints Câmara usados:
  GET /deputados/{id}/presencas?dataInicio=...&dataFim=...
  GET /proposicoes?idDeputadoAutor={id}&itens=100&ordem=DESC&ordenarPor=id

Uso:
  python engines/13_ingest_presencas.py
  python engines/13_ingest_presencas.py --deputado-id 204521
  python engines/13_ingest_presencas.py --ano 2023
  python engines/13_ingest_presencas.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
import json
from datetime import date, timedelta
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("presencas")

# ─── Configuração ─────────────────────────────────────────────────────────────
CAMARA_BASE          = "https://dadosabertos.camara.leg.br/api/v2"
GCP_PROJECT          = "projeto-codex-br"
FIRESTORE_PROJECT    = "fiscallizapa"
BQ_DATASET           = "fiscalizapa"
BQ_TABLE_PRESENCAS   = f"{BQ_DATASET}.presencas_detalhadas"
BQ_TABLE_PROPOSICOES = f"{BQ_DATASET}.proposicoes_autoria_propria"
HEADERS              = {"Accept": "application/json",
                        "User-Agent": "ASMODEUS/2.0 (auditoria-forense-parlamentar)"}
RATE_LIMIT_S         = 1.0    # segundos entre chamadas à API da Câmara
MAX_RETRIES          = 3

# Tipos de evento que caracterizam Sessões Plenárias vs Comissões
PLENARIO_KEYWORDS    = {"plenário", "plenario", "sessão", "sessao",
                        "deliberativa", "ordinaria", "extraordinaria"}
COMISSAO_KEYWORDS    = {"comissão", "comissao", "reunião", "reuniao",
                        "audiência", "audiencia", "comite", "comitê"}

# Tipos de proposição para autoria própria (com filtro anti-carona)
TIPOS_AUTORIAIS      = ["PL", "PEC", "PDC", "MPV", "PRC", "PLV"]
COAUTORIA_MAX_AUTORES = 3  # se tiver mais de N autores, considera co-autoria


# ─── HTTP Helper ──────────────────────────────────────────────────────────────
def _get(url: str, params: dict | None = None, retries: int = MAX_RETRIES) -> dict:
    """GET com retry, backoff e decodificação JSON."""
    try:
        import urllib.request
        import urllib.parse

        if params:
            url = url + "?" + urllib.parse.urlencode(params)

        for attempt in range(retries):
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as e:
                if attempt < retries - 1:
                    wait = 2 ** attempt
                    log.warning("  Retry %d/%d (%.1fs) — %s", attempt + 1, retries, wait, e)
                    time.sleep(wait)
                else:
                    raise
    except Exception as e:
        log.error("  Falha ao buscar %s: %s", url, e)
        return {}


def _paginate(url: str, base_params: dict | None = None) -> list[dict]:
    """Pagina automaticamente seguindo o campo links[{rel:'next'}]."""
    results = []
    params  = {**(base_params or {}), "itens": 100}
    current = url

    while current:
        resp  = _get(current, params if current == url else None)
        dados = resp.get("dados", [])
        results.extend(dados)

        # Verificar link de próxima página
        links    = resp.get("links", [])
        next_url = next((l["href"] for l in links if l.get("rel") == "proxima"), None)
        current  = next_url
        if current:
            time.sleep(RATE_LIMIT_S)

    return results


# ─── Inicialização dos clientes ───────────────────────────────────────────────
def _init_clients(project: str, fs_project: str, dry_run: bool):
    from engines_01_bq_setup import sanitize_and_load  # noqa: F401 — verifica se existe

    bq_client = None
    db_client = None

    if not dry_run:
        try:
            from google.cloud import bigquery
            bq_client = bigquery.Client(project=project)
            log.info("  BigQuery cliente inicializado")
        except Exception as e:
            log.warning("  BigQuery indisponível: %s", e)

        try:
            import firebase_admin
            from firebase_admin import credentials as fb_cred, firestore
            sa_key = os.environ.get("FIRESTORE_SA_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if not firebase_admin._apps:
                cred = fb_cred.Certificate(sa_key) if (sa_key and os.path.isfile(sa_key)) \
                       else fb_cred.ApplicationDefault()
                firebase_admin.initialize_app(cred, {"projectId": fs_project})
            db_client = firestore.client()
            log.info("  Firestore cliente inicializado")
        except Exception as e:
            log.warning("  Firestore indisponível: %s", e)

    return bq_client, db_client


# ─── Carga de deputados ativos ─────────────────────────────────────────────────
def load_deputados(single_id: int | None = None) -> list[dict]:
    """Retorna lista de {id, nome, siglaPartido, siglaUf}."""
    if single_id:
        url  = f"{CAMARA_BASE}/deputados/{single_id}"
        resp = _get(url)
        d    = resp.get("dados", {})
        return [{"id": single_id,
                 "nome": d.get("nomeCivil") or d.get("ultimoStatus", {}).get("nome", "–"),
                 "siglaPartido": d.get("ultimoStatus", {}).get("siglaPartido", "–"),
                 "siglaUf": d.get("ultimoStatus", {}).get("siglaUf", "–")}]

    deputados = _paginate(f"{CAMARA_BASE}/deputados",
                          {"ordem": "ASC", "ordenarPor": "nome"})
    return [{"id": d["id"], "nome": d["nome"],
             "siglaPartido": d.get("siglaPartido", "–"),
             "siglaUf":      d.get("siglaUf", "–")}
            for d in deputados if d.get("id")]


# ─── Presença do deputado ──────────────────────────────────────────────────────
def _classify_event(tipo: str) -> str:
    """Retorna 'plenario' | 'comissao' | 'outros'."""
    tipo_lc = tipo.lower()
    if any(k in tipo_lc for k in PLENARIO_KEYWORDS):
        return "plenario"
    if any(k in tipo_lc for k in COMISSAO_KEYWORDS):
        return "comissao"
    return "outros"


def fetch_presencas(dep_id: int, data_inicio: str, data_fim: str) -> dict:
    """
    Retorna dict com métricas de presença separadas por tipo.
    Endpoint: GET /deputados/{id}/presencas?dataInicio=...&dataFim=...
    """
    dados = _paginate(
        f"{CAMARA_BASE}/deputados/{dep_id}/presencas",
        {"dataInicio": data_inicio, "dataFim": data_fim},
    )

    stats = {
        "plenario":  {"presente": 0, "ausente": 0, "justificada": 0, "total": 0},
        "comissao":  {"presente": 0, "ausente": 0, "justificada": 0, "total": 0},
        "outros":    {"presente": 0, "ausente": 0, "justificada": 0, "total": 0},
    }

    for reg in dados:
        tipo     = reg.get("descricaoSessao") or reg.get("descricaoReuniao") or ""
        presenca = (reg.get("frequenciaDeputado") or "").upper()
        bucket   = _classify_event(tipo)

        stats[bucket]["total"] += 1
        if "PRESENTE" in presenca:
            stats[bucket]["presente"] += 1
        elif "JUSTIFI" in presenca:
            stats[bucket]["justificada"] += 1
        else:
            stats[bucket]["ausente"] += 1

    # Calcular percentuais
    def pct(s: dict) -> float:
        t = s["total"]
        return round((s["presente"] + s["justificada"]) / t * 100, 2) if t else 0.0

    return {
        "deputado_id":        str(dep_id),
        "periodo_inicio":     data_inicio,
        "periodo_fim":        data_fim,
        # Plenário
        "plenario_presentes": stats["plenario"]["presente"],
        "plenario_total":     stats["plenario"]["total"],
        "plenario_pct":       pct(stats["plenario"]),
        # Comissões
        "comissao_presentes": stats["comissao"]["presente"],
        "comissao_total":     stats["comissao"]["total"],
        "comissao_pct":       pct(stats["comissao"]),
        # Consolidado
        "total_presentes":    stats["plenario"]["presente"] + stats["comissao"]["presente"],
        "total_eventos":      stats["plenario"]["total"]    + stats["comissao"]["total"],
        "alerta_fantasma":    pct(stats["plenario"]) < 80 or pct(stats["comissao"]) < 80,
        "_raw_total_registros": len(dados),
    }


# ─── Proposições de Autoria Principal ─────────────────────────────────────────
def fetch_proposicoes_autor_principal(dep_id: int) -> list[dict]:
    """
    Busca proposições onde o deputado é AUTOR PRINCIPAL.
    Filtro anti-carona: descarta se o número de autores excede COAUTORIA_MAX_AUTORES.

    Endpoint: GET /proposicoes?idDeputadoAutor={id}&itens=100
    Para cada proposição, verifica os autores via GET /proposicoes/{id}/autores
    """
    props = _paginate(
        f"{CAMARA_BASE}/proposicoes",
        {
            "idDeputadoAutor": dep_id,
            "siglaTipo":       ",".join(TIPOS_AUTORIAIS),
            "ordenarPor":      "id",
            "ordem":           "DESC",
        },
    )

    resultado = []
    for prop in props:
        pid   = prop.get("id")
        if not pid:
            continue

        # Verificar autores (anti-carona)
        try:
            autores_resp = _get(f"{CAMARA_BASE}/proposicoes/{pid}/autores")
            autores      = autores_resp.get("dados", [])
            time.sleep(0.3)  # throttle por item
        except Exception:
            autores = []

        # Checar se o deputado está como primeiro/principal autor
        nomes_autores = [a.get("nome", "") for a in autores]
        is_principal  = (
            len(autores) <= COAUTORIA_MAX_AUTORES
            and any(a.get("idEntidade") == str(dep_id) or
                    a.get("codTipo") in ("1", "Autor")
                    for a in autores[:2])  # primeiros 2 autores = principais
        )

        if not is_principal:
            log.debug("  Pulando PL %s/%s — %d autores (carona detectado)",
                      prop.get("numero"), prop.get("ano"), len(autores))
            continue

        resultado.append({
            "deputado_id":        str(dep_id),
            "proposicao_id":      str(pid),
            "siglaTipo":          prop.get("siglaTipo", "–"),
            "numero":             prop.get("numero", "–"),
            "ano":                str(prop.get("ano", "–")),
            "ementa":             (prop.get("ementa") or "–")[:500],
            "situacao":           prop.get("statusProposicao", {}).get("descricaoSituacao", "–") if isinstance(prop.get("statusProposicao"), dict) else "–",
            "dataApresentacao":   prop.get("dataApresentacaoProposicao", "–")[:10],
            "uri":                prop.get("uri", ""),
            "qtd_autores":        len(autores),
            "tipo_autoria":       "principal",
        })
        time.sleep(RATE_LIMIT_S)

    return resultado


# ─── Persistência ─────────────────────────────────────────────────────────────
def save_to_bigquery(bq_client: Any, records: list[dict], table: str) -> None:
    """Upsert em BigQuery usando WRITE_TRUNCATE por período."""
    if not bq_client or not records:
        return
    try:
        import pandas as pd
        from engines_01_bq_setup import sanitize_and_load  # type: ignore
        df = pd.DataFrame(records)
        sanitize_and_load(df, table)
        log.info("  ✅ BigQuery: %d registros → %s", len(records), table)
    except Exception as e:
        log.error("  ❌ BigQuery error: %s", e)


def save_presenca_to_firestore(db: Any, presenca: dict) -> None:
    """Grava resumo de presença no Firestore para acesso direto do frontend."""
    if not db:
        return
    try:
        dep_id = presenca["deputado_id"]
        db.collection("presencas").document(dep_id).set(presenca, merge=True)
        log.debug("  Firestore presencas/%s atualizado", dep_id)
    except Exception as e:
        log.warning("  Firestore presença error: %s", e)


def save_proposicoes_to_firestore(db: Any, dep_id: str, props: list[dict]) -> None:
    """Grava proposições próprias no Firestore (subcoleção ou documento sumário)."""
    if not db or not props:
        return
    try:
        db.collection("proposicoes_proprias").document(dep_id).set({
            "deputado_id": dep_id,
            "total":       len(props),
            "projetos":    props[:20],  # máximo 20 para o frontend
            "atualizadoEm": __import__("datetime").datetime.utcnow().isoformat(),
        }, merge=True)
        log.debug("  Firestore proposicoes_proprias/%s: %d projetos", dep_id, len(props))
    except Exception as e:
        log.warning("  Firestore proposições error: %s", e)


# ─── Orquestrador principal ────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingestão de presenças e proposições de autoria própria.",
    )
    parser.add_argument("--gcp-project",    default=GCP_PROJECT)
    parser.add_argument("--fs-project",     default=FIRESTORE_PROJECT)
    parser.add_argument("--deputado-id",    type=int, default=None,
                        help="Processar apenas 1 deputado (debug)")
    parser.add_argument("--ano",            type=int, default=date.today().year,
                        help="Ano para calcular presenças")
    parser.add_argument("--dry-run",        action="store_true")
    args = parser.parse_args()

    data_inicio = f"{args.ano}-01-01"
    data_fim    = f"{args.ano}-12-31"
    log.info("Período: %s → %s", data_inicio, data_fim)

    bq_client, db = _init_clients(args.gcp_project, args.fs_project, args.dry_run)

    deputados = load_deputados(args.deputado_id)
    log.info("Total de deputados a processar: %d", len(deputados))

    presencas_bq  = []
    proposicoes_bq = []
    total_ok = total_err = 0

    for dep in deputados:
        dep_id = dep["id"]
        nome   = dep["nome"][:40]
        log.info("[%s] Processando %s…", dep_id, nome)

        # ── Presenças ──────────────────────────────────────────────────────────
        try:
            pres = fetch_presencas(dep_id, data_inicio, data_fim)
            pres["nome"]        = dep["nome"]
            pres["partido"]     = dep["siglaPartido"]
            pres["uf"]          = dep["siglaUf"]
            presencas_bq.append(pres)
            save_presenca_to_firestore(db, pres)

            alerta = " 👻 FANTASMA" if pres["alerta_fantasma"] else ""
            log.info("  Plenário: %.1f%%  Comissões: %.1f%%%s",
                     pres["plenario_pct"], pres["comissao_pct"], alerta)
            time.sleep(RATE_LIMIT_S)
        except Exception as e:
            log.error("  [%s] Presença falhou: %s", dep_id, e)
            total_err += 1
            continue

        # ── Proposições de autoria própria ────────────────────────────────────
        try:
            props = fetch_proposicoes_autor_principal(dep_id)
            for p in props:
                proposicoes_bq.append(p)
            save_proposicoes_to_firestore(db, str(dep_id), props)
            log.info("  Proposições próprias: %d (co-autorias descartadas)", len(props))
        except Exception as e:
            log.warning("  [%s] Proposições falhou: %s", dep_id, e)

        total_ok += 1

        # Persistir em lotes a cada 50 deputados
        if len(presencas_bq) % 50 == 0:
            if not args.dry_run:
                save_to_bigquery(bq_client, presencas_bq,   BQ_TABLE_PRESENCAS)
                save_to_bigquery(bq_client, proposicoes_bq, BQ_TABLE_PROPOSICOES)

    # Persistir restantes
    if not args.dry_run:
        save_to_bigquery(bq_client, presencas_bq,   BQ_TABLE_PRESENCAS)
        save_to_bigquery(bq_client, proposicoes_bq, BQ_TABLE_PROPOSICOES)
    else:
        log.info("[DRY-RUN] %d registros de presença simulados", len(presencas_bq))
        log.info("[DRY-RUN] %d proposições próprias simuladas", len(proposicoes_bq))

    log.info("══ Concluído: %d ok · %d erros ══", total_ok, total_err)


if __name__ == "__main__":
    main()
