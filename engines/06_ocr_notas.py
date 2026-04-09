"""
A.S.M.O.D.E.U.S. — OCR de Notas Fiscais CEAP  (06_ocr_notas.py)

Usa o Document AI Invoice Parser (google-cloud-documentai) para ler
lotes de PDFs/imagens de notas fiscais da CEAP e extrair metadados
estruturados para o BigQuery.

Campos extraídos por nota:
  • supplier_tax_id  → CNPJ do fornecedor
  • total_amount     → valor total da nota
  • line_items       → descrições dos itens (JSON array)
  • purchase_date    → data da nota
  • invoice_id       → número da nota

Circuit Breakers implementados:
  • Lotes de 50 documentos por chamada (BATCH_SIZE)
  • Pausa entre lotes (BATCH_PAUSE_SEC) para evitar quota burst
  • try/except granular: falha em 1 documento não para o lote
  • Timeout por documento (REQUEST_TIMEOUT_SEC)
  • Contador de erros consecutivos → aborta após MAX_CONSECUTIVE_ERRORS

Destino BigQuery: fiscalizapa.ceap_ocr_extractions
Credenciais: GOOGLE_APPLICATION_CREDENTIALS
Processador: DOCUMENT_AI_PROCESSOR_ID (env) ou via --processor

Uso:
  # Processar uma pasta local de PDFs
  python engines/06_ocr_notas.py --input-dir /caminho/pdfs --processor PROC_ID

  # Dry-run (sem gravar no BQ)
  python engines/06_ocr_notas.py --input-dir /tmp/test_pdfs --dry-run

  # Limitar número máximo de documentos
  python engines/06_ocr_notas.py --input-dir /tmp/pdfs --max-docs 200
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ocr_notas")

# ─── Constantes / Circuit Breaker ─────────────────────────────────────────────
BATCH_SIZE              = 50          # máximo de docs por lote
BATCH_PAUSE_SEC         = 3.0         # pausa entre lotes (evita quota burst)
REQUEST_TIMEOUT_SEC     = 120         # timeout por documento
MAX_CONSECUTIVE_ERRORS  = 5           # aborta após N erros consecutivos
SUPPORTED_EXTENSIONS    = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".tiff", ".bmp", ".webp"}
DEFAULT_BQ_PROJECT      = "projeto-codex-br"
DATASET                 = "fiscalizapa"
TABLE                   = "ceap_ocr_extractions"
TABLE_FULL              = f"{DATASET}.{TABLE}"

# ─── MIME types ───────────────────────────────────────────────────────────────
_MIME_MAP = {
    ".pdf":  "application/pdf",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".tiff": "image/tiff",
    ".bmp":  "image/bmp",
    ".webp": "image/webp",
}

# ─── Schema BigQuery ───────────────────────────────────────────────────────────
def _get_schema():
    from google.cloud import bigquery
    return [
        bigquery.SchemaField("doc_id",          "STRING",    mode="REQUIRED"),
        bigquery.SchemaField("arquivo_nome",     "STRING"),
        bigquery.SchemaField("supplier_name",    "STRING"),
        bigquery.SchemaField("supplier_tax_id",  "STRING"),   # CNPJ
        bigquery.SchemaField("total_amount",     "FLOAT64"),
        bigquery.SchemaField("purchase_date",    "STRING"),   # ISO date string
        bigquery.SchemaField("invoice_id",       "STRING"),
        bigquery.SchemaField("line_items_json",  "STRING"),   # JSON array
        bigquery.SchemaField("confidence",       "FLOAT64"),
        bigquery.SchemaField("pages",            "INT64"),
        bigquery.SchemaField("processado_em",    "TIMESTAMP"),
        bigquery.SchemaField("erro",             "STRING"),   # NULL se sucesso
    ]


# ─── Carregar sanitize_and_load do 01_bq_setup.py ─────────────────────────────
def _load_bq_setup() -> Any:
    here   = Path(__file__).resolve().parent
    target = here / "01_bq_setup.py"
    if not target.exists():
        sys.exit(f"Arquivo não encontrado: {target}")

    spec   = importlib.util.spec_from_file_location("bq_setup", target)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ─── Inicializar Document AI client ───────────────────────────────────────────
def _get_docai_client():
    try:
        from google.cloud import documentai_v1 as documentai
        return documentai.DocumentProcessorServiceClient()
    except ImportError:
        sys.exit(
            "google-cloud-documentai não instalado.\n"
            "Execute: pip install google-cloud-documentai>=2.24.0"
        )


# ─── Extrair campos do documento processado ───────────────────────────────────
def _extract_fields(document: Any) -> dict:
    """
    Percorre document.entities e extrai os campos-chave do Invoice Parser.
    Retorna um dict com os valores extraídos (None se ausente).
    """
    supplier_name   = None
    supplier_tax_id = None
    total_amount    = None
    purchase_date   = None
    invoice_id      = None
    line_items      = []
    confidence_sum  = 0.0
    confidence_n    = 0

    for entity in document.entities:
        etype = entity.type_.lower().replace(" ", "_").replace("-", "_")
        value = entity.mention_text.strip() if entity.mention_text else None
        conf  = entity.confidence if entity.confidence else 0.0

        confidence_sum += conf
        confidence_n   += 1

        if etype == "supplier_name"   and value: supplier_name   = value
        if etype == "supplier_tax_id" and value: supplier_tax_id = _clean_cnpj(value)
        if etype == "total_amount"    and value: total_amount    = _parse_brl(value)
        if etype == "purchase_date"   and value: purchase_date   = value
        if etype == "invoice_id"      and value: invoice_id      = value

        # Line items: cada entity com tipo "line_item" tem propriedades filhas
        if etype == "line_item":
            item = {}
            for prop in entity.properties:
                ptype  = prop.type_.lower().replace(" ", "_")
                pvalue = prop.mention_text.strip() if prop.mention_text else None
                if pvalue:
                    item[ptype] = pvalue
            if item:
                line_items.append(item)

    avg_conf = (confidence_sum / confidence_n) if confidence_n else 0.0

    return {
        "supplier_name":   supplier_name,
        "supplier_tax_id": supplier_tax_id,
        "total_amount":    total_amount,
        "purchase_date":   purchase_date,
        "invoice_id":      invoice_id,
        "line_items":      line_items,
        "confidence":      round(avg_conf, 4),
        "pages":           len(document.pages),
    }


def _clean_cnpj(raw: str) -> str:
    """Remove caracteres não numéricos do CNPJ."""
    digits = "".join(c for c in raw if c.isdigit())
    return digits if digits else raw


def _parse_brl(raw: str) -> Optional[float]:
    """Converte string de valor monetário BR para float."""
    import re
    cleaned = re.sub(r"[^\d,\.]", "", raw)
    # Formato: 1.234,56
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


# ─── Processar um único documento ─────────────────────────────────────────────
def _process_document(
    client:       Any,
    processor_name: str,
    file_path:    Path,
) -> dict:
    """
    Envia um arquivo para o Document AI Invoice Parser.
    Retorna dict com campos extraídos + metadados.

    Circuit breaker local: captura qualquer exceção e devolve registro com erro.
    """
    from google.cloud import documentai_v1 as documentai

    mime_type = _MIME_MAP.get(file_path.suffix.lower(), "application/pdf")
    doc_id    = file_path.stem

    base_record = {
        "doc_id":       doc_id,
        "arquivo_nome": file_path.name,
        "processado_em": datetime.now(timezone.utc),
        "erro":         None,
    }

    try:
        content = file_path.read_bytes()
        raw_doc = documentai.RawDocument(content=content, mime_type=mime_type)
        request = documentai.ProcessRequest(name=processor_name, raw_document=raw_doc)
        result  = client.process_document(request=request, timeout=REQUEST_TIMEOUT_SEC)
        fields  = _extract_fields(result.document)

        return {
            **base_record,
            "supplier_name":   fields["supplier_name"],
            "supplier_tax_id": fields["supplier_tax_id"],
            "total_amount":    fields["total_amount"],
            "purchase_date":   fields["purchase_date"],
            "invoice_id":      fields["invoice_id"],
            "line_items_json": json.dumps(fields["line_items"], ensure_ascii=False),
            "confidence":      fields["confidence"],
            "pages":           fields["pages"],
        }

    except Exception as exc:
        log.warning("Erro ao processar '%s': %s", file_path.name, exc)
        return {
            **base_record,
            "supplier_name":   None,
            "supplier_tax_id": None,
            "total_amount":    None,
            "purchase_date":   None,
            "invoice_id":      None,
            "line_items_json": "[]",
            "confidence":      0.0,
            "pages":           0,
            "erro":            str(exc)[:500],
        }


# ─── Processar lote com circuit breaker ───────────────────────────────────────
def process_batch(
    client:         Any,
    processor_name: str,
    files:          list[Path],
    dry_run:        bool = False,
) -> list[dict]:
    """
    Processa um lote de arquivos.
    Circuit breakers:
      - Pausa entre documentos individuais se houver erros consecutivos
      - Aborta lote após MAX_CONSECUTIVE_ERRORS erros seguidos
    """
    records           = []
    consecutive_errors = 0

    for i, fp in enumerate(files, 1):
        log.info("  [%d/%d] %s", i, len(files), fp.name)

        if dry_run:
            records.append({
                "doc_id": fp.stem, "arquivo_nome": fp.name,
                "supplier_name": "SIMULADO", "supplier_tax_id": "00000000000000",
                "total_amount": 0.0, "purchase_date": "2024-01-01",
                "invoice_id": "NF-0000", "line_items_json": "[]",
                "confidence": 1.0, "pages": 1,
                "processado_em": datetime.now(timezone.utc), "erro": None,
            })
            continue

        record = _process_document(client, processor_name, fp)
        records.append(record)

        if record["erro"]:
            consecutive_errors += 1
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                log.error(
                    "Circuit breaker ativado: %d erros consecutivos — lote interrompido.",
                    consecutive_errors,
                )
                break
            time.sleep(1.5)  # back-off suave após erro
        else:
            consecutive_errors = 0

    return records


# ─── Ponto de entrada ──────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="OCR de notas fiscais CEAP via Document AI → BigQuery.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--input-dir",  required=True,  help="Pasta contendo PDFs/imagens")
    parser.add_argument("--processor",  default=os.environ.get("DOCUMENT_AI_PROCESSOR_ID", ""),
                                        help="Resource name completo do processador Document AI")
    parser.add_argument("--gcp-project", default=DEFAULT_BQ_PROJECT)
    parser.add_argument("--location",   default="us",   help="Localização do Document AI (ex: us, eu)")
    parser.add_argument("--max-docs",   type=int, default=0, help="Limite total de docs (0 = sem limite)")
    parser.add_argument("--dry-run",    action="store_true")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.is_dir():
        sys.exit(f"Pasta não encontrada: {input_dir}")

    # Coletar arquivos suportados
    all_files = sorted(
        f for f in input_dir.rglob("*") if f.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    if not all_files:
        log.warning("Nenhum arquivo suportado encontrado em %s", input_dir)
        return

    if args.max_docs:
        all_files = all_files[: args.max_docs]

    log.info("Total de arquivos a processar: %d", len(all_files))

    # Inicializar clientes
    bq_setup = _load_bq_setup()

    if not args.dry_run:
        if not args.processor:
            sys.exit(
                "Forneça --processor ou defina DOCUMENT_AI_PROCESSOR_ID.\n"
                "Formato: projects/{project}/locations/{location}/processors/{id}"
            )
        docai_client = _get_docai_client()
    else:
        docai_client = None
        log.info("══ MODO DRY-RUN ativado ══")

    # Dividir em lotes de BATCH_SIZE
    batches    = [all_files[i : i + BATCH_SIZE] for i in range(0, len(all_files), BATCH_SIZE)]
    all_records: list[dict] = []
    n_batches   = len(batches)

    for batch_idx, batch in enumerate(batches, 1):
        log.info("═══ Lote %d/%d (%d docs) ═══", batch_idx, n_batches, len(batch))

        records = process_batch(
            docai_client,
            args.processor,
            batch,
            dry_run=args.dry_run,
        )
        all_records.extend(records)

        ok  = sum(1 for r in records if not r["erro"])
        err = sum(1 for r in records if r["erro"])
        log.info("Lote %d concluído: %d OK / %d erros", batch_idx, ok, err)

        # Salvar lote imediatamente no BigQuery (evita perder dados em caso de falha)
        if not args.dry_run and records:
            _save_batch(bq_setup, records, args.gcp_project)

        # Pausa entre lotes para respeitar cotas da API
        if batch_idx < n_batches:
            log.info("Aguardando %.0fs antes do próximo lote…", BATCH_PAUSE_SEC)
            time.sleep(BATCH_PAUSE_SEC)

    # Resumo final
    total_ok  = sum(1 for r in all_records if not r["erro"])
    total_err = sum(1 for r in all_records if r["erro"])
    log.info(
        "══ Concluído: %d documentos processados (%d OK / %d erros) ══",
        len(all_records), total_ok, total_err,
    )

    if args.dry_run and all_records:
        import pandas as pd
        sample = pd.DataFrame(all_records).head(5)
        log.info("Amostra dos dados:\n%s", sample.to_string())


def _save_batch(bq_setup: Any, records: list[dict], project_id: str) -> None:
    """Salva um lote de registros no BigQuery com tratamento de erros."""
    import pandas as pd

    try:
        df = pd.DataFrame(records)
        bq_setup.sanitize_and_load(
            df,
            TABLE_FULL,
            project_id=project_id,
            float_columns=["total_amount", "confidence"],
            str_columns=["doc_id", "arquivo_nome", "supplier_name", "supplier_tax_id",
                         "purchase_date", "invoice_id", "line_items_json", "erro"],
            int_columns=["pages"],
            datetime_columns=["processado_em"],
            write_disposition="WRITE_APPEND",
            schema=_get_schema(),
        )
        log.info("Lote salvo em BigQuery: %d registros → %s", len(records), TABLE_FULL)
    except Exception as exc:
        log.error("Erro ao salvar lote no BigQuery: %s", exc)
        log.error("Os registros deste lote foram perdidos. Verifique credenciais e schema.")


if __name__ == "__main__":
    main()
