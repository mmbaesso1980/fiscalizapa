"""
Emendas parlamentares (Portal da Transparência) → BigQuery (fiscalizapa.emendas_parlamentares).

Mesmo padrão de 02_ingest_ibge.py: import dinâmico de sanitize_and_load, schema explícito,
tipagem via pandas (IDs STRING, valores financeiros FLOAT).

Fonte da API alinhada a engines/scripts/run-ingest-emendas-v4.js.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import firebase_admin
import pandas as pd
from firebase_admin import credentials, firestore
from google.cloud import bigquery

PORTAL_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados"
DEFAULT_TABLE_ID = "fiscalizapa.emendas_parlamentares"

IDH_UF: dict[str, float] = {
    "AC": 0.663, "AL": 0.649, "AM": 0.674, "AP": 0.674, "BA": 0.667, "CE": 0.682, "DF": 0.824,
    "ES": 0.740, "GO": 0.735, "MA": 0.639, "MG": 0.731, "MS": 0.729, "MT": 0.725, "PA": 0.646,
    "PB": 0.658, "PE": 0.673, "PI": 0.646, "PR": 0.749, "RJ": 0.761, "RN": 0.684, "RO": 0.690,
    "RR": 0.674, "RS": 0.769, "SC": 0.774, "SE": 0.665, "SP": 0.783, "TO": 0.699,
}


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


def normalize_nome_autor(name: str) -> str:
    s = unicodedata.normalize("NFD", name.upper().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def analisar_emenda(e: dict[str, Any]) -> dict[str, Any]:
    """Réplica da lógica de alertas / métricas do script Node legado."""
    alertas: list[str] = []
    emp = float(e.get("valorEmpenhado") or 0)
    pag = float(e.get("valorPago") or 0)
    taxa = (pag / emp * 100.0) if emp > 0 else 0.0
    if emp > 0 and taxa < 30:
        alertas.append(f"BAIXA EXECUCAO: {taxa:.0f}% pago.")
    if emp > 0 and pag == 0:
        alertas.append("SEM PAGAMENTO.")
    if emp > 5_000_000:
        alertas.append(f"VALOR ELEVADO: R$ {emp / 1e6:.1f}M.")
    loc = str(e.get("localidadeDoGasto") or "")
    uf = loc[:2].upper() if len(loc) >= 2 else ""
    idh = IDH_UF.get(uf)
    if idh is not None and idh < 0.67:
        alertas.append(f"REGIAO VULNERAVEL: IDH {idh:.3f} ({uf}).")
    tipo = str(e.get("tipoEmenda") or "").upper()
    if "RELATOR" in tipo:
        alertas.append("EMENDA DE RELATOR (RP9).")
    if "ESPECIAL" in tipo:
        alertas.append("TRANSFERENCIA ESPECIAL.")
    funcao = str(e.get("nomeFuncao") or e.get("codigoFuncao") or "").upper()
    is_show = "CULTURA" in funcao or "DESPORTO" in funcao or "LAZER" in funcao
    if is_show and idh is not None and idh < 0.70:
        alertas.append("SHOW EM REGIAO CARENTE.")
    if is_show and emp > 1_000_000:
        alertas.append(f"SHOW MILIONARIO: R$ {emp / 1e6:.1f}M.")
    criticidade = "ALTA" if len(alertas) >= 3 else "MEDIA" if len(alertas) >= 1 else "BAIXA"
    return {
        "taxa_execucao": round(taxa, 4),
        "alertas": alertas,
        "criticidade": criticidade,
        "idh_local": idh,
        "uf_gasto": uf,
        "is_show": is_show,
    }


def make_emenda_id(parlamentar_id: str, ano_consulta: int, e: dict[str, Any]) -> str:
    codigo = e.get("codigoEmenda")
    if codigo is not None and str(codigo).strip():
        return str(codigo).strip()
    base = json.dumps(
        {
            "pid": parlamentar_id,
            "ano": ano_consulta,
            "loc": e.get("localidadeDoGasto"),
            "emp": e.get("valorEmpenhado"),
            "tipo": e.get("tipoEmenda"),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:32]


def fetch_page(
    api_key: str,
    nome_autor: str,
    ano: int,
    pagina: int,
    *,
    timeout: int = 90,
    max_429_retries: int = 8,
) -> list:
    qs = urlencode({"ano": ano, "nomeAutor": nome_autor, "pagina": pagina})
    url = f"{PORTAL_BASE}/emendas?{qs}"
    req = Request(
        url,
        headers={
            "chave-api-dados": api_key,
            "Accept": "application/json",
        },
    )
    for _ in range(max_429_retries):
        try:
            with urlopen(req, timeout=timeout) as resp:
                status = getattr(resp, "status", 200)
                if status == 429:
                    time.sleep(10)
                    continue
                raw = resp.read().decode("utf-8")
        except HTTPError as e:
            if e.code == 429:
                time.sleep(10)
                continue
            return []
        except URLError as e:
            print(f"FETCH ERROR: {e.reason}", file=sys.stderr)
            return []
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if not isinstance(data, list):
            return []
        return data
    return []


def fetch_all_emendas_for_author(
    api_key: str,
    nome_normalizado: str,
    ano: int,
    *,
    page_delay_s: float = 0.7,
    timeout: int = 90,
) -> list[dict[str, Any]]:
    todas: list[dict[str, Any]] = []
    pagina = 1
    while True:
        page = fetch_page(api_key, nome_normalizado, ano, pagina, timeout=timeout)
        if not page:
            break
        todas.extend({**item, "_ano_consulta": ano} for item in page)
        if len(page) < 15:
            break
        pagina += 1
        time.sleep(page_delay_s)
    return todas


def get_firestore_deputados(project_id: str) -> list[dict[str, Any]]:
    if not firebase_admin._apps:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, options={"projectId": project_id})
    db = firestore.client()
    snap = db.collection("deputados_federais").stream()
    out: list[dict[str, Any]] = []
    for doc in snap:
        data = doc.to_dict() or {}
        nome = data.get("nome")
        if not nome:
            continue
        out.append({"id": doc.id, "nome": str(nome), **data})
    return out


def emendas_to_rows(
    deputado: dict[str, Any],
    emendas: list[dict[str, Any]],
    ingested_at: pd.Timestamp,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    pid = str(deputado["id"])
    pnome = str(deputado.get("nome") or "")
    partido = str(deputado.get("partido") or "")
    puf = str(deputado.get("uf") or "")

    for e in emendas:
        ano_consulta = int(e.get("_ano_consulta") or e.get("ano") or 0)
        a = analisar_emenda(e)
        emenda_id = make_emenda_id(pid, ano_consulta, e)
        ano_emenda = e.get("ano")
        try:
            ano_val = int(ano_emenda) if ano_emenda is not None else ano_consulta
        except (TypeError, ValueError):
            ano_val = ano_consulta

        idh = a["idh_local"]
        rows.append(
            {
                "emenda_id": emenda_id,
                "parlamentar_id": pid,
                "parlamentar_nome": pnome,
                "autor_partido": partido,
                "autor_uf": puf,
                "codigo_emenda": str(e.get("codigoEmenda") or "").strip(),
                "ano": ano_val,
                "ano_consulta": ano_consulta,
                "tipo_emenda": str(e.get("tipoEmenda") or ""),
                "localidade": str(e.get("localidadeDoGasto") or ""),
                "uf_gasto": a["uf_gasto"],
                "nome_funcao": str(e.get("nomeFuncao") or ""),
                "codigo_funcao": str(e.get("codigoFuncao") or ""),
                "nome_subfuncao": str(e.get("nomeSubfuncao") or ""),
                "codigo_subfuncao": str(e.get("codigoSubfuncao") or ""),
                "nome_programa": str(e.get("nomePrograma") or ""),
                "nome_autor_api": str(e.get("nomeAutor") or ""),
                "valor_empenhado": float(e.get("valorEmpenhado") or 0),
                "valor_liquidado": float(e.get("valorLiquidado") or 0),
                "valor_pago": float(e.get("valorPago") or 0),
                "taxa_execucao": float(a["taxa_execucao"]),
                "criticidade": a["criticidade"],
                "idh_local": float(idh) if idh is not None else float("nan"),
                "is_show": bool(a["is_show"]),
                "alertas_json": json.dumps(a["alertas"], ensure_ascii=False),
                "ingested_at": ingested_at,
            }
        )
    return rows


def build_schema() -> list[bigquery.SchemaField]:
    return [
        bigquery.SchemaField("emenda_id", "STRING"),
        bigquery.SchemaField("parlamentar_id", "STRING"),
        bigquery.SchemaField("parlamentar_nome", "STRING"),
        bigquery.SchemaField("autor_partido", "STRING"),
        bigquery.SchemaField("autor_uf", "STRING"),
        bigquery.SchemaField("codigo_emenda", "STRING"),
        bigquery.SchemaField("ano", "INT64"),
        bigquery.SchemaField("ano_consulta", "INT64"),
        bigquery.SchemaField("tipo_emenda", "STRING"),
        bigquery.SchemaField("localidade", "STRING"),
        bigquery.SchemaField("uf_gasto", "STRING"),
        bigquery.SchemaField("nome_funcao", "STRING"),
        bigquery.SchemaField("codigo_funcao", "STRING"),
        bigquery.SchemaField("nome_subfuncao", "STRING"),
        bigquery.SchemaField("codigo_subfuncao", "STRING"),
        bigquery.SchemaField("nome_programa", "STRING"),
        bigquery.SchemaField("nome_autor_api", "STRING"),
        bigquery.SchemaField("valor_empenhado", "FLOAT64"),
        bigquery.SchemaField("valor_liquidado", "FLOAT64"),
        bigquery.SchemaField("valor_pago", "FLOAT64"),
        bigquery.SchemaField("taxa_execucao", "FLOAT64"),
        bigquery.SchemaField("criticidade", "STRING"),
        bigquery.SchemaField("idh_local", "FLOAT64"),
        bigquery.SchemaField("is_show", "BOOL"),
        bigquery.SchemaField("alertas_json", "STRING"),
        bigquery.SchemaField("ingested_at", "TIMESTAMP"),
    ]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Emendas (Portal da Transparência) → BigQuery")
    p.add_argument(
        "--table",
        default=DEFAULT_TABLE_ID,
        help=f"Tabela destino (default: {DEFAULT_TABLE_ID})",
    )
    p.add_argument(
        "--append",
        action="store_true",
        help="WRITE_APPEND. Default: WRITE_TRUNCATE (carga cheia).",
    )
    p.add_argument(
        "--project",
        default=None,
        help="Projeto GCP do BigQuery (default: GCP_PROJECT_ID ou projeto-codex-br).",
    )
    p.add_argument(
        "--firestore-project",
        default=os.environ.get("FIRESTORE_PROJECT_ID", "fiscallizapa"),
        help="Projeto Firebase para ler deputados_federais (default: FIRESTORE_PROJECT_ID ou fiscallizapa).",
    )
    p.add_argument(
        "--api-key",
        default=os.environ.get("PORTAL_API_KEY", ""),
        help="Chave API Portal (default: env PORTAL_API_KEY).",
    )
    p.add_argument(
        "--anos",
        default="2023,2024,2025",
        help="Anos separados por vírgula (default: 2023,2024,2025).",
    )
    p.add_argument("--page-delay", type=float, default=0.7, help="Espera entre páginas (s).")
    p.add_argument("--timeout", type=int, default=90, help="Timeout HTTP por requisição (s).")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Só busca e conta linhas; não grava no BigQuery.",
    )
    args = p.parse_args(argv)

    if not args.api_key.strip():
        print("Defina PORTAL_API_KEY ou --api-key.", file=sys.stderr)
        return 1

    anos = [int(x.strip()) for x in args.anos.split(",") if x.strip()]
    if not anos:
        print("Nenhum ano válido em --anos.", file=sys.stderr)
        return 1

    print(f"Lendo deputados_federais (projeto {args.firestore_project})...")
    deps = get_firestore_deputados(args.firestore_project)
    if not deps:
        print("Nenhum deputado com nome encontrado no Firestore.", file=sys.stderr)
        return 1
    print(f"{len(deps)} deputados.")

    ingested_at = pd.Timestamp.now(tz="UTC")
    all_rows: list[dict[str, Any]] = []

    for dep in deps:
        nome_api = normalize_nome_autor(dep["nome"])
        merged: list[dict[str, Any]] = []
        for ano in anos:
            try:
                chunk = fetch_all_emendas_for_author(
                    args.api_key,
                    nome_api,
                    ano,
                    page_delay_s=args.page_delay,
                    timeout=args.timeout,
                )
                merged.extend(chunk)
            except Exception as ex:  # noqa: BLE001 — log e segue
                print(f" ERR {dep.get('nome')} {ano}: {ex}", file=sys.stderr)

        if not merged:
            continue
        print(f" {dep.get('nome')}: {len(merged)} emendas (API)")
        all_rows.extend(emendas_to_rows(dep, merged, ingested_at))

    if not all_rows:
        print("Nenhuma emenda coletada; abortando.", file=sys.stderr)
        return 1

    df = pd.DataFrame(all_rows)
    print(f"Total de linhas para carga: {len(df)}")

    if args.dry_run:
        print("Dry-run: BigQuery não foi alterado.")
        return 0

    disposition = "WRITE_APPEND" if args.append else "WRITE_TRUNCATE"
    schema = build_schema()

    str_cols = [
        "emenda_id",
        "parlamentar_id",
        "parlamentar_nome",
        "autor_partido",
        "autor_uf",
        "codigo_emenda",
        "tipo_emenda",
        "localidade",
        "uf_gasto",
        "nome_funcao",
        "codigo_funcao",
        "nome_subfuncao",
        "codigo_subfuncao",
        "nome_programa",
        "nome_autor_api",
        "criticidade",
        "alertas_json",
    ]
    float_cols = [
        "valor_empenhado",
        "valor_liquidado",
        "valor_pago",
        "taxa_execucao",
        "idh_local",
    ]
    int_cols = ["ano", "ano_consulta"]

    job = sanitize_and_load(
        df,
        args.table,
        project_id=args.project,
        int_columns=int_cols,
        float_columns=float_cols,
        str_columns=str_cols,
        datetime_columns=["ingested_at"],
        write_disposition=disposition,
        schema=schema,
    )
    out_rows = getattr(job, "output_rows", None) or len(df)
    print(f"Carga concluída: {args.table} ({out_rows} linhas, {disposition}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
