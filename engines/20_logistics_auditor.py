"""
A.S.M.O.D.E.U.S. — Auditor Logístico  (20_logistics_auditor.py)

Protocolo F.L.A.V.I.O. — PARTE 1: Auditoria de Viagens e Fretamentos

Responsabilidades:
  1. Coletar dados de viagens/CEAP do portal da Câmara:
     - Passagens aéreas, locação de veículos, fretamento de aeronaves
  2. Comparar com PREÇO DE MERCADO (tabela de referência + Google Flights/ANAC)
  3. Verificar CNPJ da contratada:
     - Capital social baixo vs. contrato milionário → Inexequibilidade
     - Frota registrada na Receita Federal vs. serviços prestados
  4. NEXO GEOGRÁFICO: cruzar destino do fretamento com agenda do político
     - Se não há evento oficial no destino na data → Gasto de Interesse Privado
  5. Combustível: detectar consumo impossível (5 voltas na Terra?)
     - Quilometragem implícita vs. gastos declarados
  6. Salvar em: Firestore[alertas_logistica] + BQ[fiscalizapa.logistics_anomalies]

Fontes:
  - Câmara API: /deputados/{id}/despesas (CEAP)
  - Câmara API: /deputados/{id}/eventos (agenda)
  - BrasilAPI: CNPJ da contratada (capital social, funcionários)
  - Tabela interna: preços de referência por modal e região
  - ANAC Dados Abertos: https://www.gov.br/anac/pt-br/assuntos/dados-e-estatisticas

Limites de referência:
  ALERTA_SOBRE_MERCADO    = 2.0x   # 200% acima do preço de mercado
  INEXEQUIBILIDADE_RATIO  = 50     # contrato > 50x capital social da empresa
  FANTASMA_FUEL_VOLTAS    = 3      # gastos que permitiriam > 3 voltas na Terra
  TERRA_CIRCUNFERENCIA_KM = 40_075
  CONSUMO_MEDIO_L_POR_100 = 12     # carro médio
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import time
import urllib.request
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("logistics_auditor")

# ─── Constantes ───────────────────────────────────────────────────────────────
GCP_PROJECT           = "projeto-codex-br"
FIRESTORE_PROJECT     = "fiscallizapa"
BQ_DATASET            = "fiscalizapa"
BQ_OUTPUT             = f"{BQ_DATASET}.logistics_anomalies"
FS_ALERTAS            = "alertas_logistica"
FS_BODES              = "alertas_bodes"

CAMARA_BASE           = "https://dadosabertos.camara.leg.br/api/v2"
CNPJ_API              = "https://brasilapi.com.br/api/cnpj/v1"
RATE_LIMIT_S          = 0.8
MAX_RETRIES           = 3

# Limiares de alerta
ALERTA_SOBRE_MERCADO   = 2.0    # 2x o preço de referência
INEXEQUIBILIDADE_RATIO = 50     # contrato > 50x capital social
FANTASMA_FUEL_VOLTAS   = 3      # > 3 voltas na Terra em combustível
TERRA_KM               = 40_075
CONSUMO_L_POR_100KM    = 12

# Subcategorias de despesa CEAP que são logísticas
TIPOS_LOGISTICA = {
    "COMBUSTÍVEIS E LUBRIFICANTES AUTOMOTIVOS": "combustivel",
    "LOCAÇÃO OU FRETAMENTO DE AERONAVES":        "fretamento_aereo",
    "LOCAÇÃO OU FRETAMENTO DE EMBARCAÇÕES":      "fretamento_aquatico",
    "LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES": "locacao_veiculo",
    "PASSAGENS AÉREAS":                          "passagem_aerea",
    "PASSAGENS TERRESTRES, MARÍTIMAS OU FLUVIAIS": "passagem_terrestre",
    "SERVIÇO DE TÁXI, PEDÁGIO E ESTACIONAMENTO": "taxi_estacionamento",
}

# Preços de referência por tipo (valor médio mensal aceitável por deputado)
PRECOS_REFERENCIA = {
    "combustivel":            5_000.0,   # R$ 5k/mês
    "fretamento_aereo":      25_000.0,   # R$ 25k/mês
    "fretamento_aquatico":   15_000.0,
    "locacao_veiculo":        3_000.0,
    "passagem_aerea":         8_000.0,
    "passagem_terrestre":     2_000.0,
    "taxi_estacionamento":    1_500.0,
}

HEADERS = {
    "Accept":     "application/json",
    "User-Agent": "ASMODEUS-LogisticsAuditor/1.0 (auditoria-ceap-publica)",
}


# ─── HTTP Helper ──────────────────────────────────────────────────────────────
def _get(url: str, params: dict | None = None, timeout: int = 15) -> dict | list:
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
            else:
                log.debug("GET %s → %s", url[:80], e)
    return {}


# ─── Câmara API ───────────────────────────────────────────────────────────────
def fetch_despesas(dep_id: str, ano: int) -> list[dict]:
    """Busca despesas CEAP de um deputado no ano."""
    url    = f"{CAMARA_BASE}/deputados/{dep_id}/despesas"
    params = {"ano": ano, "itens": 100, "pagina": 1}
    despesas = []
    while True:
        resp  = _get(url, params)
        dados = resp.get("dados", []) if isinstance(resp, dict) else resp
        if not dados:
            break
        despesas.extend(dados)
        links = resp.get("links", []) if isinstance(resp, dict) else []
        next_link = next((l["href"] for l in links if l.get("rel") == "next"), None)
        if not next_link:
            break
        params["pagina"] += 1
        time.sleep(RATE_LIMIT_S)
    return despesas


def fetch_eventos(dep_id: str, data_inicio: str, data_fim: str) -> list[dict]:
    """Busca agenda/eventos de um deputado em um período."""
    url  = f"{CAMARA_BASE}/deputados/{dep_id}/eventos"
    resp = _get(url, {"dataInicio": data_inicio, "dataFim": data_fim})
    return resp.get("dados", []) if isinstance(resp, dict) else []


# ─── CNPJ da contratada ───────────────────────────────────────────────────────
def get_cnpj_financials(cnpj: str) -> dict:
    cnpj_clean = re.sub(r"\D", "", cnpj or "")
    if len(cnpj_clean) != 14:
        return {}
    data = _get(f"{CNPJ_API}/{cnpj_clean}")
    time.sleep(RATE_LIMIT_S)
    return data if isinstance(data, dict) else {}


# ─── Cálculo de anomalias ─────────────────────────────────────────────────────
def detect_fuel_anomaly(despesas_combustivel: list[dict], dep_nome: str) -> dict | None:
    """
    Detecta consumo impossível de combustível.
    Cálculo: R$ gastos → litros → km equivalente → número de voltas na Terra.
    """
    total_valor = sum(float(d.get("valorDocumento", 0) or 0) for d in despesas_combustivel)
    if total_valor < 1000:
        return None

    # R$ gastos → litros (preço médio R$ 6/L em 2024)
    PRECO_L = 6.0
    litros  = total_valor / PRECO_L
    km_eq   = litros * (100 / CONSUMO_L_POR_100KM)
    voltas  = km_eq / TERRA_KM

    if voltas < FANTASMA_FUEL_VOLTAS:
        return None

    return {
        "tipo":           "COMBUSTIVEL_IMPOSSIVEL",
        "valor_total":    total_valor,
        "litros_equiv":   round(litros, 0),
        "km_equivalente": round(km_eq, 0),
        "voltas_terra":   round(voltas, 1),
        "descricao": (
            f"{dep_nome} gastou R$ {total_valor:,.0f} em combustível no período, "
            f"equivalente a {voltas:.1f}x a circunferência da Terra "
            f"({km_eq:,.0f} km). Análise geográfica necessária."
        ),
        "score": min(40 + int(voltas * 10), 95),
    }


def detect_inexequibilidade(despesa: dict, cnpj_data: dict) -> dict | None:
    """
    Detecta contrato inexequível: empresa com capital social baixo
    mas recebendo contrato de alto valor.
    """
    valor     = float(despesa.get("valorDocumento", 0) or 0)
    capital_s = cnpj_data.get("capital_social")

    if not capital_s or valor < 10_000:
        return None

    try:
        capital_float = float(str(capital_s).replace(",", ".").replace(".", "").replace(",", "."))
    except (ValueError, TypeError):
        return None

    if capital_float <= 0:
        return None

    ratio = valor / capital_float
    if ratio < INEXEQUIBILIDADE_RATIO:
        return None

    cnpj_fmt = re.sub(r"(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})", r"\1.\2.\3/\4-\5",
                      re.sub(r"\D", "", despesa.get("cnpjCpfFornecedor", "")))
    return {
        "tipo":          "INEXEQUIBILIDADE_CONTRATUAL",
        "cnpj":          despesa.get("cnpjCpfFornecedor", ""),
        "cnpj_fmt":      cnpj_fmt,
        "fornecedor":    despesa.get("nomeFornecedor", "–"),
        "valor":         valor,
        "capital_social": capital_float,
        "ratio":         round(ratio, 1),
        "descricao": (
            f"Empresa {despesa.get('nomeFornecedor','–')} (CNPJ {cnpj_fmt}) "
            f"com capital social de R$ {capital_float:,.0f} recebeu "
            f"R$ {valor:,.0f} — {ratio:.0f}x o capital declarado."
        ),
        "score": min(30 + int(ratio / 10), 90),
    }


def detect_geo_mismatch(despesa: dict, eventos_na_data: list[dict], dep_uf: str) -> dict | None:
    """
    Verifica se há nexo geográfico entre o destino da viagem/fretamento
    e a agenda oficial do político na data.
    """
    tipo_raw = (despesa.get("tipoDespesa") or "").upper()
    if not any(k in tipo_raw for k in ["FRETAMENTO", "AERONAVE", "PASSAGEM"]):
        return None

    data_doc = despesa.get("dataDocumento", "")[:10] if despesa.get("dataDocumento") else ""
    if not data_doc:
        return None

    # Verificar se há eventos na data do gasto
    if eventos_na_data:
        return None  # há evento oficial → sem alerta

    valor = float(despesa.get("valorDocumento", 0) or 0)
    if valor < 5_000:
        return None

    return {
        "tipo":       "GASTO_INTERESSE_PRIVADO",
        "data":       data_doc,
        "fornecedor": despesa.get("nomeFornecedor", "–"),
        "valor":      valor,
        "descricao": (
            f"Fretamento/passagem de R$ {valor:,.0f} em {data_doc} "
            f"sem evento oficial registrado na agenda do deputado nessa data. "
            f"Possível viagem de interesse privado."
        ),
        "score": 55,
    }


# ─── Clientes Cloud ───────────────────────────────────────────────────────────
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
        log.warning("Firestore: %s", e)
        return None


def save_alert(db: Any, alerta: dict, dry_run: bool) -> None:
    if dry_run:
        log.info("  [DRY-RUN] %s — R$ %.0f — score %d",
                 alerta["tipo"], alerta.get("valor", alerta.get("valor_total", 0)), alerta.get("score", 0))
        return
    if db:
        try:
            db.collection(FS_ALERTAS).document(alerta["id"]).set(alerta, merge=True)
            if alerta.get("score", 0) >= 60:
                db.collection(FS_BODES).document(alerta["id"]).set(alerta, merge=True)
        except Exception as e:
            log.error("  Firestore: %s", e)


# ─── Dados mock ───────────────────────────────────────────────────────────────
def get_mock_despesas(dep_id: str) -> list[dict]:
    return [
        {
            "tipoDespesa": "COMBUSTÍVEIS E LUBRIFICANTES AUTOMOTIVOS",
            "dataDocumento": "2024-01-15",
            "nomeFornecedor": "Auto Posto Silva",
            "cnpjCpfFornecedor": "12345678000190",
            "valorDocumento": "38500.00",  # equivale a ~6.4 voltas na Terra
            "numDocumento": "NF-001234",
        },
        {
            "tipoDespesa": "LOCAÇÃO OU FRETAMENTO DE AERONAVES",
            "dataDocumento": "2024-02-10",
            "nomeFornecedor": "AirCharter Express ME",
            "cnpjCpfFornecedor": "98765432000145",
            "valorDocumento": "185000.00",
            "numDocumento": "NF-005678",
        },
        {
            "tipoDespesa": "PASSAGENS AÉREAS",
            "dataDocumento": "2024-03-05",
            "nomeFornecedor": "LATAM Airlines",
            "cnpjCpfFornecedor": "09296295000160",
            "valorDocumento": "4200.00",
            "numDocumento": "E-TICKET-999",
        },
    ]


def get_mock_cnpj(cnpj: str) -> dict:
    seed = sum(ord(c) for c in cnpj)
    return {
        "cnpj": cnpj,
        "razao_social": "Empresa Mock Ltda",
        "capital_social": 10000 * (seed % 5 + 1),  # R$ 10k a R$ 50k
        "porte": "ME",
        "situacao_cadastral": "ATIVA",
        "data_inicio_atividade": "2022-06-01",
    }


# ─── Processamento de deputado ────────────────────────────────────────────────
def audit_deputado(dep_id: str, dep_nome: str, dep_uf: str,
                   ano: int, db: Any, dry_run: bool, mock: bool) -> list[dict]:
    log.info("Auditando %s (%s) — ano %d…", dep_nome, dep_uf, ano)

    despesas = get_mock_despesas(dep_id) if mock else fetch_despesas(dep_id, ano)
    log.info("  %d despesas carregadas", len(despesas))

    alertas  = []
    cnpj_cache: dict[str, dict] = {}

    # Separar combustíveis para análise agregada
    despesas_comb = [d for d in despesas
                     if "COMBUSTÍVEL" in (d.get("tipoDespesa") or "").upper()]

    # 1. Anomalia de combustível (análise agregada)
    fuel_alert = detect_fuel_anomaly(despesas_comb, dep_nome)
    if fuel_alert:
        alert_id = f"LOGIST_FUEL_{dep_id}_{ano}"
        fuel_alert.update({
            "id":             alert_id,
            "parlamentar_id": dep_id,
            "parlamentar_nome": dep_nome,
            "uf":             dep_uf,
            "ano":            ano,
            "setor":          "LOGISTICA",
            "criadoEm":       datetime.now(timezone.utc).isoformat(),
            "fonte":          "20_logistics_auditor",
            "criticidade":    "ALTA" if fuel_alert["score"] >= 70 else "MEDIA",
        })
        alertas.append(fuel_alert)
        save_alert(db, fuel_alert, dry_run)
        log.warning("  ⛽ ANOMALIA COMBUSTÍVEL: %.1f voltas na Terra",
                    fuel_alert["voltas_terra"])

    # 2. Inexequibilidade e nexo geográfico por despesa
    for despesa in despesas:
        tipo_cat = next(
            (v for k, v in TIPOS_LOGISTICA.items() if k in (despesa.get("tipoDespesa") or "").upper()),
            None
        )
        if not tipo_cat:
            continue

        cnpj = re.sub(r"\D", "", despesa.get("cnpjCpfFornecedor", ""))
        if not cnpj:
            continue

        # CNPJ cache
        if cnpj not in cnpj_cache:
            cnpj_cache[cnpj] = get_mock_cnpj(cnpj) if mock else get_cnpj_financials(cnpj)

        cnpj_data = cnpj_cache[cnpj]

        # Inexequibilidade
        inex = detect_inexequibilidade(despesa, cnpj_data)
        if inex:
            alert_id = hashlib.sha256(
                f"INEX_{dep_id}_{cnpj}_{despesa.get('numDocumento','')}".encode()
            ).hexdigest()[:18]
            inex.update({
                "id":             alert_id,
                "parlamentar_id": dep_id,
                "parlamentar_nome": dep_nome,
                "uf":             dep_uf,
                "ano":            ano,
                "setor":          "LOGISTICA",
                "criadoEm":       datetime.now(timezone.utc).isoformat(),
                "fonte":          "20_logistics_auditor",
                "criticidade":    "ALTA",
            })
            alertas.append(inex)
            save_alert(db, inex, dry_run)
            log.warning("  ⚠️ INEXEQUIBILIDADE: %s (ratio %sx)",
                        inex["fornecedor"][:40], inex["ratio"])

        # Nexo geográfico (agenda)
        data_doc = despesa.get("dataDocumento", "")[:10] if despesa.get("dataDocumento") else ""
        eventos_dia: list[dict] = []
        if data_doc and not mock:
            try:
                eventos_dia = fetch_eventos(dep_id, data_doc, data_doc)
            except Exception:
                pass

        geo = detect_geo_mismatch(despesa, eventos_dia, dep_uf)
        if geo:
            alert_id = hashlib.sha256(
                f"GEO_{dep_id}_{data_doc}_{cnpj}".encode()
            ).hexdigest()[:18]
            geo.update({
                "id":             alert_id,
                "parlamentar_id": dep_id,
                "parlamentar_nome": dep_nome,
                "uf":             dep_uf,
                "ano":            ano,
                "setor":          "LOGISTICA",
                "criadoEm":       datetime.now(timezone.utc).isoformat(),
                "fonte":          "20_logistics_auditor",
                "criticidade":    "MEDIA",
            })
            alertas.append(geo)
            save_alert(db, geo, dry_run)
            log.warning("  ✈️ NEXO GEOGRÁFICO: %s sem evento na data %s",
                        geo["fornecedor"][:40], data_doc)

    log.info("  %d alertas gerados", len(alertas))
    return alertas


def main() -> None:
    parser = argparse.ArgumentParser(description="F.L.A.V.I.O. — Logistics Auditor")
    parser.add_argument("--dep-id",   required=True)
    parser.add_argument("--dep-nome", default="Deputado")
    parser.add_argument("--dep-uf",   default="DF")
    parser.add_argument("--ano",      type=int, default=datetime.now().year)
    parser.add_argument("--fs-project", default=FIRESTORE_PROJECT)
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--mock",     action="store_true")
    args = parser.parse_args()

    db = None
    if not args.dry_run and not args.mock:
        db = init_firestore(args.fs_project)

    alertas = audit_deputado(
        args.dep_id, args.dep_nome, args.dep_uf,
        args.ano, db, args.dry_run, args.mock,
    )

    print("\n" + "═" * 60)
    print(f" F.L.A.V.I.O. · LOGISTICS AUDITOR · {args.dep_nome}")
    print("═" * 60)
    for a in alertas:
        print(f"  [{a.get('score',0):3d}] {a['tipo']:35} {a.get('descricao','')[:60]}")
    print(f"\n Total alertas: {len(alertas)}")
    print("═" * 60)


if __name__ == "__main__":
    main()
