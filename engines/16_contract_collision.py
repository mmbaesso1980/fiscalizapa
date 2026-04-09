"""
A.S.M.O.D.E.U.S. — Scanner de Conflito de Interesses  (16_contract_collision.py)

"Sangue e Poder" — Parte 2: Cruzamento Contratos x Familiares

Lógica central:
  Para cada contrato público capturado pelo 10_universal_crawler.py:
    1. Extrair CNPJ da empresa contratada
    2. Buscar o Quadro Societário (QSA) dessa empresa via Receita Federal
    3. Cruzar nomes dos sócios com a rede familiar de todos os parlamentares
       (Firestore: usuarios_relacionados)
    4. Se houver MATCH → gerar Alerta de Nível 5 (Corrupção Provável)
       e salvar em alertas_bodes + BigQuery

Caso "Marquinho Boi" (simulado):
  Contrato → CNPJ 98.765.432/0001-45 (Silva Segurança e Vigilância Ltda)
  QSA      → Sócio: "Marcos Silva"
  Família  → parlamentar João Silva (SP) tem irmão "Marcos Silva" cadastrado
  Match!   → gera Alerta Nível 5:
    "Empresa de irmão do parlamentar venceu contrato público de R$ 2,4M
     em seu estado de atuação"

BigQuery fonte (contratos):
  fiscalizapa.contratos_publicos (populado por 10_universal_crawler.py)
  Schema esperado: id, cnpj, razao_social, valor, uf, orgao, objeto, data_publicacao

Saída (Nível 5 Alerta):
  Firestore: alertas_bodes/{hash}
  BigQuery:  fiscalizapa.alertas_corrupcao_provavel
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("contract_collision")

# ─── Configuração ─────────────────────────────────────────────────────────────
FIRESTORE_PROJECT  = "fiscallizapa"
GCP_PROJECT        = "projeto-codex-br"
BQ_DATASET         = "fiscalizapa"
BQ_CONTRATOS       = f"{BQ_DATASET}.contratos_publicos"
BQ_ALERTAS_N5      = f"{BQ_DATASET}.alertas_corrupcao_provavel"
FS_FAMILIA         = "usuarios_relacionados"
FS_ALERTAS         = "alertas_bodes"
CNPJ_API_BASE      = "https://brasilapi.com.br/api/cnpj/v1"
RATE_LIMIT_S       = 0.8
NIVEL_5_LABEL      = "NIVEL_5"
NIVEL_5_CRITICIDADE = "NIVEL_5"

# Pesos de suspeição (score 0-100)
PESO_CONJUGUE   = 95   # cônjuge → máxima suspeição
PESO_FILHO       = 90
PESO_IRMAO       = 85   # caso "Marquinho Boi"
PESO_PAI_MAE     = 80
PESO_OUTRO       = 60

PESO_POR_RELACAO = {
    "conjuge": PESO_CONJUGUE,
    "filho":   PESO_FILHO,
    "filha":   PESO_FILHO,
    "irmao":   PESO_IRMAO,
    "irma":    PESO_IRMAO,
    "pai":     PESO_PAI_MAE,
    "mae":     PESO_PAI_MAE,
    "outro":   PESO_OUTRO,
}

HEADERS = {
    "Accept":     "application/json",
    "User-Agent": "ASMODEUS-CollisionScanner/1.0 (auditoria-forense)",
}


# ─── HTTP Helper ──────────────────────────────────────────────────────────────
def _get(url: str, timeout: int = 12) -> dict:
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.debug("  GET %s → %s", url[:80], e)
        return {}


# ─── Normalização de nomes (para fuzzy match) ─────────────────────────────────
def normalize_name(name: str) -> str:
    """Remove acentos, lowercase, strip extras para comparação."""
    import unicodedata
    nfd = unicodedata.normalize("NFD", name or "")
    ascii_name = nfd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_name).strip().lower()


def name_similarity(a: str, b: str, threshold: float = 0.80) -> bool:
    """Retorna True se os dois nomes têm similaridade suficiente."""
    na, nb = normalize_name(a), normalize_name(b)
    # Correspondência exata
    if na == nb:
        return True
    # Verifica se as palavras-chave principais batem (sobrenome + nome)
    words_a = set(na.split())
    words_b = set(nb.split())
    # Nomes com ≥ 2 palavras em comum e comprimento razoável
    common = words_a & words_b
    if len(common) >= 2 and sum(len(w) for w in common) >= 8:
        return True
    # Similaridade de Jaccard simples
    jaccard = len(common) / max(len(words_a | words_b), 1)
    return jaccard >= threshold


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
    except ImportError:
        sys.exit("firebase-admin não instalado.")


def init_bigquery(project: str) -> Any:
    try:
        from google.cloud import bigquery
        return bigquery.Client(project=project)
    except Exception as e:
        log.warning("BigQuery indisponível: %s", e)
        return None


# ─── Carregamento da rede familiar ────────────────────────────────────────────
def load_family_networks(db: Any) -> dict[str, dict]:
    """
    Carrega todas as redes familiares do Firestore (usuarios_relacionados).
    Retorna: { parlamentar_id → { nome, uf, membros: [...] } }
    """
    docs = db.collection(FS_FAMILIA).stream()
    networks = {}
    for d in docs:
        data = d.to_dict()
        if data:
            networks[d.id] = data
    log.info("Redes familiares carregadas: %d parlamentares", len(networks))
    return networks


# ─── QSA via Receita Federal ──────────────────────────────────────────────────
def get_qsa(cnpj: str) -> list[dict]:
    """
    Busca o Quadro Societário (QSA) de uma empresa via BrasilAPI (CNPJ).
    Retorna lista de sócios: [{ nome_socio, qualificacao_socio }]
    """
    cnpj_clean = re.sub(r"\D", "", cnpj or "")
    if len(cnpj_clean) != 14:
        return []
    data = _get(f"{CNPJ_API_BASE}/{cnpj_clean}")
    time.sleep(RATE_LIMIT_S)
    return data.get("qsa", []) or []


# ─── Carregamento de contratos ────────────────────────────────────────────────
def load_contracts_from_bigquery(bq_client: Any, uf: str | None = None) -> list[dict]:
    """
    Lê contratos do BigQuery com filtro opcional por UF.
    Schema: id, cnpj, razao_social, valor, uf, orgao, objeto, data_publicacao
    """
    if not bq_client:
        return get_mock_contracts()
    try:
        uf_filter = f"AND uf = '{uf}'" if uf else ""
        query = f"""
            SELECT id, cnpj, razao_social, valor, uf, orgao, objeto, data_publicacao
            FROM `{BQ_CONTRATOS}`
            WHERE data_publicacao >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
            {uf_filter}
            ORDER BY data_publicacao DESC
            LIMIT 5000
        """
        rows = list(bq_client.query(query).result())
        return [dict(r) for r in rows]
    except Exception as e:
        log.warning("BigQuery contratos query falhou: %s — usando mock", e)
        return get_mock_contracts(uf)


def get_mock_contracts(uf: str | None = None) -> list[dict]:
    """Contratos mock para demonstração do sistema Sangue e Poder."""
    contratos = [
        {
            "id": "CTR-2024-001",
            "cnpj": "98765432000145",
            "razao_social": "Silva Segurança e Vigilância Ltda",
            "valor": 2400000.00,
            "uf": "SP",
            "orgao": "Secretaria de Segurança Pública do Estado de SP",
            "objeto": "Prestação de serviços de vigilância armada e segurança patrimonial para órgãos estaduais",
            "data_publicacao": "2024-01-15",
        },
        {
            "id": "CTR-2024-002",
            "cnpj": "11223344000155",
            "razao_social": "Tech Silva Sistemas de Segurança",
            "valor": 890000.00,
            "uf": "SP",
            "orgao": "Detran-SP",
            "objeto": "Fornecimento e instalação de câmeras de monitoramento e sistemas CFTV",
            "data_publicacao": "2024-02-20",
        },
        {
            "id": "CTR-2024-003",
            "cnpj": "12345678000190",
            "razao_social": "Silva Consultoria & Assessoria Ltda",
            "valor": 450000.00,
            "uf": "SP",
            "orgao": "Assembleia Legislativa de SP",
            "objeto": "Consultoria em gestão de recursos humanos e desenvolvimento organizacional",
            "data_publicacao": "2024-03-05",
        },
    ]
    if uf:
        contratos = [c for c in contratos if c["uf"] == uf]
    return contratos


# ─── Geração de alertas Nível 5 ───────────────────────────────────────────────
def generate_nivel5_id(parlamentar_id: str, cnpj: str, socio: str) -> str:
    """ID determinístico para evitar duplicatas."""
    raw = f"N5_{parlamentar_id}_{cnpj}_{normalize_name(socio)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:20]


def generate_nivel5_alert(
    parlamentar_id:   str,
    parlamentar_nome: str,
    uf:               str,
    partido:          str,
    familiar:         dict,
    empresa:          dict,
    contrato:         dict,
    score:            int,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    cnpj_fmt = re.sub(r"(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})", r"\1.\2.\3/\4-\5",
                      empresa.get("cnpj", ""))
    return {
        "id":                  generate_nivel5_id(parlamentar_id, empresa.get("cnpj",""), familiar["nome"]),
        "parlamentar_id":      parlamentar_id,
        "parlamentar_nome":    parlamentar_nome,
        "partido":             partido,
        "uf":                  uf,
        "criticidade":         NIVEL_5_CRITICIDADE,
        "nivel":               5,
        "tipoAlerta":          "CONFLITO_INTERESSE_FAMILIAR",
        "descricao": (
            f"Empresa de {familiar['relacao']} do parlamentar {parlamentar_nome} "
            f"({familiar['nome']}) venceu contrato público de "
            f"R$ {contrato.get('valor', 0):,.2f} no estado {uf}. "
            f"Objeto: {str(contrato.get('objeto',''))[:150]}"
        ),
        "explicacao_oraculo": (
            f"Alerta de Corrupção Provável: {familiar['nome']} ({familiar['relacao']} do "
            f"parlamentar) figura como sócio em '{empresa.get('razao_social')}' "
            f"(CNPJ {cnpj_fmt}), empresa que assinou contrato com "
            f"'{contrato.get('orgao')}' por R$ {contrato.get('valor', 0):,.0f}. "
            f"Enquadramento: nepotismo/favorecimento em licitação pública. "
            f"Score de suspeição: {score}/100."
        ),
        "empresa_cnpj":        empresa.get("cnpj", ""),
        "empresa_nome":        empresa.get("razao_social", ""),
        "empresa_atividade":   empresa.get("atividade", ""),
        "socio_nome":          familiar["nome"],
        "relacao_familiar":    familiar["relacao"],
        "contrato_id":         contrato.get("id", ""),
        "contrato_orgao":      contrato.get("orgao", ""),
        "contrato_objeto":     str(contrato.get("objeto", ""))[:300],
        "contrato_uf":         contrato.get("uf", ""),
        "valor_contrato":      float(contrato.get("valor", 0)),
        "score_suspeicao":     score,
        "criadoEm":            now,
        "atualizadoEm":        now,
        "notificado":          False,
        "verificadoManualmente": False,
    }


# ─── Motor de colisão ─────────────────────────────────────────────────────────
def run_collision_scan(
    networks:  dict[str, dict],
    contracts: list[dict],
    dry_run:   bool,
    db:        Any,
    bq_client: Any,
) -> list[dict]:
    """
    Cruza contratos públicos com redes familiares.
    Retorna lista de alertas Nível 5 gerados.
    """
    alertas    = []
    seen_cnpjs = {}  # cnpj → qsa cache

    log.info("Iniciando scan: %d contratos × %d redes familiares",
             len(contracts), len(networks))

    for contrato in contracts:
        cnpj   = re.sub(r"\D", "", contrato.get("cnpj", ""))
        if not cnpj or len(cnpj) != 14:
            continue

        # QSA: cache por CNPJ
        if cnpj not in seen_cnpjs:
            qsa = get_qsa(cnpj)
            seen_cnpjs[cnpj] = qsa
        else:
            qsa = seen_cnpjs[cnpj]

        if not qsa:
            log.debug("  CNPJ %s sem QSA público", cnpj)
            continue

        socios_nomes = [s.get("nome_socio", "") for s in qsa]

        # Para cada rede familiar, cruzar sócios
        for parl_id, network in networks.items():
            membros  = network.get("membros", [])
            parl_uf  = network.get("uf", "")
            cont_uf  = contrato.get("uf", "")

            # Relevância geográfica: contrato no estado de atuação do parlamentar
            # ou estado adjacente → aumenta peso
            geo_match = (parl_uf == cont_uf)

            for membro in membros:
                membro_nome = membro.get("nome", "")
                if not membro_nome:
                    continue

                for socio_nome in socios_nomes:
                    if not socio_nome:
                        continue

                    if name_similarity(membro_nome, socio_nome):
                        relacao = membro.get("relacao", "outro")
                        score   = PESO_POR_RELACAO.get(relacao, PESO_OUTRO)
                        if geo_match:
                            score = min(score + 5, 100)

                        log.warning(
                            "  ⚠️ MATCH N5 · %s (%s) ↔ sócio '%s' em CNPJ %s · contrato=%s · score=%d",
                            membro_nome, relacao, socio_nome, cnpj,
                            contrato.get("id"), score,
                        )

                        alerta = generate_nivel5_alert(
                            parlamentar_id   = parl_id,
                            parlamentar_nome = network.get("parlamentar_nome", "–"),
                            uf               = parl_uf,
                            partido          = network.get("partido", "–"),
                            familiar         = {"nome": membro_nome, "relacao": relacao},
                            empresa          = {
                                "cnpj":        cnpj,
                                "razao_social": contrato.get("razao_social", ""),
                                "atividade":    "",
                            },
                            contrato = contrato,
                            score    = score,
                        )

                        alertas.append(alerta)

                        # Persistir no Firestore
                        if not dry_run and db:
                            try:
                                db.collection(FS_ALERTAS).document(alerta["id"]).set(
                                    alerta, merge=True
                                )
                            except Exception as e:
                                log.error("  Firestore save error: %s", e)

    log.info("Scan concluído: %d alertas Nível 5 gerados", len(alertas))

    # Persistir no BigQuery
    if not dry_run and bq_client and alertas:
        try:
            bq_client.insert_rows_json(BQ_ALERTAS_N5, alertas[:500])
            log.info("✅ BigQuery %s: %d registros", BQ_ALERTAS_N5, len(alertas))
        except Exception as e:
            log.error("BigQuery N5 error: %s", e)

    return alertas


# ─── Orquestrador ─────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="A.S.M.O.D.E.U.S. — Collision Scanner (Contratos x Familiares)"
    )
    parser.add_argument("--gcp-project",  default=GCP_PROJECT)
    parser.add_argument("--fs-project",   default=FIRESTORE_PROJECT)
    parser.add_argument("--uf",           default=None, help="Filtrar por UF")
    parser.add_argument("--parl-id",      default=None, help="Processar 1 parlamentar")
    parser.add_argument("--dry-run",      action="store_true")
    parser.add_argument("--mock-data",    action="store_true",
                        help="Usar dados mock (contratos + familiares do 15_family_oracle)")
    args = parser.parse_args()

    db = bq_client = None
    if not args.dry_run:
        db        = init_firestore(args.fs_project)
        bq_client = init_bigquery(args.gcp_project)

    # Carregar redes familiares
    if args.mock_data or not db:
        # Simular rede do "Marquinho Boi"
        from engines_15_family_oracle import get_mock_family_network  # type: ignore
        mock_parl  = {"id": "999999", "nome": "João Silva", "partido": "PX", "uf": "SP"}
        mock_net   = get_mock_family_network(mock_parl)
        from dataclasses import asdict
        networks = {
            "999999": {
                "parlamentar_id":   "999999",
                "parlamentar_nome": mock_parl["nome"],
                "uf":               mock_parl["uf"],
                "partido":          mock_parl["partido"],
                "membros": [asdict(m) for m in mock_net.membros],
            }
        }
        log.info("[MOCK] Rede familiar carregada: %d membros", len(mock_net.membros))
    else:
        networks = load_family_networks(db)

    if args.parl_id and args.parl_id in networks:
        networks = {args.parl_id: networks[args.parl_id]}

    # Carregar contratos
    contracts = load_contracts_from_bigquery(bq_client, args.uf)
    if args.mock_data or not bq_client:
        contracts = get_mock_contracts(args.uf)
        log.info("[MOCK] Contratos carregados: %d", len(contracts))

    # Executar colisão
    alertas = run_collision_scan(networks, contracts, args.dry_run, db, bq_client)

    # Resumo
    print("\n" + "═" * 60)
    print(f" RELATÓRIO FINAL — A.S.M.O.D.E.U.S. Contract Collision")
    print("═" * 60)
    print(f" Contratos analisados: {len(contracts)}")
    print(f" Redes familiares:     {len(networks)}")
    print(f" Alertas Nível 5:      {len(alertas)}")
    if alertas:
        for a in alertas[:5]:
            print(f"   ⚠️  {a['parlamentar_nome']} ← {a['relacao_familiar']}: {a['empresa_nome']}")
            print(f"      Contrato: {a['contrato_orgao']} · R$ {a['valor_contrato']:,.0f}")
    print("═" * 60)


if __name__ == "__main__":
    main()
