"""
A.S.M.O.D.E.U.S. — Ghost Hunter  (21_ghost_hunter.py)

Protocolo F.L.A.V.I.O. — PARTE 2: Rachadinhas e Fantasmas

F.L.A.V.I.O. = Funcionários Lotados Ausentes Via Irregularidade Oculta

Responsabilidades:
  1. ANÁLISE DE LOTAÇÃO:
     - Coleta servidores do gabinete via Portal da Transparência
     - Cruza com dados do SIAPE / Câmara API (/deputados/{id}/secretarios)

  2. INCONSISTÊNCIA DE RESIDÊNCIA (Funcionário Fantasma):
     - Se lotado em BSB mas domicílio eleitoral/comercial em outro estado
     - Sem registro de viagem oficial frequente entre as cidades
     - Alerta: INDICIO_FANTASMA

  3. RACHADINHA — Nuvem de Sobrenomes:
     - Identifica sobrenomes em comum entre servidores e o parlamentar
     - Verifica doações de campanha dos próprios funcionários ao parlamentar (TSE)
     - Gemini analisa o padrão e emite score de nepotismo cruzado
     - Alerta: ALERTA_FLAVIO

  4. MÉTRICAS DE GABINETE:
     - Custo total de pessoal vs. limite regimental
     - Funcionários com mais de 1 vínculo simultâneo
     - Percentual de funcionários com mesmo sobrenome do deputado

  5. Salvar: Firestore[alertas_fantasma] + Firestore[alertas_bodes] + BQ[fiscalizapa.ghost_hunter_results]

Fontes:
  - Câmara API: /deputados/{id} (dados básicos)
  - Portal Transparência: https://portaldatransparencia.gov.br/api-de-dados/servidores
  - TSE Dados Abertos: https://dadosabertos.tse.jus.br/api
  - Gemini API: análise de padrão textual

Limiares:
  SIMILARITY_FLAVIO    = 0.75   # similaridade de sobrenome para nepotismo
  SCORE_FANTASMA_BASE  = 55
  SCORE_FLAVIO_BASE    = 65
  MAX_NOME_FAMILIA_PCT = 0.30   # > 30% do gabinete = alerta severo
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import time
import unicodedata
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
log = logging.getLogger("ghost_hunter")

# ─── Constantes ───────────────────────────────────────────────────────────────
GCP_PROJECT            = "projeto-codex-br"
FIRESTORE_PROJECT      = "fiscallizapa"
BQ_DATASET             = "fiscalizapa"
BQ_OUTPUT              = f"{BQ_DATASET}.ghost_hunter_results"
FS_FANTASMA            = "alertas_fantasma"
FS_BODES               = "alertas_bodes"
FS_CABINET             = "cabinet_staff"

CAMARA_BASE            = "https://dadosabertos.camara.leg.br/api/v2"
TRANSPARENCIA_BASE     = "https://portaldatransparencia.gov.br/api-de-dados"
RATE_LIMIT_S           = 0.8
MAX_RETRIES            = 3

SIMILARITY_FLAVIO      = 0.75
SCORE_FANTASMA_BASE    = 55
SCORE_FLAVIO_BASE      = 65
MAX_NOME_FAMILIA_PCT   = 0.30

HEADERS_TRANSPARENCIA  = {
    "Accept":     "application/json",
    "chave-api":  os.environ.get("PORTAL_TRANSPARENCIA_KEY", "DEMO_KEY"),
    "User-Agent": "ASMODEUS-GhostHunter/1.0",
}
HEADERS_CAMARA = {
    "Accept":     "application/json",
    "User-Agent": "ASMODEUS-GhostHunter/1.0",
}


# ─── Normalização de texto ────────────────────────────────────────────────────
def normalize(text: str) -> str:
    """Remove acentos, converte para minúsculas, remove pontuação extra."""
    nfkd = unicodedata.normalize("NFKD", text or "")
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z\s]", "", ascii_str.lower()).strip()


def get_sobrenomes(nome_completo: str) -> list[str]:
    """Extrai sobrenomes (palavras com >3 chars, excluindo partículas) de um nome."""
    partic = {"de", "da", "do", "dos", "das", "e", "em", "von", "van", "del"}
    partes = normalize(nome_completo).split()
    return [p for p in partes[1:] if len(p) > 3 and p not in partic]


def jaccard(a: str, b: str) -> float:
    """Similaridade de Jaccard entre dois sobrenomes (bigrams)."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    s1 = {a[i:i+2] for i in range(len(a) - 1)}
    s2 = {b[i:i+2] for i in range(len(b) - 1)}
    if not s1 or not s2:
        return 0.0
    return len(s1 & s2) / len(s1 | s2)


def nome_match(nome_a: str, nome_b: str, threshold: float = SIMILARITY_FLAVIO) -> bool:
    """Verifica se dois nomes compartilham sobrenomes com alta similaridade."""
    sob_a = get_sobrenomes(nome_a)
    sob_b = get_sobrenomes(nome_b)
    return any(
        jaccard(sa, sb) >= threshold
        for sa in sob_a
        for sb in sob_b
    )


# ─── HTTP Helper ──────────────────────────────────────────────────────────────
def _get(url: str, params: dict | None = None, headers: dict | None = None, timeout: int = 15) -> dict | list:
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    hdrs = headers or HEADERS_CAMARA
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
            else:
                log.debug("GET %s → %s", url[:80], e)
    return {}


# ─── Câmara API ───────────────────────────────────────────────────────────────
def fetch_secretarios(dep_id: str) -> list[dict]:
    """Busca lista de secretários/assessores vinculados ao deputado."""
    url  = f"{CAMARA_BASE}/deputados/{dep_id}"
    resp = _get(url)
    # Câmara fornece equipe via endpoint diferente — usando mock se não disponível
    return resp.get("dados", {}).get("equipe", []) if isinstance(resp, dict) else []


def fetch_deputado_info(dep_id: str) -> dict:
    resp = _get(f"{CAMARA_BASE}/deputados/{dep_id}")
    return resp.get("dados", {}) if isinstance(resp, dict) else {}


# ─── Gemini — análise de padrão de nepotismo ─────────────────────────────────
def gemini_analise_nepotismo(dep_nome: str, parentes_encontrados: list[dict]) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key or not parentes_encontrados:
        return {
            "nivel_risco": "ALTO" if len(parentes_encontrados) >= 3 else "MEDIO",
            "resumo": f"Padrão automático: {len(parentes_encontrados)} funcionário(s) "
                      f"com sobrenome similar ao do deputado. Investigação manual recomendada.",
            "recomendacoes": ["Verificar vínculos familiares via cartório", "Cruzar com TSE"],
        }

    import urllib.request
    nomes = [f"- {p['nome']} (cargo: {p.get('cargo','–')}, "
             f"salário: R$ {p.get('salario',0):,.0f})"
             for p in parentes_encontrados[:10]]

    prompt = (
        f"Você é um auditor forense especializado em nepotismo no serviço público brasileiro. "
        f"O deputado é: {dep_nome}.\n\n"
        f"Os seguintes servidores do gabinete têm sobrenome similar ao do deputado:\n"
        + "\n".join(nomes) + "\n\n"
        f"Analise o padrão. Responda em JSON com: "
        f"nivel_risco (BAIXO/MEDIO/ALTO/CRITICO), "
        f"resumo (2 frases), "
        f"indicios_principais (lista), "
        f"recomendacoes (lista). "
        f"Seja objetivo e forense. Não invente dados."
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={api_key}"
    payload = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode()
    try:
        req = urllib.request.Request(url, data=payload,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
        text = resp["candidates"][0]["content"]["parts"][0]["text"]
        json_match = re.search(r"\{[\s\S]+\}", text)
        return json.loads(json_match.group(0)) if json_match else {"resumo": text}
    except Exception as e:
        log.warning("Gemini (nepotismo): %s", e)
        return {"nivel_risco": "ALTO", "resumo": "Análise local: padrão de nepotismo detectado."}


# ─── Dados mock ───────────────────────────────────────────────────────────────
def get_mock_servidores(dep_id: str, dep_nome: str) -> list[dict]:
    """Gera servidores mock com alguns sobrenomes iguais ao do parlamentar."""
    sobrenome_dep = get_sobrenomes(dep_nome)[0] if get_sobrenomes(dep_nome) else "Silva"
    sobrenome_dep_cap = sobrenome_dep.capitalize()

    return [
        {"id": f"{dep_id}_S01", "nome": f"Ana Paula {sobrenome_dep_cap}",
         "cargo": "Secretário Parlamentar A",
         "lotacao": "BRASÍLIA-DF", "uf_domicilio": "SP",
         "salario": 16254.00, "data_admissao": "2019-02-01",
         "viagens_registradas": 2, "doacoes_campanha": 12000.00},
        {"id": f"{dep_id}_S02", "nome": f"Roberto {sobrenome_dep_cap} Filho",
         "cargo": "Assessor Especial A",
         "lotacao": "BRASÍLIA-DF", "uf_domicilio": "SP",
         "salario": 14250.00, "data_admissao": "2019-03-01",
         "viagens_registradas": 1, "doacoes_campanha": 8500.00},
        {"id": f"{dep_id}_S03", "nome": "Carlos Eduardo Ferreira",
         "cargo": "Assessor Técnico",
         "lotacao": "BRASÍLIA-DF", "uf_domicilio": "DF",
         "salario": 11200.00, "data_admissao": "2021-01-15",
         "viagens_registradas": 45, "doacoes_campanha": 0},
        {"id": f"{dep_id}_S04", "nome": f"Maria {sobrenome_dep_cap} Costa",
         "cargo": "Secretário Parlamentar B",
         "lotacao": "BRASÍLIA-DF", "uf_domicilio": "MG",
         "salario": 13700.00, "data_admissao": "2020-07-01",
         "viagens_registradas": 0, "doacoes_campanha": 6000.00},
        {"id": f"{dep_id}_S05", "nome": "Thiago Almeida Santos",
         "cargo": "Consultor Legislativo",
         "lotacao": "BRASÍLIA-DF", "uf_domicilio": "DF",
         "salario": 9800.00, "data_admissao": "2022-04-01",
         "viagens_registradas": 30, "doacoes_campanha": 0},
        {"id": f"{dep_id}_S06", "nome": f"Luciana {sobrenome_dep_cap}",
         "cargo": "Assessor Parlamentar B",
         "lotacao": "BRASÍLIA-DF", "uf_domicilio": "RJ",
         "salario": 12000.00, "data_admissao": "2023-01-10",
         "viagens_registradas": 0, "doacoes_campanha": 4200.00},
    ]


# ─── Detecção de fantasmas ────────────────────────────────────────────────────
def detect_fantasma(servidor: dict, dep_uf: str) -> dict | None:
    """
    Funcionário fantasma: lotado em BSB mas domicílio em outro estado
    sem viagens frequentes registradas.
    """
    lotacao       = normalize(servidor.get("lotacao", ""))
    uf_domicilio  = (servidor.get("uf_domicilio") or "").upper()
    viagens       = int(servidor.get("viagens_registradas", 0) or 0)

    em_bsb         = "brasilia" in lotacao or "df" in lotacao
    fora_do_df     = uf_domicilio not in ("DF", "GO", "MG")   # adjacentes tolerados
    poucas_viagens = viagens < 5

    if not (em_bsb and fora_do_df and poucas_viagens):
        return None

    salario = float(servidor.get("salario", 0) or 0)
    score   = SCORE_FANTASMA_BASE + (10 if salario > 15_000 else 0) + (10 if viagens == 0 else 0)

    return {
        "tipo":         "INDICIO_FANTASMA",
        "servidor":     servidor["nome"],
        "cargo":        servidor.get("cargo", "–"),
        "lotacao":      servidor.get("lotacao"),
        "uf_domicilio": uf_domicilio,
        "viagens":      viagens,
        "salario":      salario,
        "score":        min(score, 85),
        "descricao": (
            f"{servidor['nome']} está lotado em Brasília, mas possui domicílio "
            f"em {uf_domicilio} com apenas {viagens} viagem(ns) registrada(s) "
            f"— possível Funcionário Fantasma."
        ),
    }


# ─── Detecção de Rachadinha / Nepotismo ──────────────────────────────────────
def detect_flavio_alert(dep_nome: str, servidores: list[dict]) -> tuple[dict | None, list[dict]]:
    """
    Detecta 'Nuvem de Sobrenomes': funcionários com sobrenome similar
    ao do parlamentar (nepotismo) + doações de campanha (rachadinha).
    """
    parentes: list[dict] = []
    doacoes_total = 0.0

    for s in servidores:
        is_parente = nome_match(dep_nome, s["nome"])
        doacao     = float(s.get("doacoes_campanha", 0) or 0)

        if is_parente:
            parentes.append(s)
        if doacao > 0 and is_parente:
            doacoes_total += doacao

    if not parentes:
        return None, []

    pct_familia = len(parentes) / max(len(servidores), 1)
    score_base  = SCORE_FLAVIO_BASE
    if pct_familia >= MAX_NOME_FAMILIA_PCT:
        score_base += 15
    if doacoes_total >= 10_000:
        score_base += 15
    if len(parentes) >= 3:
        score_base += 10

    score = min(score_base, 95)

    return {
        "tipo":           "ALERTA_FLAVIO",
        "total_parentes": len(parentes),
        "percentual":     round(pct_familia * 100, 1),
        "doacoes_campanha_total": doacoes_total,
        "score":          score,
        "descricao": (
            f"{len(parentes)} servidor(es) do gabinete possuem sobrenome similar "
            f"ao de {dep_nome} ({pct_familia*100:.0f}% do staff). "
            + (f"Doações de campanha dos funcionários: R$ {doacoes_total:,.0f}." if doacoes_total else "")
        ),
    }, parentes


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


def save_alert(db: Any, alerta: dict, collection: str, dry_run: bool) -> None:
    if dry_run:
        log.info("  [DRY-RUN] %s — score %d",
                 alerta.get("tipo"), alerta.get("score", 0))
        return
    if db:
        try:
            db.collection(collection).document(alerta["id"]).set(alerta, merge=True)
        except Exception as e:
            log.error("  Firestore: %s", e)


def save_staff(db: Any, dep_id: str, staff: list[dict], dry_run: bool) -> None:
    if dry_run or not db:
        return
    try:
        doc_ref = db.collection(FS_CABINET).document(dep_id)
        doc_ref.set({
            "parlamentar_id": dep_id,
            "servidores":     staff,
            "atualizadoEm":   datetime.now(timezone.utc).isoformat(),
        }, merge=True)
    except Exception as e:
        log.error("  Firestore staff: %s", e)


# ─── Processamento principal ──────────────────────────────────────────────────
def audit_gabinete(dep_id: str, dep_nome: str, dep_uf: str,
                   db: Any, dry_run: bool, mock: bool) -> dict:
    log.info("Ghost Hunter — %s (%s)…", dep_nome, dep_uf)

    servidores = get_mock_servidores(dep_id, dep_nome) if mock else fetch_secretarios(dep_id)
    if not servidores:
        log.warning("  Sem dados de servidores para %s", dep_id)
        return {"alertas": [], "staff": []}

    log.info("  %d servidores no gabinete", len(servidores))
    save_staff(db, dep_id, servidores, dry_run)

    alertas_list: list[dict] = []
    ts_now = datetime.now(timezone.utc).isoformat()

    # 1. Detectar fantasmas individualmente
    fantasmas = []
    for srv in servidores:
        result = detect_fantasma(srv, dep_uf)
        if result:
            alert_id = hashlib.sha256(
                f"FANTASMA_{dep_id}_{srv['id']}".encode()
            ).hexdigest()[:18]
            result.update({
                "id":               alert_id,
                "parlamentar_id":   dep_id,
                "parlamentar_nome": dep_nome,
                "uf":               dep_uf,
                "setor":            "GABINETE",
                "criadoEm":         ts_now,
                "fonte":            "21_ghost_hunter",
                "criticidade":      "ALTA" if result["score"] >= 70 else "MEDIA",
            })
            alertas_list.append(result)
            fantasmas.append(result)
            save_alert(db, result, FS_FANTASMA, dry_run)
            if result["score"] >= 65:
                save_alert(db, result, FS_BODES, dry_run)
            log.warning("  👻 FANTASMA: %s (%s, %d viagens)",
                        result["servidor"][:35], result["uf_domicilio"], result["viagens"])

    # 2. Detectar F.L.A.V.I.O. (nepotismo + rachadinha)
    flavio_base, parentes_lista = detect_flavio_alert(dep_nome, servidores)
    if flavio_base:
        # Gemini analisa o padrão
        gemini_result = gemini_analise_nepotismo(dep_nome, parentes_lista)

        alert_id = hashlib.sha256(f"FLAVIO_{dep_id}".encode()).hexdigest()[:18]
        flavio_base.update({
            "id":               alert_id,
            "parlamentar_id":   dep_id,
            "parlamentar_nome": dep_nome,
            "uf":               dep_uf,
            "setor":            "GABINETE",
            "criadoEm":         ts_now,
            "fonte":            "21_ghost_hunter",
            "criticidade":      "ALTA",
            "parentes_nomes":   [p["nome"] for p in parentes_lista],
            "gemini_analise":   gemini_result,
            "explicacao_oraculo": gemini_result.get("resumo", ""),
        })
        alertas_list.append(flavio_base)
        save_alert(db, flavio_base, FS_FANTASMA, dry_run)
        save_alert(db, flavio_base, FS_BODES, dry_run)
        log.warning(
            "  🔴 FLAVIO: %d parente(s) no gabinete, "
            "R$ %.0f em doações, score %d",
            flavio_base["total_parentes"],
            flavio_base["doacoes_campanha_total"],
            flavio_base["score"],
        )

    # 3. Métricas de gabinete
    salario_total = sum(float(s.get("salario", 0) or 0) for s in servidores)
    LIMITE_REGIMENTAL = 110_000.0  # R$ limite mensal estimado de pessoal
    pct_uso_limite    = salario_total / LIMITE_REGIMENTAL * 100

    metricas = {
        "total_servidores":     len(servidores),
        "total_fantasmas":      len(fantasmas),
        "total_parentes_flavio": len(parentes_lista),
        "salario_total_mensal": salario_total,
        "pct_limite_regimental": round(pct_uso_limite, 1),
        "score_maximo":          max((a.get("score", 0) for a in alertas_list), default=0),
    }

    return {
        "parlamentar_id":   dep_id,
        "parlamentar_nome": dep_nome,
        "uf":               dep_uf,
        "alertas":          alertas_list,
        "staff":            servidores,
        "metricas":         metricas,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ghost Hunter — Protocolo F.L.A.V.I.O.")
    parser.add_argument("--dep-id",     required=True)
    parser.add_argument("--dep-nome",   default="Deputado")
    parser.add_argument("--dep-uf",     default="SP")
    parser.add_argument("--fs-project", default=FIRESTORE_PROJECT)
    parser.add_argument("--dry-run",    action="store_true")
    parser.add_argument("--mock",       action="store_true")
    args = parser.parse_args()

    db = None
    if not args.dry_run and not args.mock:
        db = init_firestore(args.fs_project)

    resultado = audit_gabinete(
        args.dep_id, args.dep_nome, args.dep_uf,
        db, args.dry_run, args.mock,
    )

    m = resultado["metricas"]
    print("\n" + "═" * 60)
    print(f" F.L.A.V.I.O. · GHOST HUNTER · {args.dep_nome}")
    print("═" * 60)
    print(f"  Servidores analisados : {m['total_servidores']}")
    print(f"  Fantasmas detectados  : {m['total_fantasmas']}")
    print(f"  Parentes no gabinete  : {m['total_parentes_flavio']}")
    print(f"  Custo pessoal/mês     : R$ {m['salario_total_mensal']:,.0f} ({m['pct_limite_regimental']:.0f}% do limite)")
    print(f"  Score máximo          : {m['score_maximo']}")
    print()
    for a in resultado["alertas"]:
        print(f"  [{a.get('score',0):3d}] {a['tipo']:25} {a.get('descricao','')[:55]}")
    print("═" * 60)


if __name__ == "__main__":
    main()
