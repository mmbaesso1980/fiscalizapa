"""
IBGE — ingestão nativa de municípios → BigQuery (fiscalizapa.ibge_municipios).

Substitui fluxos bash legados: uma única requisição à API oficial, saneamento e carga.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pandas as pd
from google.cloud import bigquery

IBGE_MUNICIPIOS_URL = (
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
)
DEFAULT_TABLE_ID = "fiscalizapa.ibge_municipios"


def _load_bq_setup():
    engines_dir = Path(__file__).resolve().parent
    path = engines_dir / "01_bq_setup.py"
    spec = importlib.util.spec_from_file_location("engines_01_bq_setup", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Não foi possível carregar {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_bq = _load_bq_setup()
sanitize_and_load = _bq.sanitize_and_load


def fetch_municipios_json(timeout_s: int = 120) -> list:
    req = Request(IBGE_MUNICIPIOS_URL, headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
    except HTTPError as e:
        raise SystemExit(f"IBGE HTTP {e.code}: {e.reason}") from e
    except URLError as e:
        raise SystemExit(f"IBGE rede/URL: {e.reason}") from e
    data = json.loads(raw)
    if not isinstance(data, list):
        raise SystemExit("Resposta IBGE inesperada: esperado array JSON.")
    return data


def _uf_regiao_from_municipio(m: dict) -> tuple[str, str]:
    """Extrai (uf_sigla, regiao_nome) da estrutura aninhada do IBGE (layout clássico ou região imediata)."""
    mic = m.get("microrregiao")
    if isinstance(mic, dict):
        meso = mic.get("mesorregiao") or {}
        if isinstance(meso, dict):
            uf_obj = meso.get("UF") or {}
            if isinstance(uf_obj, dict) and uf_obj:
                uf = str(uf_obj.get("sigla") or "").strip()
                reg_obj = uf_obj.get("regiao") or {}
                regiao = str(reg_obj.get("nome") or "").strip() if isinstance(reg_obj, dict) else ""
                return uf, regiao

    ri = m.get("regiao-imediata")
    if isinstance(ri, dict):
        rir = ri.get("regiao-intermediaria") or {}
        if isinstance(rir, dict):
            uf_obj = rir.get("UF") or {}
            if isinstance(uf_obj, dict) and uf_obj:
                uf = str(uf_obj.get("sigla") or "").strip()
                reg_obj = uf_obj.get("regiao") or {}
                regiao = str(reg_obj.get("nome") or "").strip() if isinstance(reg_obj, dict) else ""
                return uf, regiao

    return "", ""


def municipios_to_dataframe(items: list) -> pd.DataFrame:
    rows = []
    for m in items:
        if not isinstance(m, dict):
            continue
        mid = m.get("id")
        # STRING desde a origem: evita INT64 no BigQuery e preserva formato textual do id.
        id_municipio = "" if mid is None else str(mid).strip()

        nome = (m.get("nome") or "").strip() if isinstance(m.get("nome"), str) else ""

        uf, regiao = _uf_regiao_from_municipio(m)

        rows.append(
            {
                "id_municipio": id_municipio,
                "nome": nome,
                "uf": uf,
                "regiao": regiao,
            }
        )

    return pd.DataFrame(rows)


def build_schema() -> list[bigquery.SchemaField]:
    return [
        bigquery.SchemaField("id_municipio", "STRING"),
        bigquery.SchemaField("nome", "STRING"),
        bigquery.SchemaField("uf", "STRING"),
        bigquery.SchemaField("regiao", "STRING"),
    ]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="IBGE municípios → BigQuery")
    p.add_argument(
        "--table",
        default=DEFAULT_TABLE_ID,
        help=f"Tabela destino (default: {DEFAULT_TABLE_ID})",
    )
    p.add_argument(
        "--append",
        action="store_true",
        help="WRITE_APPEND. Sem esta flag, substitui o conteúdo (WRITE_TRUNCATE).",
    )
    p.add_argument(
        "--project",
        default=None,
        help="Projeto GCP do BigQuery (default: GCP_PROJECT_ID ou projeto-codex-br).",
    )
    p.add_argument("--timeout", type=int, default=120, help="Timeout HTTP (s).")
    args = p.parse_args(argv)

    items = fetch_municipios_json(timeout_s=args.timeout)
    df = municipios_to_dataframe(items)
    if df.empty:
        print("Nenhum município retornado; abortando.", file=sys.stderr)
        return 1

    disposition = "WRITE_APPEND" if args.append else "WRITE_TRUNCATE"
    schema = build_schema()
    str_cols = ["id_municipio", "nome", "uf", "regiao"]

    job = sanitize_and_load(
        df,
        args.table,
        project_id=args.project,
        str_columns=str_cols,
        write_disposition=disposition,
        schema=schema,
    )
    out_rows = getattr(job, "output_rows", None)
    if out_rows is None:
        out_rows = len(df)
    print(f"Carga concluída: {args.table} ({out_rows} linhas, {disposition}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
