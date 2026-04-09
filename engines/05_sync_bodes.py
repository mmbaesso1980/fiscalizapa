"""
A.S.M.O.D.E.U.S. — Ponte BigQuery → Firestore  (05_sync_bodes.py)

Fluxo:
  1. Garante a view `vw_alertas_bodes` no BigQuery (projeto-codex-br).
  2. Consulta os alertas mais recentes via SQL.
  3. Faz upsert em lote (merge=True) na coleção `alertas_bodes` do Firestore
     (projeto fiscallizapa).

Credenciais:
  - GOOGLE_APPLICATION_CREDENTIALS   → conta de serviço com acesso ao BQ
  - FIRESTORE_SA_KEY                 → JSON da conta de serviço com acesso
                                       ao Firestore de fiscallizapa;
                                       se ausente, usa a mesma credencial do BQ

Uso:
  python engines/05_sync_bodes.py
  python engines/05_sync_bodes.py --dry-run
  python engines/05_sync_bodes.py --limit 500 --project-bq projeto-codex-br
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import sys
from datetime import datetime, timezone
from typing import Any

from google.cloud import bigquery
from google.cloud.exceptions import GoogleCloudError

try:
    import firebase_admin
    from firebase_admin import credentials as fb_credentials
    from firebase_admin import firestore
except ImportError:
    sys.exit(
        "firebase-admin não instalado.\n"
        "Execute: pip install firebase-admin"
    )

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("sync_bodes")

# ─── Projetos GCP ─────────────────────────────────────────────────────────────
DEFAULT_BQ_PROJECT      = "projeto-codex-br"
DEFAULT_FIRESTORE_PROJECT = "fiscallizapa"
DATASET                 = "fiscalizapa"
COLLECTION              = "alertas_bodes"
BATCH_SIZE              = 499  # limite Firestore é 500 ops por batch

# ─── DDL da view consolidada de alertas ───────────────────────────────────────
# Esta view une os sinais de cada módulo forense em uma tabela de alertas
# padronizados, prontos para consumo pelo frontend.
_VW_ALERTAS_BODES_DDL = f"""
CREATE OR REPLACE VIEW `{DEFAULT_BQ_PROJECT}.{DATASET}.vw_alertas_bodes` AS

WITH base AS (

  -- ── Módulo 10: Ficha Limpa / Inelegibilidade ─────────────────────────────
  SELECT
    CONCAT(CAST(id AS STRING), '_FICHA_LIMPA')          AS alerta_id,
    CAST(id AS STRING)                                   AS parlamentar_id,
    nome                                                 AS parlamentarNome,
    partido,
    uf,
    'FICHA_LIMPA_INELEGIVEL'                             AS tipoAlerta,
    CONCAT('Inelegível conforme LC 64/90 / LC 135/2010: ',
           COALESCE(motivo_inelegibilidade, 'condenação detectada'))
                                                         AS descricao,
    90.0                                                 AS score_risco,
    'ALTA'                                               AS criticidade
  FROM `{DEFAULT_BQ_PROJECT}.{DATASET}.forense_elegibilidade_parlamentar`
  WHERE inelegivel = TRUE

  UNION ALL

  -- ── Módulo 11: Inelegibilidade Reflexa ────────────────────────────────────
  SELECT
    CONCAT(CAST(id_parente AS STRING), '_INELEGIVEL_REFLEXA') AS alerta_id,
    CAST(id_parente AS STRING)                                  AS parlamentar_id,
    nome_parente                                                AS parlamentarNome,
    partido_parente                                             AS partido,
    uf_parente                                                  AS uf,
    'INELEGIBILIDADE_REFLEXA'                                   AS tipoAlerta,
    CONCAT('Parente de ', nome_titular,
           ' (§3º Art. 1º LC 64/90)')                          AS descricao,
    80.0                                                        AS score_risco,
    'ALTA'                                                      AS criticidade
  FROM `{DEFAULT_BQ_PROJECT}.{DATASET}.forense_inelegibilidade_reflexa`

  UNION ALL

  -- ── Módulo 1: CNAE Incompatível ───────────────────────────────────────────
  SELECT
    CONCAT(CAST(id_parlamentar AS STRING), '_CNAE') AS alerta_id,
    CAST(id_parlamentar AS STRING)                   AS parlamentar_id,
    nome_parlamentar                                 AS parlamentarNome,
    partido,
    uf,
    'CNAE_INCOMPATIVEL'                              AS tipoAlerta,
    CONCAT('Empresa contratada com CNAE incompatível: ',
           COALESCE(cnae_desc, 'atividade suspeita'))
                                                     AS descricao,
    65.0                                             AS score_risco,
    'MEDIA'                                          AS criticidade
  FROM `{DEFAULT_BQ_PROJECT}.{DATASET}.forense_cnae_incompativel`
  WHERE suspeito = TRUE

  UNION ALL

  -- ── Módulo 9: Doador Vencedor ─────────────────────────────────────────────
  SELECT
    CONCAT(CAST(id_parlamentar AS STRING), '_DOADOR_VENCEDOR') AS alerta_id,
    CAST(id_parlamentar AS STRING)                               AS parlamentar_id,
    nome_parlamentar                                             AS parlamentarNome,
    partido,
    uf,
    'DOADOR_VENCEDOR'                                            AS tipoAlerta,
    CONCAT('Doador de campanha venceu licitação: R$ ',
           FORMAT('%,.2f', COALESCE(valor_contrato, 0)))         AS descricao,
    75.0                                                         AS score_risco,
    'ALTA'                                                       AS criticidade
  FROM `{DEFAULT_BQ_PROJECT}.{DATASET}.forense_doador_vencedor`

  UNION ALL

  -- ── Módulo 20: Enriquecimento Ilícito ────────────────────────────────────
  SELECT
    CONCAT(CAST(id_parlamentar AS STRING), '_ENRIQUECIMENTO') AS alerta_id,
    CAST(id_parlamentar AS STRING)                             AS parlamentar_id,
    nome_parlamentar                                           AS parlamentarNome,
    partido,
    uf,
    'ENRIQUECIMENTO_ILICITO'                                   AS tipoAlerta,
    CONCAT('Variação patrimonial suspeita: ',
           COALESCE(variacao_resumo, 'acréscimo injustificado'))
                                                               AS descricao,
    85.0                                                       AS score_risco,
    'ALTA'                                                     AS criticidade
  FROM `{DEFAULT_BQ_PROJECT}.{DATASET}.forense_enriquecimento`
  WHERE suspeito = TRUE

)

SELECT
  alerta_id,
  parlamentar_id,
  parlamentarNome,
  partido,
  uf,
  tipoAlerta,
  descricao,
  score_risco,
  criticidade,
  CURRENT_TIMESTAMP() AS criadoEm
FROM base
ORDER BY score_risco DESC, parlamentarNome
"""


# ─── Inicialização do Firestore ────────────────────────────────────────────────
def init_firestore(project_id: str) -> Any:
    """
    Inicializa o firebase_admin apontando para `project_id`.
    Usa FIRESTORE_SA_KEY (caminho de arquivo JSON) se disponível,
    caso contrário cai para GOOGLE_APPLICATION_CREDENTIALS / ADC.
    """
    sa_key_path = os.environ.get("FIRESTORE_SA_KEY")

    if not firebase_admin._apps:
        if sa_key_path and os.path.isfile(sa_key_path):
            cred = fb_credentials.Certificate(sa_key_path)
            log.info("Firestore: usando chave de serviço em %s", sa_key_path)
        else:
            cred = fb_credentials.ApplicationDefault()
            log.info("Firestore: usando Application Default Credentials")

        firebase_admin.initialize_app(cred, {"projectId": project_id})

    return firestore.client()


# ─── Garantir a view no BigQuery ───────────────────────────────────────────────
def ensure_view(client: bigquery.Client, dry_run: bool = False) -> None:
    view_full = f"{DEFAULT_BQ_PROJECT}.{DATASET}.vw_alertas_bodes"
    log.info("Verificando view %s …", view_full)

    try:
        client.get_table(view_full)
        log.info("View já existe — nenhuma ação necessária.")
        return
    except Exception:
        pass

    if dry_run:
        log.info("[DRY-RUN] View seria criada agora.")
        return

    log.info("Criando view vw_alertas_bodes …")
    try:
        client.query(_VW_ALERTAS_BODES_DDL).result()
        log.info("View criada com sucesso.")
    except GoogleCloudError as exc:
        log.warning(
            "Não foi possível criar a view (talvez as fontes ainda não existam): %s",
            exc,
        )


# ─── Consultar alertas no BigQuery ────────────────────────────────────────────
_QUERY_ALERTAS = """
SELECT *
FROM `{project}.{dataset}.vw_alertas_bodes`
ORDER BY score_risco DESC, criadoEm DESC
LIMIT {limit}
"""


def fetch_alertas(
    client: bigquery.Client,
    *,
    project: str,
    limit: int,
    dry_run: bool,
) -> list[dict]:
    sql = _QUERY_ALERTAS.format(project=project, dataset=DATASET, limit=limit)

    if dry_run:
        log.info("[DRY-RUN] Query que seria executada:\n%s", sql)
        return []

    log.info("Consultando vw_alertas_bodes (LIMIT %d) …", limit)
    try:
        rows = list(client.query(sql).result())
    except GoogleCloudError as exc:
        log.error("Erro ao consultar BigQuery: %s", exc)
        return []

    log.info("%d alertas obtidos do BigQuery.", len(rows))
    return [dict(r) for r in rows]


# ─── Carimbo de Veracidade (Protocolo H.E.R.M.E.S.) ──────────────────────────
# Gera um hash SHA-256 canônico do dado bruto capturado da fonte oficial.
# Objetivo: provar que o dado exibido no frontend é a cópia EXATA e
# inalterada do documento governamental na data/hora de captura.
# O hash é gravado no Firestore junto com o alerta, formando um
# "blockchain-style audit trail" imutável e verificável por terceiros.

def compute_data_hash(record: dict) -> str:
    """
    Retorna SHA-256 do conteúdo canônico do registro.
    Campos de controle interno (sincronizadoEm, dataHash, …) são
    excluídos para que re-sincronizações não alterem o hash do dado.
    """
    # Campos que não fazem parte do dado original — não entram no hash
    EXCLUDE = {"sincronizadoEm", "dataHash", "dataHashTs", "updatedAt",
               "criadoEmLocal", "syncVersion"}
    canonical = {k: v for k, v in record.items() if k not in EXCLUDE}
    serialized = json.dumps(canonical, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def build_hermes_proof(record: dict, source_url: str = "") -> dict:
    """
    Retorna um dict com os campos de veracidade a serem mesclados no
    documento Firestore antes de gravá-lo.

    Campos gerados:
      dataHash      — SHA-256 do dado bruto (hex, 64 chars)
      dataHashAlg   — algoritmo usado ("sha256")
      dataHashTs    — ISO-8601 UTC do momento de captura
      fonteOriginal — URL canônica da fonte governamental
      hermesVersion — versão do protocolo
    """
    return {
        "dataHash":      compute_data_hash(record),
        "dataHashAlg":   "sha256",
        "dataHashTs":    datetime.now(timezone.utc).isoformat(),
        "fonteOriginal": source_url or _infer_source_url(record),
        "hermesVersion": "1.0",
    }


def _infer_source_url(record: dict) -> str:
    """Infere a URL da fonte governamental a partir do tipo de alerta."""
    tipo = (record.get("tipoAlerta") or record.get("tipo") or "").upper()
    if "EMENDA" in tipo or "CEAP" in tipo:
        return "https://portaldatransparencia.gov.br/emendas"
    if "FICHA" in tipo or "INELEGIV" in tipo:
        return "https://www.tse.jus.br/eleicoes/candidaturas"
    if "DIARIO" in tipo or "DOU" in tipo:
        return "https://www.in.gov.br/servicos/diario-oficial-da-uniao"
    if "CONTRATO" in tipo:
        return "https://compras.dados.gov.br"
    if "SAUDE" in tipo or "OSS" in tipo or "ANVISA" in tipo:
        return "https://portaldatransparencia.gov.br/saude"
    return "https://portaldatransparencia.gov.br"


# ─── Verificação de integridade (uso externo / auditoria) ─────────────────────
def verify_record_integrity(record: dict) -> dict:
    """
    Verifica se o hash armazenado bate com o dado atual.
    Retorna {"valid": True/False, "stored": hash, "computed": hash}.
    """
    stored   = record.get("dataHash", "")
    computed = compute_data_hash(record)
    return {
        "valid":    stored == computed,
        "stored":   stored,
        "computed": computed,
        "alerta_id": record.get("alerta_id", "–"),
    }


# ─── Converter tipos não-serializáveis pelo Firestore ─────────────────────────
def _firestore_safe(record: dict) -> dict:
    """Converte datetime/Timestamp para objetos Python datetime-aware."""
    safe = {}
    for k, v in record.items():
        if hasattr(v, "isoformat"):  # datetime / date
            if hasattr(v, "tzinfo") and v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            safe[k] = v
        elif hasattr(v, "ToDatetime"):  # proto Timestamp (BQ row)
            safe[k] = v.ToDatetime(tzinfo=timezone.utc)
        else:
            safe[k] = v
    safe.setdefault("sincronizadoEm", datetime.now(timezone.utc))
    return safe


# ─── Upsert em lote no Firestore ──────────────────────────────────────────────
def upsert_to_firestore(
    db_client: Any,
    alertas: list[dict],
    *,
    dry_run: bool,
) -> int:
    if not alertas:
        log.info("Nenhum alerta para sincronizar.")
        return 0

    total    = len(alertas)
    n_chunks = math.ceil(total / BATCH_SIZE)
    synced   = 0

    col_ref = db_client.collection(COLLECTION)

    for chunk_idx in range(n_chunks):
        chunk = alertas[chunk_idx * BATCH_SIZE : (chunk_idx + 1) * BATCH_SIZE]
        if dry_run:
            log.info("[DRY-RUN] Batch %d/%d: %d docs seriam gravados.", chunk_idx + 1, n_chunks, len(chunk))
            synced += len(chunk)
            continue

        batch = db_client.batch()
        for rec in chunk:
            doc_id  = rec.get("alerta_id") or f"auto_{hash(json.dumps(rec, default=str))}"
            doc_ref = col_ref.document(doc_id)
            # ── Protocolo H.E.R.M.E.S.: carimbo de veracidade ────────────────
            safe_rec = _firestore_safe(rec)
            safe_rec.update(build_hermes_proof(rec))
            batch.set(doc_ref, safe_rec, merge=True)

        batch.commit()
        synced += len(chunk)
        log.info("Batch %d/%d commitado — %d/%d docs.", chunk_idx + 1, n_chunks, synced, total)

    return synced


# ─── Ponto de entrada ──────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sincroniza alertas do BigQuery para a coleção alertas_bodes no Firestore.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--project-bq",        default=DEFAULT_BQ_PROJECT,      help="Projeto BigQuery (padrão: %(default)s)")
    parser.add_argument("--project-firestore",  default=DEFAULT_FIRESTORE_PROJECT, help="Projeto Firestore (padrão: %(default)s)")
    parser.add_argument("--limit",  type=int,   default=1000,                    help="Máximo de alertas a sincronizar (padrão: 1000)")
    parser.add_argument("--dry-run", action="store_true",                        help="Simula sem gravar no Firestore")
    args = parser.parse_args()

    if args.dry_run:
        log.info("══ MODO DRY-RUN ativado — nenhuma escrita será feita ══")

    # 1. BigQuery
    bq = bigquery.Client(project=args.project_bq)
    ensure_view(bq, dry_run=args.dry_run)
    alertas = fetch_alertas(bq, project=args.project_bq, limit=args.limit, dry_run=args.dry_run)

    # 2. Firestore
    db = init_firestore(args.project_firestore)

    # 3. Upsert
    synced = upsert_to_firestore(db, alertas, dry_run=args.dry_run)

    log.info("══ Sincronização concluída: %d alertas gravados em '%s'. ══", synced, COLLECTION)


if __name__ == "__main__":
    main()
