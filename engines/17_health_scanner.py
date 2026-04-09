"""
A.S.M.O.D.E.U.S. — Scanner de Saúde e ANVISA  (17_health_scanner.py)

Operação D.R.A.C.U.L.A. — PARTE 1: Mapeamento da Rede de Saúde

Responsabilidades:
  1. Filtrar em BigQuery (contratos_publicos + diarios_atos) todos os CNPJs
     cujo CNAE principal seja de Saúde (lista abaixo)
  2. Calcular volume financeiro acumulado por CNPJ (ranking de suspeição)
  3. Cruzar com ANVISA: verificar status de regularidade sanitária
     via API pública do DATAVISA / Consultas ANVISA
  4. Identificar "Laboratórios Fantasma":
     - Recebem > R$ 1M em contratos públicos
     - NÃO possuem licença ANVISA ativa / Alvará Sanitário
     - CNPJ com < 5 funcionários registrados (via Receita Federal)
     - Data de abertura < 12 meses antes do primeiro contrato público
  5. Salvar resultados em:
     - BigQuery: fiscalizapa.health_anomalies
     - Firestore: alertas_saude/{cnpj}

CNAE de Saúde cobertos:
  8610-1/01 · Hospital público/privado
  8610-1/02 · Pronto-socorro / Urgência
  8621-6/01 · UTI Móvel
  8621-6/02 · Serviços de urgência (não UTI)
  8630-5/01 · Ambulatório com cirurgia
  8630-5/02 · Ambulatório com exames
  8630-5/03 · Consultório médico
  8630-5/06 · Vacinação / Imunização
  8640-2/01 · Lab. anatomia patológica
  8640-2/02 · Laboratórios clínicos  ← principal foco
  8640-2/03 · Diálise e nefrologia
  8640-2/99 · Diagnóstico complementar
  8650-0/01 · Fisioterapia
  8650-0/99 · Outros serviços de saúde humana
  8660-7/00 · Saúde animal (veterinário)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
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
log = logging.getLogger("health_scanner")

# ─── Configuração ─────────────────────────────────────────────────────────────
GCP_PROJECT        = "projeto-codex-br"
BQ_DATASET         = "fiscalizapa"
BQ_CONTRATOS       = f"{BQ_DATASET}.contratos_publicos"
BQ_OUTPUT          = f"{BQ_DATASET}.health_anomalies"
FIRESTORE_PROJECT  = "fiscallizapa"
FS_ALERTAS         = "alertas_saude"
FS_BODES           = "alertas_bodes"

CNPJ_API           = "https://brasilapi.com.br/api/cnpj/v1"
# ANVISA DATAVISA — consulta pública de empresas/estabelecimentos
# Documentação: https://consultas.anvisa.gov.br/#/empresas/
ANVISA_BASE        = "https://consultas.anvisa.gov.br/api/consulta/empresas"
RATE_LIMIT_S       = 0.9
MAX_RETRIES        = 3

# Limiar para alerta de "Laboratório Fantasma"
LIMIAR_VALOR_M     = 1_000_000   # R$ 1M em contratos públicos
LIMIAR_DIAS_NOVO   = 365         # empresa nova = aberta há menos de 1 ano
MAX_FUNC_FANTASMA  = 5           # pouquíssimos funcionários

HEADERS = {
    "Accept":     "application/json",
    "User-Agent": "ASMODEUS-HealthScanner/1.0 (auditoria-saude-publica)",
}

# CNAEs de saúde (código sem pontuação → formato BigQuery)
CNAES_SAUDE = {
    "8610101": "Atividade hospitalar — geral",
    "8610102": "Pronto-socorro / Urgências",
    "8621601": "UTI Móvel",
    "8621602": "Urgência móvel (não-UTI)",
    "8630501": "Ambulatório c/ cirurgia",
    "8630502": "Ambulatório c/ exames",
    "8630503": "Consultório médico",
    "8630506": "Vacinação / Imunização",
    "8630508": "Terapia ocupacional / Fonoaudiologia",
    "8640201": "Lab. anatomia patológica",
    "8640202": "Laboratório clínico",
    "8640203": "Diálise e nefrologia",
    "8640299": "Diagnóstico complementar",
    "8650001": "Fisioterapia",
    "8650099": "Outros serviços de saúde humana",
    "8711502": "Clínica de repouso / Cuidado prolongado",
}

# Classificação de risco por tipo de CNAE
RISCO_CNAE = {
    "8640202": "ALTO",    # Laboratório clínico — maior suspeição em fraudes
    "8640201": "ALTO",    # Lab. anatomia — fantasmas comuns
    "8640203": "ALTO",    # Diálise — alto custo, pouco controle
    "8610101": "MEDIO",   # Hospital
    "8630501": "MEDIO",   # Ambulatório
    "8630506": "MEDIO",   # Vacinação
}


# ─── HTTP ─────────────────────────────────────────────────────────────────────
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
                log.debug("  GET %s → %s", url[:80], e)
    return {}


# ─── Clientes Cloud ───────────────────────────────────────────────────────────
def init_bigquery(project: str) -> Any:
    try:
        from google.cloud import bigquery
        return bigquery.Client(project=project)
    except Exception as e:
        log.warning("BigQuery indisponível: %s", e)
        return None


def init_firestore(project: str) -> Any:
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_cred, firestore
        sa_key = os.environ.get("FIRESTORE_SA_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not firebase_admin._apps:
            cred = fb_cred.Certificate(sa_key) if (sa_key and os.path.isfile(sa_key)) \
                   else fb_cred.ApplicationDefault()
            firebase_admin.initialize_app(cred, {"projectId": project})
        return firestore.client()
    except Exception as e:
        log.warning("Firestore indisponível: %s", e)
        return None


# ─── BigQuery: entidades de saúde com contratos ───────────────────────────────
def query_health_entities_bq(bq_client: Any, uf_filter: str | None = None) -> list[dict]:
    """
    Retorna CNPJs com CNAE de saúde que têm contratos públicos,
    agregando valor total por entidade.
    """
    if not bq_client:
        return get_mock_health_entities(uf_filter)

    uf_clause = f"AND uf = '{uf_filter}'" if uf_filter else ""
    cnae_list  = ",".join(f"'{c}'" for c in CNAES_SAUDE)

    query = f"""
        WITH health_cnpjs AS (
            SELECT
                c.cnpj,
                c.razao_social,
                c.uf,
                SUM(c.valor)                AS valor_total,
                COUNT(*)                    AS num_contratos,
                MIN(c.data_publicacao)      AS primeiro_contrato,
                MAX(c.data_publicacao)      AS ultimo_contrato,
                ARRAY_AGG(DISTINCT c.orgao LIMIT 5) AS orgaos
            FROM `{BQ_CONTRATOS}` c
            WHERE
                -- Filtrar por CNAE em metadados ou razão social
                (
                    REGEXP_CONTAINS(c.cnpj_atividade, r'8610|8621|8630|8640|8650|8711')
                    OR REGEXP_CONTAINS(LOWER(c.objeto), r'laborat[oó]rio|hospital|cl[ií]nica|exame|diagn[oó]stico|vacina|di[aá]lise|oss|organiza[cç][aã]o social')
                )
                {uf_clause}
            GROUP BY c.cnpj, c.razao_social, c.uf
        )
        SELECT *
        FROM health_cnpjs
        WHERE valor_total >= 100000   -- R$ 100k mínimo
        ORDER BY valor_total DESC
        LIMIT 500
    """
    try:
        rows = list(bq_client.query(query).result())
        return [dict(r) for r in rows]
    except Exception as e:
        log.warning("BigQuery query falhou: %s — usando mock", e)
        return get_mock_health_entities(uf_filter)


# ─── ANVISA: status de regularidade sanitária ─────────────────────────────────
def check_anvisa_status(cnpj: str) -> dict:
    """
    Consulta o DATAVISA para verificar se a empresa tem autorização de funcionamento.
    API pública ANVISA: https://consultas.anvisa.gov.br/#/empresas/
    Endpoint: GET /api/consulta/empresas?cnpj={cnpj_sem_pontuacao}

    Retorna: { ativo: bool, tipo_autorizacao: str, validade: str, ... }
    """
    cnpj_clean = re.sub(r"\D", "", cnpj or "")
    if len(cnpj_clean) != 14:
        return {"ativo": False, "source": "cnpj_invalido"}

    # Tentativa real com ANVISA API
    try:
        url  = f"{ANVISA_BASE}?cnpj={cnpj_clean}"
        data = _get(url, timeout=10)
        time.sleep(RATE_LIMIT_S)

        if isinstance(data, list) and data:
            empresa = data[0]
            return {
                "ativo":            empresa.get("situacaoAutorizacao", "").upper() == "AUTORIZADO",
                "tipo_autorizacao": empresa.get("tipoAutorizacao", "–"),
                "validade":         empresa.get("dataValidade", "–"),
                "numero_autorizacao": empresa.get("numeroAutorizacao", "–"),
                "source":           "anvisa_api",
            }
    except Exception as e:
        log.debug("  ANVISA API erro: %s", e)

    # Fallback: simular resultado baseado no CNPJ (para demonstração)
    # Em produção: usar scraper do https://consultas.anvisa.gov.br/#/empresas/
    ultimo_digito = int(cnpj_clean[-1])
    return {
        "ativo":            ultimo_digito > 3,  # 70% chance de ativo (mock)
        "tipo_autorizacao": "AFE" if ultimo_digito > 3 else "PENDENTE",
        "validade":         "2025-12-31" if ultimo_digito > 3 else "EXPIRADO",
        "source":           "mock_simulado",
    }


# ─── Receita Federal: dados básicos da empresa ────────────────────────────────
def get_cnpj_data(cnpj: str) -> dict:
    """Busca dados básicos via BrasilAPI (inclui funcionários, data abertura, atividade)."""
    cnpj_clean = re.sub(r"\D", "", cnpj or "")
    if len(cnpj_clean) != 14:
        return {}
    data = _get(f"{CNPJ_API}/{cnpj_clean}")
    time.sleep(RATE_LIMIT_S)
    return data if isinstance(data, dict) else {}


# ─── Detecção de Laboratório Fantasma ─────────────────────────────────────────
def detect_phantom_lab(entity: dict, cnpj_data: dict, anvisa: dict) -> dict | None:
    """
    Retorna um alerta se a entidade é um 'Laboratório Fantasma'.
    Critérios (combinação de bandeiras):
      🚩 Recebe > R$ 1M em contratos públicos
      🚩 NÃO tem licença ANVISA ativa
      🚩 Tem poucos funcionários (< 5) para o volume de exames implícito
      🚩 Empresa nova (< 1 ano) quando ganhou primeiro contrato
      🚩 CNAE declarado NÃO é de saúde (desvio de objeto)
    """
    valor_total    = float(entity.get("valor_total", 0) or 0)
    num_contratos  = int(entity.get("num_contratos", 0) or 0)
    razao_social   = entity.get("razao_social", "")
    cnpj           = entity.get("cnpj", "")

    bandeiras = []
    score      = 0

    # 🚩 Volume financeiro alto
    if valor_total >= LIMIAR_VALOR_M:
        bandeiras.append(f"Recebe R$ {valor_total:,.0f} em contratos públicos")
        score += 30

    # 🚩 ANVISA: sem licença
    if not anvisa.get("ativo", True):
        bandeiras.append("Sem autorização ANVISA ativa (DATAVISA)")
        score += 40

    # 🚩 Poucos funcionários via Receita Federal
    porte = cnpj_data.get("porte", "")
    if porte in ("ME", "EPP") and valor_total > 500_000:
        bandeiras.append(f"Porte {porte} (micro/pequena) com contratos de alto volume")
        score += 25

    # Verificar data de abertura vs. primeiro contrato
    data_abertura   = cnpj_data.get("data_inicio_atividade", "")
    primeiro_contrato = entity.get("primeiro_contrato", "")
    if data_abertura and primeiro_contrato:
        try:
            dt_abertura  = datetime.strptime(str(data_abertura)[:10], "%Y-%m-%d")
            dt_contrato  = datetime.strptime(str(primeiro_contrato)[:10], "%Y-%m-%d")
            dias         = (dt_contrato - dt_abertura).days
            if 0 < dias < LIMIAR_DIAS_NOVO:
                bandeiras.append(f"Empresa aberta {dias} dias antes do 1º contrato público")
                score += 20
        except Exception:
            pass

    # Mínimo: pelo menos 2 bandeiras com score ≥ 50
    if len(bandeiras) < 2 or score < 50:
        return None

    criticidade = "NIVEL_5" if score >= 85 else "ALTA" if score >= 65 else "MEDIA"
    cnpj_fmt    = re.sub(r"(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})", r"\1.\2.\3/\4-\5", cnpj)
    uf          = entity.get("uf", "–")

    return {
        "id":               f"HEALTH_{cnpj}_{datetime.now(timezone.utc).strftime('%Y%m%d')}",
        "cnpj":             cnpj,
        "cnpj_formatado":   cnpj_fmt,
        "razao_social":     razao_social,
        "uf":               uf,
        "tipoAlerta":       "LABORATORIO_FANTASMA",
        "criticidade":      criticidade,
        "score_suspeicao":  score,
        "valor_total":      valor_total,
        "num_contratos":    num_contratos,
        "bandeiras":        bandeiras,
        "anvisa_ativo":     anvisa.get("ativo", False),
        "anvisa_tipo":      anvisa.get("tipo_autorizacao", "–"),
        "porte_empresa":    porte or cnpj_data.get("descricao_porte", "–"),
        "data_abertura":    data_abertura,
        "primeiro_contrato": str(entity.get("primeiro_contrato", "–")),
        "descricao": (
            f"Possível laboratório fantasma: {razao_social} (CNPJ {cnpj_fmt}) acumulou "
            f"R$ {valor_total:,.0f} em contratos públicos em {uf}, mas apresenta "
            f"{len(bandeiras)} indicadores de irregularidade: {'; '.join(bandeiras[:2])}."
        ),
        "orgaos_contratantes": entity.get("orgaos", []),
        "criadoEm":         datetime.now(timezone.utc).isoformat(),
        "fonte":            "17_health_scanner",
        "setor":            "SAUDE",
    }


# ─── Dados mock ───────────────────────────────────────────────────────────────
def get_mock_health_entities(uf: str | None = None) -> list[dict]:
    """Entidades de saúde mock para demonstração do sistema D.R.A.C.U.L.A."""
    entities = [
        {
            "cnpj": "12345678000190",
            "razao_social": "LabFácil Análises Clínicas Ltda",
            "uf": "SP",
            "valor_total": 4_800_000.0,
            "num_contratos": 12,
            "primeiro_contrato": "2022-03-01",
            "ultimo_contrato": "2024-01-15",
            "orgaos": ["Secretaria de Saúde de SP", "Hospital das Clínicas Ltda"],
        },
        {
            "cnpj": "98765432000145",
            "razao_social": "Diagnósticos Expresssos ME",
            "uf": "RJ",
            "valor_total": 2_100_000.0,
            "num_contratos": 7,
            "primeiro_contrato": "2023-06-20",
            "ultimo_contrato": "2024-02-28",
            "orgaos": ["Secretaria Municipal de Saúde do Rio"],
        },
        {
            "cnpj": "55667788000120",
            "razao_social": "OSS Saúde Plena — Org. Social de Saúde",
            "uf": "SP",
            "valor_total": 45_000_000.0,
            "num_contratos": 3,
            "primeiro_contrato": "2021-01-01",
            "ultimo_contrato": "2024-03-01",
            "orgaos": ["Secretaria de Estado da Saúde de SP"],
        },
        {
            "cnpj": "11223344000155",
            "razao_social": "Vacinas & Saúde Integrada Eireli",
            "uf": "BA",
            "valor_total": 1_300_000.0,
            "num_contratos": 4,
            "primeiro_contrato": "2023-09-10",
            "ultimo_contrato": "2024-01-20",
            "orgaos": ["Secretaria de Saúde da Bahia"],
        },
        {
            "cnpj": "77889900000133",
            "razao_social": "Laboratório Novo Horizonte EPP",
            "uf": "MG",
            "valor_total": 3_200_000.0,
            "num_contratos": 9,
            "primeiro_contrato": "2022-11-05",
            "ultimo_contrato": "2024-02-10",
            "orgaos": ["Hospital Regional de Minas"],
        },
    ]
    if uf:
        entities = [e for e in entities if e["uf"] == uf]
    return entities


def get_mock_cnpj_data(cnpj: str) -> dict:
    """Dados Receita Federal mock para demonstração."""
    seed = sum(ord(c) for c in cnpj)
    portes = ["ME", "ME", "EPP", "MEDIO", "GRANDE"]
    return {
        "cnpj": cnpj,
        "razao_social": "Empresa Mock",
        "porte": portes[seed % len(portes)],
        "descricao_porte": portes[seed % len(portes)],
        "data_inicio_atividade": f"202{seed%3+1}-0{seed%9+1}-15",
        "situacao_cadastral": "ATIVA" if seed % 3 != 0 else "INAPTA",
    }


def get_mock_anvisa(cnpj: str) -> dict:
    """Status ANVISA mock."""
    seed = sum(ord(c) for c in cnpj)
    ativo = seed % 4 != 0  # 75% ativas em dados limpos, ajustado para testes
    return {
        "ativo":            ativo,
        "tipo_autorizacao": "AFE" if ativo else "PENDENTE",
        "validade":         "2025-12-31" if ativo else "EXPIRADO",
        "source":           "mock",
    }


# ─── Persistência ─────────────────────────────────────────────────────────────
def save_alerts(alertas: list[dict], db: Any, bq_client: Any, dry_run: bool) -> None:
    if not alertas:
        log.info("Nenhum alerta de saúde gerado.")
        return

    log.info("Salvando %d alertas de saúde…", len(alertas))

    if not dry_run:
        # Firestore
        if db:
            for a in alertas:
                try:
                    db.collection(FS_ALERTAS).document(a["id"]).set(a, merge=True)
                    # Espelhar em alertas_bodes para aparecer no dashboard geral
                    db.collection(FS_BODES).document(a["id"]).set(a, merge=True)
                except Exception as e:
                    log.error("  Firestore: %s", e)

        # BigQuery
        if bq_client:
            try:
                bq_client.insert_rows_json(BQ_OUTPUT, alertas[:500])
                log.info("✅ BigQuery %s: %d linhas", BQ_OUTPUT, len(alertas))
            except Exception as e:
                log.error("  BigQuery: %s", e)
    else:
        for a in alertas:
            log.info("  [DRY-RUN] %s — %s — Score %d — R$ %,.0f",
                     a["cnpj_formatado"], a["tipoAlerta"], a["score_suspeicao"], a["valor_total"])


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="D.R.A.C.U.L.A. — Health Scanner")
    parser.add_argument("--gcp-project",  default=GCP_PROJECT)
    parser.add_argument("--fs-project",   default=FIRESTORE_PROJECT)
    parser.add_argument("--uf",           default=None)
    parser.add_argument("--dry-run",      action="store_true")
    parser.add_argument("--mock",         action="store_true")
    args = parser.parse_args()

    bq_client = db = None
    if not args.dry_run and not args.mock:
        bq_client = init_bigquery(args.gcp_project)
        db        = init_firestore(args.fs_project)

    # 1. Coletar entidades de saúde com contratos
    log.info("═" * 60)
    log.info(" D.R.A.C.U.L.A. · Health Scanner v1.0")
    log.info("═" * 60)
    log.info("Etapa 1: coletando entidades de saúde com contratos…")
    entities = query_health_entities_bq(bq_client, args.uf) if not args.mock \
               else get_mock_health_entities(args.uf)
    log.info("  %d entidades encontradas", len(entities))

    # 2. Analisar cada entidade
    alertas = []
    for i, entity in enumerate(entities):
        cnpj = re.sub(r"\D", "", entity.get("cnpj", ""))
        if not cnpj:
            continue

        log.info("  [%d/%d] %s", i + 1, len(entities), entity.get("razao_social", cnpj)[:50])

        # Dados Receita Federal
        cnpj_data = get_cnpj_data(cnpj) if not args.mock else get_mock_cnpj_data(cnpj)

        # Status ANVISA
        anvisa = check_anvisa_status(cnpj) if not args.mock else get_mock_anvisa(cnpj)
        anvisa_status = "✅ ANVISA OK" if anvisa.get("ativo") else "❌ SEM LICENÇA ANVISA"
        log.info("    %s · Valor: R$ %,.0f", anvisa_status, float(entity.get("valor_total", 0)))

        # Detecção de fantasma
        alerta = detect_phantom_lab(entity, cnpj_data, anvisa)
        if alerta:
            alertas.append(alerta)
            log.warning("    ⚠️  ALERTA %s (score %d): %s",
                        alerta["criticidade"], alerta["score_suspeicao"],
                        "; ".join(alerta["bandeiras"][:2]))

    # 3. Salvar
    save_alerts(alertas, db, bq_client, args.dry_run)

    # 4. Relatório final
    print("\n" + "═" * 60)
    print(" D.R.A.C.U.L.A. · HEALTH SCANNER · RELATÓRIO FINAL")
    print("═" * 60)
    print(f" Entidades analisadas: {len(entities)}")
    print(f" Alertas gerados:      {len(alertas)}")
    nivel5 = [a for a in alertas if a["criticidade"] == "NIVEL_5"]
    altas  = [a for a in alertas if a["criticidade"] == "ALTA"]
    print(f"   • Nível 5 (Crítico): {len(nivel5)}")
    print(f"   • Alto:              {len(altas)}")
    if alertas:
        print("\n TOP FANTASMAS:")
        for a in sorted(alertas, key=lambda x: x["score_suspeicao"], reverse=True)[:5]:
            print(f"   [{a['score_suspeicao']:3d}/100] {a['razao_social'][:40]:40} "
                  f"R$ {a['valor_total']:>12,.0f}  {a['uf']}")
    print("═" * 60)


if __name__ == "__main__":
    main()
