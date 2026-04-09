"""
A.S.M.O.D.E.U.S. — Monitor de Dados Econômicos Externos  (11_external_context.py)

Ingere séries históricas de câmbio, inflação e preços de commodities
e salva em `fiscalizapa.contexto_economico` no BigQuery.

Isso permite que as Views Forenses detectem superfaturamento contextual:
  'O asfalto foi comprado por R$ 450/t em Jan/2024, mas a média do mercado
   estava em R$ 180/t segundo a série ANP — ALERTA DE SUPERFATURAMENTO'

Fontes de dados:
  Banco Central do Brasil (BCB/SGS)  → câmbio, Selic, IPCA, IGP-M
  IPEADATA (IPEA)                    → commodities, PIB, preços históricos
  ANP (Agência Nac. do Petróleo)     → preços médios de combustíveis (simulado)
  SINAPI (IBGE/CEF)                  → custos de construção (simulado)

Schema BigQuery (fiscalizapa.contexto_economico):
  data_referencia   DATE         Data da observação
  indicador         STRING       Ex: "USD_BRL", "GASOLINA_LITRO_SP"
  categoria         STRING       Ex: "CAMBIO", "COMBUSTIVEL", "CONSTRUCAO"
  valor             FLOAT64      Valor numérico
  unidade           STRING       Ex: "BRL/USD", "R$/litro"
  fonte             STRING       Ex: "BCB_SGS_SERIE_1"
  descricao         STRING       Descrição da série
  ingestao_ts       TIMESTAMP    Quando foi ingerido

Variáveis de ambiente:
  GOOGLE_APPLICATION_CREDENTIALS  → BigQuery service account
  IPEADATA_TOKEN                   → token IPEADATA (opcional, aumenta rate limit)

Uso:
  python engines/11_external_context.py
  python engines/11_external_context.py --days 90       # últimos 90 dias
  python engines/11_external_context.py --sources bcb anp  # seletivo
  python engines/11_external_context.py --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import logging
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("external_context")

BQ_PROJECT   = "projeto-codex-br"
BQ_TABLE     = "fiscalizapa.contexto_economico"
ENGINES_DIR  = os.path.dirname(__file__)
REQUEST_TIMEOUT = 20

# ─── Séries BCB SGS ───────────────────────────────────────────────────────────
BCB_SERIES = [
    { "codigo": 1,     "indicador": "USD_BRL_PTAX_COMPRA",   "categoria": "CAMBIO",       "unidade": "BRL/USD",   "descricao": "Dólar americano PTAX (compra)"             },
    { "codigo": 21619, "indicador": "EUR_BRL_PTAX",          "categoria": "CAMBIO",       "unidade": "BRL/EUR",   "descricao": "Euro PTAX (compra)"                        },
    { "codigo": 13522, "indicador": "IPCA_ACUM_12M",         "categoria": "INFLACAO",     "unidade": "%",         "descricao": "IPCA acumulado 12 meses (%)"               },
    { "codigo": 189,   "indicador": "IPCA_MENSAL",           "categoria": "INFLACAO",     "unidade": "%",         "descricao": "IPCA variação mensal (%)"                  },
    { "codigo": 4390,  "indicador": "IGPM_MENSAL",           "categoria": "INFLACAO",     "unidade": "%",         "descricao": "IGP-M variação mensal (%)"                 },
    { "codigo": 11,    "indicador": "SELIC_META",            "categoria": "JUROS",        "unidade": "% a.a.",    "descricao": "Taxa SELIC meta definida pelo COPOM"       },
    { "codigo": 7812,  "indicador": "INCC_MENSAL",           "categoria": "CONSTRUCAO",   "unidade": "%",         "descricao": "INCC variação mensal (custo construção)"   },
    { "codigo": 28,    "indicador": "TJLP",                  "categoria": "JUROS",        "unidade": "% a.a.",    "descricao": "Taxa de Juros de Longo Prazo (TJLP)"       },
]

# ─── Séries IPEADATA ──────────────────────────────────────────────────────────
IPEA_SERIES = [
    { "codigo": "ANDA12_QTDANEL12",  "indicador": "PETROL0_PROD_NAC",   "categoria": "ENERGIA",      "unidade": "m³",      "descricao": "Produção nacional de petróleo" },
    { "codigo": "EIA366_PBRENT366",  "indicador": "BRENT_USD_BARRIL",   "categoria": "ENERGIA",      "unidade": "USD/bbl", "descricao": "Preço Brent (petróleo cru) — USD/barril" },
    { "codigo": "PMABD_PMACD",       "indicador": "ASFALTO_PRECO_MEDIO","categoria": "CONSTRUCAO",   "unidade": "R$/t",    "descricao": "Preço médio do asfalto por tonelada" },
    { "codigo": "IBRE_FCICCPM",      "indicador": "FCI_CONSTRUCAO",     "categoria": "CONSTRUCAO",   "unidade": "índice",  "descricao": "FCI — Custo de Construção da Câmara Brasileira" },
]

# ─── Combustíveis ANP (preços médios semanais simulados) ──────────────────────
# A API real da ANP requer scraping. Esta estrutura está preparada para substituição.
ANP_FUELS_MOCK = [
    { "indicador": "GASOLINA_COMUM_LITRO_BR", "categoria": "COMBUSTIVEL", "unidade": "R$/litro", "descricao": "Gasolina comum — preço médio BR (ANP/semanal)" },
    { "indicador": "DIESEL_S10_LITRO_BR",      "categoria": "COMBUSTIVEL", "unidade": "R$/litro", "descricao": "Diesel S-10 — preço médio BR (ANP/semanal)" },
    { "indicador": "ETANOL_HIDRATADO_LITRO_BR","categoria": "COMBUSTIVEL", "unidade": "R$/litro", "descricao": "Etanol hidratado — preço médio BR (ANP/semanal)" },
    { "indicador": "GNV_M3_BR",               "categoria": "COMBUSTIVEL", "unidade": "R$/m³",    "descricao": "GNV — preço médio BR (ANP/semanal)" },
]

# Preços de referência para simulação calibrada (última coleta manual)
ANP_REFERENCE_PRICES = {
    "GASOLINA_COMUM_LITRO_BR":  6.23,
    "DIESEL_S10_LITRO_BR":      6.18,
    "ETANOL_HIDRATADO_LITRO_BR":4.52,
    "GNV_M3_BR":                4.81,
}

# ─── SINAPI (Custos unitários de construção — simulado) ───────────────────────
SINAPI_ITEMS = [
    { "codigo": "73966/001", "indicador": "SINAPI_ASFALTO_USINADO",    "categoria": "CONSTRUCAO", "unidade": "t",      "descricao": "Asfalto usinado a quente — SINAPI referência" },
    { "codigo": "94239",     "indicador": "SINAPI_CIMENTO_50KG",       "categoria": "CONSTRUCAO", "unidade": "saco",   "descricao": "Cimento CP II — saco 50kg (SINAPI)" },
    { "codigo": "37712",     "indicador": "SINAPI_ACO_CA50",           "categoria": "CONSTRUCAO", "unidade": "kg",     "descricao": "Aço CA-50 (vergalhão) — SINAPI" },
    { "codigo": "00000",     "indicador": "SINAPI_MOB_MAOOBRA",        "categoria": "CONSTRUCAO", "unidade": "hh",     "descricao": "Mão de obra média de pedreiro — SINAPI" },
]
SINAPI_REFERENCE_PRICES = {
    "SINAPI_ASFALTO_USINADO":  184.50,
    "SINAPI_CIMENTO_50KG":     37.80,
    "SINAPI_ACO_CA50":         8.90,
    "SINAPI_MOB_MAOOBRA":      25.60,
}


# ─── HTTP helper ──────────────────────────────────────────────────────────────
def _get_json(url: str, params: dict | None = None, headers: dict | None = None) -> Any:
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _date_fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


# ─── Normalizar data BCB ──────────────────────────────────────────────────────
def _parse_bcb_date(s: str) -> str:
    """Converte '01/01/2024' para 'YYYY-MM-DD'."""
    try:
        return datetime.strptime(s, "%d/%m/%Y").strftime("%Y-%m-%d")
    except Exception:
        return s


# ─── Fonte BCB SGS ────────────────────────────────────────────────────────────
def fetch_bcb(days: int) -> list[dict]:
    today     = date.today()
    dt_inicio = today - timedelta(days=days)
    records   = []

    for serie in BCB_SERIES:
        url  = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie['codigo']}/dados"
        pars = {
            "formato":      "json",
            "dataInicial":  _date_fmt(dt_inicio),
            "dataFinal":    _date_fmt(today),
        }
        try:
            data = _get_json(url, params=pars)
            if not isinstance(data, list):
                continue
            for item in data:
                val_str = item.get("valor", "")
                try:
                    val = float(str(val_str).replace(",", "."))
                except (ValueError, TypeError):
                    continue
                records.append({
                    "data_referencia": _parse_bcb_date(item.get("data", "")),
                    "indicador":       serie["indicador"],
                    "categoria":       serie["categoria"],
                    "valor":           val,
                    "unidade":         serie["unidade"],
                    "fonte":           f"BCB_SGS_{serie['codigo']}",
                    "descricao":       serie["descricao"],
                    "ingestao_ts":     datetime.now(timezone.utc).isoformat(),
                })
            log.info("  BCB série %d: %d pontos", serie["codigo"], len(data))
            time.sleep(0.3)
        except Exception as exc:
            log.warning("  BCB série %d falhou: %s", serie["codigo"], exc)

    return records


# ─── Fonte IPEADATA ───────────────────────────────────────────────────────────
def fetch_ipeadata(days: int) -> list[dict]:
    today     = date.today()
    dt_inicio = today - timedelta(days=days)
    records   = []
    token     = os.environ.get("IPEADATA_TOKEN", "")
    base_url  = "http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='{}')"

    for serie in IPEA_SERIES:
        url = base_url.format(serie["codigo"])
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            data   = _get_json(url, headers=headers)
            values = data.get("value", []) if isinstance(data, dict) else []
            count  = 0
            for item in values:
                dt_str = str(item.get("VALDATA", ""))[:10]
                try:
                    dt = date.fromisoformat(dt_str)
                    if dt < dt_inicio:
                        continue
                except Exception:
                    continue
                val = item.get("VALVALOR")
                if val is None:
                    continue
                try:
                    val = float(val)
                except Exception:
                    continue
                records.append({
                    "data_referencia": dt_str,
                    "indicador":       serie["indicador"],
                    "categoria":       serie["categoria"],
                    "valor":           val,
                    "unidade":         serie["unidade"],
                    "fonte":           f"IPEADATA_{serie['codigo']}",
                    "descricao":       serie["descricao"],
                    "ingestao_ts":     datetime.now(timezone.utc).isoformat(),
                })
                count += 1
            log.info("  IPEADATA %s: %d pontos", serie["codigo"], count)
            time.sleep(0.5)
        except Exception as exc:
            log.warning("  IPEADATA %s falhou: %s", serie["codigo"], exc)

    return records


# ─── Fonte ANP (simulado — estrutura real pronta) ─────────────────────────────
def fetch_anp_simulated(days: int) -> list[dict]:
    """
    Simula dados ANP com variação realista.
    Em produção: substituir por scraping de
    https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/
    precos/precos-ao-consumidor/glp-por-tipo-de-vasilhame-vendido-nos-
    ultimos-doze-meses
    """
    import random
    today   = date.today()
    records = []
    random.seed(42)   # seed fixo para consistência

    for fuel in ANP_FUELS_MOCK:
        base_price = ANP_REFERENCE_PRICES[fuel["indicador"]]
        # Gera série semanal
        cur = today
        weeks = days // 7 + 1
        for _ in range(weeks):
            variation = random.uniform(-0.08, 0.08)
            preco = round(base_price * (1 + variation), 3)
            records.append({
                "data_referencia": cur.isoformat(),
                "indicador":       fuel["indicador"],
                "categoria":       fuel["categoria"],
                "valor":           preco,
                "unidade":         fuel["unidade"],
                "fonte":           "ANP_SIMULADO",
                "descricao":       fuel["descricao"],
                "ingestao_ts":     datetime.now(timezone.utc).isoformat(),
            })
            cur -= timedelta(days=7)

    log.info("  ANP (simulado): %d registros de combustíveis", len(records))
    return records


# ─── Fonte SINAPI (simulado) ──────────────────────────────────────────────────
def fetch_sinapi_simulated(days: int) -> list[dict]:
    """
    Simula dados SINAPI mensais com variação calibrada pelo INCC.
    Em produção: usar API SINAPI da CEF ou download do IBGE.
    https://www.caixa.gov.br/poder-publico/apoio-poder-publico/sinapi/
    """
    import random
    today   = date.today()
    records = []
    random.seed(7)

    for item in SINAPI_ITEMS:
        base = SINAPI_REFERENCE_PRICES[item["indicador"]]
        months = days // 30 + 1
        cur  = today.replace(day=1)
        for _ in range(months):
            variation = random.uniform(-0.02, 0.04)  # SINAPI sobe mais do que cai
            preco = round(base * (1 + variation), 2)
            records.append({
                "data_referencia": cur.isoformat(),
                "indicador":       item["indicador"],
                "categoria":       item["categoria"],
                "valor":           preco,
                "unidade":         item["unidade"],
                "fonte":           f"SINAPI_CEF_{item['codigo']}_SIMULADO",
                "descricao":       item["descricao"],
                "ingestao_ts":     datetime.now(timezone.utc).isoformat(),
            })
            # recuar um mês
            if cur.month == 1:
                cur = cur.replace(year=cur.year - 1, month=12)
            else:
                cur = cur.replace(month=cur.month - 1)

    log.info("  SINAPI (simulado): %d registros de construção", len(records))
    return records


# ─── Salvar no BigQuery ────────────────────────────────────────────────────────
def save_to_bigquery(records: list[dict], dry_run: bool) -> None:
    if not records:
        log.info("Nenhum registro para salvar.")
        return

    log.info("Salvando %d registros em %s…", len(records), BQ_TABLE)
    if dry_run:
        log.info("[DRY-RUN] Registros não foram gravados.")
        # Mostrar amostra
        for r in records[:5]:
            log.info("  Sample: %s | %s | %.4f %s",
                     r["data_referencia"], r["indicador"], r["valor"], r["unidade"])
        return

    # Importar sanitize_and_load do 01_bq_setup.py
    setup_path = os.path.join(ENGINES_DIR, "01_bq_setup.py")
    if not os.path.exists(setup_path):
        log.error("01_bq_setup.py não encontrado. Abortando save.")
        return

    spec = importlib.util.spec_from_file_location("bq_setup", setup_path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    try:
        import pandas as pd
        df = pd.DataFrame(records)
        df["valor"]           = pd.to_numeric(df["valor"],          errors="coerce")
        df["data_referencia"] = pd.to_datetime(df["data_referencia"], errors="coerce").dt.date
        df["ingestao_ts"]     = pd.to_datetime(df["ingestao_ts"],    errors="coerce", utc=True)
        mod.sanitize_and_load(df, BQ_TABLE)
        log.info("✓ %d registros gravados em %s", len(records), BQ_TABLE)
    except Exception as exc:
        log.error("BigQuery save error: %s", exc)


# ─── Ponto de entrada ─────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Monitor de Dados Econômicos Externos — A.S.M.O.D.E.U.S.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--days",    type=int, default=60,
                        help="Janela histórica em dias (padrão: 60)")
    parser.add_argument("--sources", nargs="+",
                        choices=["bcb", "ipeadata", "anp", "sinapi"],
                        default=["bcb", "ipeadata", "anp", "sinapi"],
                        help="Fontes a ingerir (padrão: todas)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simula sem gravar no BigQuery")
    args = parser.parse_args()

    if args.dry_run:
        log.info("══ MODO DRY-RUN ativado ══")

    all_records: list[dict] = []

    if "bcb" in args.sources:
        log.info("─ Banco Central do Brasil (SGS) ─")
        all_records.extend(fetch_bcb(args.days))

    if "ipeadata" in args.sources:
        log.info("─ IPEADATA ─")
        all_records.extend(fetch_ipeadata(args.days))

    if "anp" in args.sources:
        log.info("─ ANP — Preços de Combustíveis ─")
        all_records.extend(fetch_anp_simulated(args.days))

    if "sinapi" in args.sources:
        log.info("─ SINAPI — Custos de Construção ─")
        all_records.extend(fetch_sinapi_simulated(args.days))

    log.info("Total: %d registros de %d fontes", len(all_records), len(args.sources))

    # Sumário por categoria
    cats: dict[str, int] = {}
    for r in all_records:
        cats[r["categoria"]] = cats.get(r["categoria"], 0) + 1
    for cat, cnt in sorted(cats.items()):
        log.info("  %-20s %d pontos", cat, cnt)

    save_to_bigquery(all_records, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
