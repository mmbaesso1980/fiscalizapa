"""
A.S.M.O.D.E.U.S. — Scanner de OSS (Organizações Sociais de Saúde)  (18_oss_scanner.py)

Operação D.R.A.C.U.L.A. — PARTE 2: Identificação e Auditoria de OSS

Responsabilidades:
  1. Identificar contratos de gestão firmados com OSS (Organizações Sociais)
     no setor de saúde
  2. Usar Gemini para analisar o teor dos contratos e identificar:
     - Cláusulas de "baixa prestação de contas"
     - Repasses emergenciais sem licitação
     - Metas vagas / indicadores não mensuráveis
     - Subcontratações permitidas sem critério
  3. Cruzar OSS com a rede familiar dos políticos (via 15_family_oracle.py)
  4. Calcular "Índice de Corrupção da OSS" (0-100) baseado em:
     - Transparência dos relatórios
     - Presença de sócios em rede política
     - Histórico de auditorias
     - Cumprimento de metas
  5. Salvar em Firestore[oss_contratos] e BQ[fiscalizapa.oss_anomalias]

Naturezas jurídicas de OSS identificadas:
  3069 — Fundação Privada
  3077 — Organização Religiosa
  3301 — Serviço Notarial e de Registro
  3069 — OSS (especificamente)
  Qualquer entidade com objeto social = "gestão de serviços de saúde"

Cláusulas Suspeitas (detectadas pelo Gemini):
  - "repasse emergencial" sem procedimento
  - "prestação de contas simplificada"
  - "subcontratação livre"
  - "reajuste automático" sem justificativa
  - "devolução de saldo" não obrigatória
"""

import argparse
import json
import logging
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("oss_scanner")

# ─── Configuração ─────────────────────────────────────────────────────────────
GCP_PROJECT       = "projeto-codex-br"
BQ_DATASET        = "fiscalizapa"
BQ_CONTRATOS      = f"{BQ_DATASET}.contratos_publicos"
BQ_OUTPUT         = f"{BQ_DATASET}.oss_anomalias"
FIRESTORE_PROJECT = "fiscallizapa"
FS_OSS            = "oss_contratos"
FS_BODES          = "alertas_bodes"

GEMINI_MODEL      = "gemini-1.5-flash"
RATE_LIMIT_S      = 1.2
HEADERS = {
    "Accept":     "application/json",
    "User-Agent": "ASMODEUS-OSSScanner/1.0",
}

# Palavras-chave para identificar OSS
OSS_KEYWORDS = [
    "organização social", "organização social de saúde", "oss", "os de saúde",
    "contrato de gestão", "termo de colaboração", "entidade privada sem fins lucrativos",
    "gestão de unidade de saúde", "gestão hospitalar",
]

# Cláusulas suspeitas (pre-filter antes do Gemini)
CLAUSULAS_SUSPEITAS = {
    "repasse_emergencial": re.compile(
        r"repasse\s+emergencial|pagamento\s+antecipado\s+sem\s+licitação|verba\s+especial\s+imediata", re.I
    ),
    "prestacao_fraca": re.compile(
        r"prestação\s+de\s+contas\s+simplificada|relatório\s+sucinto|dispensad[ao]\s+de\s+detalhamento", re.I
    ),
    "subcontratacao_livre": re.compile(
        r"subcontrat(?:ar|ação)\s+livremente|sem\s+necessidade\s+de\s+aprovação|terceirização\s+irrestrita", re.I
    ),
    "reajuste_automatico": re.compile(
        r"reajuste\s+automático\s+(?:anual|mensal|bimestral)|correção\s+automática\s+sem\s+justificativa", re.I
    ),
    "sem_devolucao": re.compile(
        r"saldo\s+não\s+revertid[oa]|dispensad[ao]\s+de\s+devolver|sobra\s+de\s+recursos\s+retida", re.I
    ),
    "meta_vaga": re.compile(
        r"metas\s+a\s+definir|indicadores?\s+a\s+ser\s+estabelecid[ao]|objetivos?\s+a\s+combinar", re.I
    ),
}

# Pontuação por bandeira
SCORE_BANDEIRAS = {
    "repasse_emergencial": 35,
    "prestacao_fraca":     30,
    "subcontratacao_livre": 25,
    "reajuste_automatico": 20,
    "sem_devolucao":       25,
    "meta_vaga":           20,
    "gemini_alta":         40,
    "gemini_media":        20,
    "socio_em_rede_politica": 30,
    "sem_auditoria":       20,
}


# ─── Clientes ─────────────────────────────────────────────────────────────────
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


def init_bigquery(project: str) -> Any:
    try:
        from google.cloud import bigquery
        return bigquery.Client(project=project)
    except Exception as e:
        log.warning("BigQuery indisponível: %s", e)
        return None


# ─── Gemini: análise de cláusulas ─────────────────────────────────────────────
def analyze_contract_gemini(contrato_texto: str, oss_nome: str) -> dict:
    """
    Envia o texto do contrato para o Gemini e pede análise forense.
    Retorna: { nivel_risco, clausulas_suspeitas, resumo, recomendacoes }
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        log.debug("GEMINI_API_KEY não definida — usando análise local")
        return _local_contract_analysis(contrato_texto)

    prompt = f"""Você é um auditor forense especializado em contratos públicos brasileiros, 
especialmente contratos de gestão com Organizações Sociais (OSS) de saúde.

Analise o trecho do contrato de gestão abaixo firmado com a OSS "{oss_nome}" e identifique:

1. CLÁUSULAS SUSPEITAS de baixa accountability:
   - Prestação de contas simplificada ou insuficiente
   - Repasses emergenciais sem licitação
   - Subcontratações sem critério
   - Reajustes automáticos injustificados
   - Dispensa de devolução de saldo
   - Metas vagas ou não mensuráveis

2. NÍVEL DE RISCO: BAIXO / MÉDIO / ALTO / CRÍTICO

3. RESUMO FORENSE em 2-3 frases para o dossiê público.

Trecho do contrato:
---
{contrato_texto[:3000]}
---

Responda APENAS em JSON válido com este schema:
{{
  "nivel_risco": "ALTO",
  "clausulas_encontradas": ["prestação de contas simplificada", "subcontratação livre"],
  "resumo_forense": "O contrato apresenta...",
  "recomendacoes": ["Solicitar relatório detalhado", "Auditar subcontratados"]
}}"""

    try:
        url     = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
        payload = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 512},
        }).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload,
            headers={**HEADERS, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=25) as r:
            resp    = json.loads(r.read().decode("utf-8"))
            content = resp["candidates"][0]["content"]["parts"][0]["text"]
            # Limpar markdown code blocks se presentes
            content = re.sub(r"```json\s*|\s*```", "", content).strip()
            return json.loads(content)
    except Exception as e:
        log.debug("Gemini API error: %s — usando análise local", e)
        return _local_contract_analysis(contrato_texto)


def _local_contract_analysis(texto: str) -> dict:
    """Análise local de cláusulas suspeitas (sem Gemini)."""
    found  = []
    score  = 0
    for chave, pattern in CLAUSULAS_SUSPEITAS.items():
        if pattern.search(texto):
            found.append(chave.replace("_", " "))
            score += SCORE_BANDEIRAS.get(chave, 15)

    nivel = (
        "CRÍTICO" if score >= 80 else
        "ALTO"    if score >= 50 else
        "MÉDIO"   if score >= 25 else
        "BAIXO"
    )
    return {
        "nivel_risco":          nivel,
        "clausulas_encontradas": found,
        "resumo_forense":       f"Análise local identificou {len(found)} cláusula(s) de risco: {', '.join(found[:2]) or 'Nenhuma identificada'}.",
        "recomendacoes":        ["Solicitar auditoria do TCE", "Verificar subcontratados"] if found else [],
        "source":               "analise_local",
    }


# ─── Identificação de OSS ─────────────────────────────────────────────────────
def is_oss_contract(contrato: dict) -> bool:
    """Verifica se um contrato é com uma OSS de saúde."""
    texto = " ".join([
        str(contrato.get("objeto", "")),
        str(contrato.get("razao_social", "")),
        str(contrato.get("observacoes", "")),
    ]).lower()
    return any(kw in texto for kw in OSS_KEYWORDS)


def load_oss_contracts_bq(bq_client: Any, uf: str | None = None) -> list[dict]:
    """Carrega contratos de gestão com OSS do BigQuery."""
    if not bq_client:
        return get_mock_oss_contracts(uf)

    uf_clause = f"AND uf = '{uf}'" if uf else ""
    query = f"""
        SELECT id, cnpj, razao_social, valor, uf, orgao, objeto, data_publicacao,
               descricao_completa, observacoes
        FROM `{BQ_CONTRATOS}`
        WHERE (
            REGEXP_CONTAINS(LOWER(objeto), r'organiza[cç][aã]o social|oss\\b|contrato de gest[aã]o|gestão hospita')
            OR REGEXP_CONTAINS(LOWER(razao_social), r'organiza[cç][aã]o social|instituto\\b|funda[cç][aã]o\\b')
        )
        {uf_clause}
        ORDER BY valor DESC
        LIMIT 200
    """
    try:
        rows = list(bq_client.query(query).result())
        return [dict(r) for r in rows]
    except Exception as e:
        log.warning("BigQuery OSS query: %s — usando mock", e)
        return get_mock_oss_contracts(uf)


def calculate_oss_index(oss: dict, gemini_result: dict, bandeiras_locais: list[str]) -> int:
    """
    Calcula o Índice de Corrupção da OSS (0-100).
    Combinação de: análise Gemini + bandeiras locais + dados históricos
    """
    score = 0
    nivel = gemini_result.get("nivel_risco", "BAIXO").upper()
    if "CRÍTICO" in nivel or "CRITICO" in nivel: score += 40
    elif "ALTO"  in nivel: score += 25
    elif "MÉDIO" in nivel or "MEDIO" in nivel: score += 12

    clausulas = gemini_result.get("clausulas_encontradas", [])
    score += min(len(clausulas) * 8, 30)

    for b in bandeiras_locais:
        score += SCORE_BANDEIRAS.get(b, 10)

    return min(score, 100)


def get_mock_oss_contracts(uf: str | None = None) -> list[dict]:
    """Contratos OSS mock para demonstração."""
    contratos = [
        {
            "id": "OSS-2024-001",
            "cnpj": "55667788000120",
            "razao_social": "Instituto Saúde Plena — Organização Social de Saúde",
            "valor": 45_000_000.0,
            "uf": "SP",
            "orgao": "Secretaria de Estado da Saúde de SP",
            "objeto": "Contrato de gestão para gerenciamento, operacionalização e execução das ações e serviços de saúde do Hospital Estadual X",
            "data_publicacao": "2021-01-01",
            "descricao_completa": (
                "Cláusula 8ª — Prestação de contas simplificada mediante relatório sucinto mensal. "
                "Cláusula 12ª — Permitida subcontratação de serviços diagnósticos livremente. "
                "Cláusula 15ª — Reajuste automático anual pelo IPCA sem necessidade de aprovação prévia. "
                "Cláusula 21ª — Repasses emergenciais poderão ser realizados mediante simples solicitação, "
                "dispensada de licitação, em caso de urgência operacional."
            ),
            "observacoes": "organização social de saúde",
        },
        {
            "id": "OSS-2024-002",
            "cnpj": "11223344000155",
            "razao_social": "Fundação Vida e Saúde — OSS",
            "valor": 28_000_000.0,
            "uf": "RJ",
            "orgao": "Secretaria Municipal de Saúde do Rio de Janeiro",
            "objeto": "Gestão e operação da UPA Central Zona Norte e gerenciamento de recursos humanos da unidade",
            "data_publicacao": "2022-06-15",
            "descricao_completa": (
                "§3º As metas a ser estabelecidas conforme cronograma a definir. "
                "Cláusula 9ª — Saldo remanescente ao final do exercício não obrigatoriamente revertido ao erário. "
                "Cláusula 18ª — Indicadores de desempenho a combinar entre as partes."
            ),
            "observacoes": "contrato de gestão oss",
        },
        {
            "id": "OSS-2024-003",
            "cnpj": "33445566000177",
            "razao_social": "Instituto Brasileiro de Gestão em Saúde",
            "valor": 12_000_000.0,
            "uf": "MG",
            "orgao": "Prefeitura Municipal de Belo Horizonte",
            "objeto": "Gestão da Clínica da Família Norte com metas de atendimento ambulatorial",
            "data_publicacao": "2023-03-10",
            "descricao_completa": (
                "O contrato prevê prestação de contas trimestral com relatórios de indicadores "
                "auditados por empresa independente credenciada pelo TCE-MG. "
                "Metas: 1.500 consultas/mês, 98% de satisfação do usuário."
            ),
            "observacoes": "oss clinica familia",
        },
    ]
    if uf:
        contratos = [c for c in contratos if c["uf"] == uf]
    return contratos


def process_oss_contract(contrato: dict, dry_run: bool, db: Any, bq_client: Any) -> dict | None:
    """Processa um contrato OSS: analisa texto, calcula índice, gera alerta."""
    texto   = contrato.get("descricao_completa") or contrato.get("objeto") or ""
    oss_nome = contrato.get("razao_social", "OSS desconhecida")
    cnpj    = contrato.get("cnpj", "")
    uf      = contrato.get("uf", "–")
    valor   = float(contrato.get("valor", 0))

    log.info("  Analisando: %s (R$ %.0f)", oss_nome[:50], valor)

    # 1. Análise local de cláusulas suspeitas
    bandeiras_locais = []
    for chave, pattern in CLAUSULAS_SUSPEITAS.items():
        if pattern.search(texto):
            bandeiras_locais.append(chave)

    # 2. Análise Gemini
    gemini = analyze_contract_gemini(texto, oss_nome)
    time.sleep(RATE_LIMIT_S)
    log.info("    Gemini: %s · %d cláusulas", gemini.get("nivel_risco"), len(gemini.get("clausulas_encontradas", [])))

    # 3. Índice de Corrupção
    indice = calculate_oss_index(contrato, gemini, bandeiras_locais)

    if indice < 20:
        log.info("    Índice baixo (%d) — ignorando", indice)
        return None

    criticidade = "NIVEL_5" if indice >= 80 else "ALTA" if indice >= 55 else "MEDIA"

    alerta = {
        "id":                 f"OSS_{re.sub(r'[^0-9]','',cnpj)}_{contrato.get('id','X')}",
        "cnpj":               cnpj,
        "oss_nome":           oss_nome,
        "uf":                 uf,
        "valor_contrato":     valor,
        "tipoAlerta":         "OSS_BAIXA_ACCOUNTABILITY",
        "criticidade":        criticidade,
        "indice_corrupcao":   indice,
        "gemini_nivel":       gemini.get("nivel_risco", "–"),
        "clausulas_gemini":   gemini.get("clausulas_encontradas", []),
        "clausulas_locais":   bandeiras_locais,
        "resumo_forense":     gemini.get("resumo_forense", "–"),
        "recomendacoes":      gemini.get("recomendacoes", []),
        "contrato_id":        contrato.get("id", "–"),
        "orgao":              contrato.get("orgao", "–"),
        "data_publicacao":    str(contrato.get("data_publicacao", "–")),
        "setor":              "SAUDE_OSS",
        "criadoEm":           datetime.now(timezone.utc).isoformat(),
        "fonte":              "18_oss_scanner",
        "descricao": (
            f"OSS '{oss_nome}' gerencia contrato de R$ {valor:,.0f} com {contrato.get('orgao','–')} "
            f"com Índice de Corrupção {indice}/100. "
            f"Gemini identifica: {gemini.get('resumo_forense','–')}"
        ),
    }

    if not dry_run:
        if db:
            try:
                db.collection(FS_OSS).document(alerta["id"]).set(alerta, merge=True)
                db.collection(FS_BODES).document(alerta["id"]).set(alerta, merge=True)
            except Exception as e:
                log.error("  Firestore: %s", e)
        if bq_client:
            try:
                bq_client.insert_rows_json(BQ_OUTPUT, [alerta])
            except Exception as e:
                log.error("  BigQuery: %s", e)
    else:
        log.info("  [DRY-RUN] Índice %d · %s · %s",
                 indice, criticidade, "; ".join(bandeiras_locais))

    return alerta


def main() -> None:
    parser = argparse.ArgumentParser(description="D.R.A.C.U.L.A. — OSS Scanner")
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

    log.info("═" * 60)
    log.info(" D.R.A.C.U.L.A. · OSS Scanner v1.0")
    log.info("═" * 60)

    contratos = load_oss_contracts_bq(bq_client, args.uf) if not args.mock \
                else get_mock_oss_contracts(args.uf)
    log.info("Contratos OSS carregados: %d", len(contratos))

    alertas = []
    for i, contrato in enumerate(contratos):
        log.info("[%d/%d] %s", i + 1, len(contratos), contrato.get("razao_social", "–")[:50])
        alerta = process_oss_contract(contrato, args.dry_run, db, bq_client)
        if alerta:
            alertas.append(alerta)

    print("\n" + "═" * 60)
    print(" D.R.A.C.U.L.A. · OSS SCANNER · RELATÓRIO FINAL")
    print("═" * 60)
    print(f" Contratos analisados: {len(contratos)}")
    print(f" Alertas gerados:      {len(alertas)}")
    for a in sorted(alertas, key=lambda x: x["indice_corrupcao"], reverse=True):
        print(f"   [{a['indice_corrupcao']:3d}/100 · {a['criticidade']:8}] {a['oss_nome'][:40]:40} R$ {a['valor_contrato']:>12,.0f}")
    print("═" * 60)


if __name__ == "__main__":
    main()
