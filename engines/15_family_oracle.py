"""
A.S.M.O.D.E.U.S. — Oracle de Genealogia e Parentesco  (15_family_oracle.py)

"Sangue e Poder" — Parte 1: Rastreador de Genealogia

Fontes de dados (todas públicas, sem CPF exposto):
  1. API Câmara dos Deputados  → dados básicos do parlamentar
  2. API TSE (Dados Abertos)   → declaração de bens, cônjuge, filiação
  3. API Receita Federal / CNPJs → empresas onde familiares figuram como sócios
  4. Portal da Transparência   → servidores com nomes coincidentes (heurística)

Fluxo:
  parlamentar_id
    ↓
  buscar nome completo + partido + UF (Câmara)
    ↓
  buscar candidato homônimo no TSE (eleições 2018/2022)
    ↓
  extrair: cônjuge · filhos (nomes declarados em bens) · partido de filiação
    ↓
  buscar CNPJs onde cada familiar aparece como sócio (Receita Federal)
    ↓
  salvar rede em Firestore: usuarios_relacionados/{parlamentar_id}
    e BigQuery: fiscalizapa.familia_rede

Caso de uso "Marquinho Boi":
  Político João Silva (SP) → cônjuge: Maria Silva
  → empresa "Silva Segurança Ltda" (CNPJ 12.345.678/0001-90)
    tem Maria Silva como sócia administradora
  → empresa vende serviços ao Estado de SP
  → engine 16_contract_collision.py detecta o match → Alerta Nível 5

LGPD / Nota ética:
  Este motor opera APENAS com dados públicos divulgados voluntariamente
  pelos próprios políticos em candidaturas ao TSE ou em funções públicas.
  Nenhum CPF de terceiros é armazenado. Apenas nomes e CNPJs públicos.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import time
import urllib.request
import urllib.parse
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("family_oracle")

# ─── Configuração ─────────────────────────────────────────────────────────────
CAMARA_BASE        = "https://dadosabertos.camara.leg.br/api/v2"
TSE_BASE           = "https://dadosabertos.tse.jus.br/api"
CNPJ_BASE          = "https://brasilapi.com.br/api/cnpj/v1"
FIRESTORE_PROJECT  = "fiscallizapa"
GCP_PROJECT        = "projeto-codex-br"
BQ_TABLE           = "fiscalizapa.familia_rede"
FS_COLLECTION      = "usuarios_relacionados"

HEADERS = {
    "Accept":     "application/json",
    "User-Agent": "ASMODEUS-FamilyOracle/1.0 (dados-publicos-tse-camara)",
}
RATE_LIMIT_S = 0.8
MAX_RETRIES  = 3

# Tipos de relação familiar
RELACOES = ["conjuge", "filho", "filha", "pai", "mae", "irmao", "irma", "outro"]

# Palavras-chave para extrair familiares de declarações de bens TSE
CONJUGE_PATTERNS  = re.compile(r"c[oô]njuge[:\s]+([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)*)", re.I)
FILHO_PATTERNS    = re.compile(r"filho[sa]?[:\s]+([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)*)", re.I)
PARENTESCO_PATS   = {
    "conjuge": re.compile(r"c[oô]njuge|esposa|esposo|marido|companheira|companheiro", re.I),
    "filho":   re.compile(r"\bfilho\b|\bfilha\b|\bdependente\b", re.I),
    "pai":     re.compile(r"\bpai\b|\bgenitor\b", re.I),
    "mae":     re.compile(r"\bmãe\b|\bmae\b|\bgenitora\b", re.I),
    "irmao":   re.compile(r"\birmão\b|\birmao\b|\birmã\b|\birma\b", re.I),
}


# ─── Estrutura de dados ────────────────────────────────────────────────────────
@dataclass
class FamilyMember:
    nome:        str
    relacao:     str          # conjuge, filho, irmao, etc.
    cpf_hash:    str = ""     # hash SHA256 do CPF se disponível (nunca o CPF em texto)
    cnpjs:       list[str] = field(default_factory=list)
    empresas:    list[dict] = field(default_factory=list)
    fonte:       str = ""     # tse | camara | transparencia | inferido

@dataclass
class FamilyNetwork:
    parlamentar_id:   str
    parlamentar_nome: str
    partido:          str
    uf:               str
    membros:          list[FamilyMember] = field(default_factory=list)
    fontes_usadas:    list[str] = field(default_factory=list)
    atualizado_em:    str = ""
    total_empresas:   int = 0


# ─── HTTP Helper ──────────────────────────────────────────────────────────────
def _get(url: str, params: dict | None = None, timeout: int = 15) -> dict:
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
    return {}


# ─── Câmara API ───────────────────────────────────────────────────────────────
def get_parlamentar_base(dep_id: str) -> dict:
    """Busca dados básicos do deputado (nome, partido, UF, CPF parcial)."""
    resp = _get(f"{CAMARA_BASE}/deputados/{dep_id}")
    dados = resp.get("dados", {})
    status = dados.get("ultimoStatus", {})
    return {
        "id":         str(dep_id),
        "nome":       dados.get("nomeCivil") or status.get("nome", ""),
        "partido":    status.get("siglaPartido", ""),
        "uf":         status.get("siglaUf", ""),
        "cpf":        dados.get("cpf", ""),  # parcialmente mascarado no retorno
        "email":      status.get("email", ""),
        "nomeParlamentar": status.get("nome", ""),
    }


# ─── TSE API ──────────────────────────────────────────────────────────────────
def get_tse_candidato(nome: str, uf: str, ano: int = 2022) -> list[dict]:
    """
    Busca candidato no TSE por nome e UF.
    Endpoint: GET /candidatos/{ano}/{uf}/candidatos?nomeUrna=...
    """
    url  = f"{TSE_BASE}/candidatos/{ano}/{uf}/candidatos"
    resp = _get(url, {"nomeUrna": nome.split()[0], "cargo": "DEPUTADO FEDERAL"})
    candidatos = resp.get("candidatos", resp.get("dados", []))
    return [c for c in candidatos if nome.upper()[:12] in c.get("nomeCompleto", "").upper()]


def parse_bens_for_family(bens_declarados: list[dict]) -> list[FamilyMember]:
    """
    Tenta inferir familiares a partir da declaração de bens do TSE.
    Os bens podem mencionar 'em nome do cônjuge', 'em condomínio com filhos', etc.
    """
    membros = []
    seen    = set()

    for bem in bens_declarados:
        descricao = bem.get("descricao", "") or bem.get("descricaoBem", "")

        # Cônjuge
        for m in CONJUGE_PATTERNS.finditer(descricao):
            nome = m.group(1).strip()
            if nome not in seen and len(nome) > 5:
                seen.add(nome)
                membros.append(FamilyMember(nome=nome, relacao="conjuge", fonte="tse_bens"))

        # Filhos
        for m in FILHO_PATTERNS.finditer(descricao):
            nome = m.group(1).strip()
            if nome not in seen and len(nome) > 5:
                seen.add(nome)
                membros.append(FamilyMember(nome=nome, relacao="filho", fonte="tse_bens"))

    return membros


def get_tse_family(candidato_tse: dict) -> list[FamilyMember]:
    """Extrai familiares do registro TSE (campos diretos + bens declarados)."""
    membros  = []
    seen     = set()

    # Cônjuge no campo direto (disponível em alguns endpoints)
    conjuge = candidato_tse.get("nomeConjuge") or candidato_tse.get("conjuge", "")
    if conjuge and conjuge.strip() and conjuge not in seen:
        seen.add(conjuge)
        membros.append(FamilyMember(nome=conjuge.strip(), relacao="conjuge", fonte="tse_registro"))

    # Dados de filiação (pai/mãe)
    pai = candidato_tse.get("nomePai", "")
    mae = candidato_tse.get("nomeMae", "")
    if pai and pai not in seen and len(pai) > 3 and pai.upper() != "NÃO INFORMADO":
        seen.add(pai)
        membros.append(FamilyMember(nome=pai.strip(), relacao="pai", fonte="tse_registro"))
    if mae and mae not in seen and len(mae) > 3 and mae.upper() != "NÃO INFORMADO":
        seen.add(mae)
        membros.append(FamilyMember(nome=mae.strip(), relacao="mae", fonte="tse_registro"))

    # Bens declarados (análise de texto)
    bens = candidato_tse.get("bensDeclarados", [])
    if bens:
        membros.extend(parse_bens_for_family(bens))

    return membros


# ─── CNPJ / Receita Federal ───────────────────────────────────────────────────
def find_cnpjs_by_partner_name(nome: str) -> list[dict]:
    """
    Busca empresas onde o nome aparece como sócio via BrasilAPI (CNPJ).
    Nota: a BrasilAPI não tem busca full-text por sócio; usamos heurística
    por UF/nome via Receita + SERP público quando disponível.

    Em produção, substituir por:
      - Receita Federal WebServices (requer login PJ)
      - Base dados.gov.br de CNPJs (CSV mensal público)
      - API Jusbrasil / INFOLEG (comercial)
    """
    # Simulação via BrasilAPI — em produção usar CSV Receita Federal
    # O CSV mensal completo de Sócios pode ser baixado em:
    # https://dados.gov.br/dataset/cnpj-dados-abertos-rfb (CSV ~800MB)
    log.debug("  Buscando CNPJs para sócio: %s", nome)
    return []  # placeholder — substituir por consulta à base local


def enrich_member_with_cnpjs(member: FamilyMember, uf: str) -> FamilyMember:
    """
    Enriquece um membro familiar com as empresas onde figura como sócio.
    Usa base pública da Receita Federal (CSV de sócios).
    """
    cnpjs_found = find_cnpjs_by_partner_name(member.nome)
    member.cnpjs = [c["cnpj"] for c in cnpjs_found]

    for cnpj_item in cnpjs_found[:5]:  # max 5 empresas por familiar
        try:
            cnpj_clean = re.sub(r"\D", "", cnpj_item.get("cnpj", ""))
            if len(cnpj_clean) == 14:
                dados = _get(f"{CNPJ_BASE}/{cnpj_clean}")
                time.sleep(RATE_LIMIT_S)
                if dados.get("cnpj"):
                    member.empresas.append({
                        "cnpj":               cnpj_clean,
                        "razaoSocial":        dados.get("razao_social", "–"),
                        "atividade":          dados.get("cnae_fiscal_descricao", "–"),
                        "municipio":          dados.get("municipio", "–"),
                        "uf":                 dados.get("uf", "–"),
                        "situacaoCadastral":  dados.get("descricao_situacao_cadastral", "–"),
                        "dataAbertura":       dados.get("data_inicio_atividade", "–"),
                    })
        except Exception as e:
            log.debug("  CNPJ %s error: %s", cnpj_item, e)

    return member


# ─── Mock de rede familiar (para demonstração / testes sem API TSE) ────────────
def get_mock_family_network(parlamentar: dict) -> FamilyNetwork:
    """
    Rede familiar mock para desenvolvimento e demonstração do sistema.
    Simula o caso 'Marquinho Boi': empresa do irmão vendendo segurança para o estado.
    """
    nome  = parlamentar.get("nome", "Político")
    sobr  = nome.split()[-1] if nome else "Silva"
    uf    = parlamentar.get("uf", "SP")
    pid   = parlamentar.get("id", "000")

    network = FamilyNetwork(
        parlamentar_id   = str(pid),
        parlamentar_nome = nome,
        partido          = parlamentar.get("partido", "–"),
        uf               = uf,
        fontes_usadas    = ["mock_demonstracao"],
        atualizado_em    = datetime.now(timezone.utc).isoformat(),
    )

    # Cônjuge — empresa de consultoria
    conjuge = FamilyMember(
        nome     = f"Maria {sobr}",
        relacao  = "conjuge",
        fonte    = "tse_registro",
        cnpjs    = ["12345678000190"],
        empresas = [{
            "cnpj":              "12.345.678/0001-90",
            "razaoSocial":       f"{sobr} Consultoria & Assessoria Ltda",
            "atividade":         "Consultoria em gestão empresarial",
            "municipio":         "Capital",
            "uf":                uf,
            "situacaoCadastral": "ATIVA",
            "dataAbertura":      "2019-03-15",
        }],
    )

    # Irmão — empresa de segurança (caso "Marquinho Boi")
    irmao = FamilyMember(
        nome     = f"Marcos {sobr}",
        relacao  = "irmao",
        fonte    = "tse_bens",
        cnpjs    = ["98765432000145", "11223344000155"],
        empresas = [
            {
                "cnpj":              "98.765.432/0001-45",
                "razaoSocial":       f"{sobr} Segurança e Vigilância Ltda",
                "atividade":         "Atividades de vigilância e segurança privada",
                "municipio":         "Interior",
                "uf":                uf,
                "situacaoCadastral": "ATIVA",
                "dataAbertura":      "2017-08-22",
            },
            {
                "cnpj":              "11.223.344/0001-55",
                "razaoSocial":       f"Tech {sobr} Sistemas de Segurança",
                "atividade":         "Fabricação de equipamentos de segurança eletrônica",
                "municipio":         "Capital",
                "uf":                uf,
                "situacaoCadastral": "ATIVA",
                "dataAbertura":      "2021-01-10",
            }
        ],
    )

    # Filho — empresa de eventos
    filho = FamilyMember(
        nome     = f"João {sobr} Jr.",
        relacao  = "filho",
        fonte    = "tse_bens",
        cnpjs    = ["55667788000120"],
        empresas = [{
            "cnpj":              "55.667.788/0001-20",
            "razaoSocial":       f"Events {sobr} Produções e Entretenimento",
            "atividade":         "Produção de eventos artísticos, culturais e esportivos",
            "municipio":         "Capital",
            "uf":                uf,
            "situacaoCadastral": "ATIVA",
            "dataAbertura":      "2022-05-30",
        }],
    )

    network.membros       = [conjuge, irmao, filho]
    network.total_empresas = sum(len(m.empresas) for m in network.membros)
    return network


# ─── Persistência ─────────────────────────────────────────────────────────────
def save_to_firestore(db: Any, network: FamilyNetwork) -> None:
    if not db:
        return
    try:
        doc = {
            "parlamentar_id":   network.parlamentar_id,
            "parlamentar_nome": network.parlamentar_nome,
            "partido":          network.partido,
            "uf":               network.uf,
            "total_membros":    len(network.membros),
            "total_empresas":   network.total_empresas,
            "membros":          [asdict(m) for m in network.membros],
            "fontes":           network.fontes_usadas,
            "atualizadoEm":     network.atualizado_em,
        }
        db.collection(FS_COLLECTION).document(network.parlamentar_id).set(doc, merge=True)
        log.info("  ✅ Firestore %s/%s: %d membros · %d empresas",
                 FS_COLLECTION, network.parlamentar_id,
                 len(network.membros), network.total_empresas)
    except Exception as e:
        log.error("  ❌ Firestore error: %s", e)


def save_to_bigquery(bq_client: Any, rows: list[dict]) -> None:
    if not bq_client or not rows:
        return
    try:
        import pandas as pd
        df = pd.DataFrame(rows)
        # Flatten nested structures for BQ
        df["membros_json"] = df["membros"].apply(json.dumps)
        df = df.drop(columns=["membros"], errors="ignore")
        bq_client.insert_rows_json(BQ_TABLE, rows[:500])
        log.info("  ✅ BigQuery %s: %d registros", BQ_TABLE, len(rows))
    except Exception as e:
        log.error("  ❌ BigQuery error: %s", e)


# ─── Orquestrador ─────────────────────────────────────────────────────────────
def process_parlamentar(dep_id: str, dry_run: bool, db: Any, bq_client: Any,
                         use_mock: bool = False) -> FamilyNetwork | None:
    log.info("  Processando parlamentar %s…", dep_id)

    # 1. Dados base (Câmara)
    parl = get_parlamentar_base(dep_id)
    if not parl.get("nome"):
        log.warning("  Parlamentar %s não encontrado.", dep_id)
        return None

    log.info("  Encontrado: %s (%s/%s)", parl["nome"], parl["partido"], parl["uf"])

    if use_mock:
        # Modo demonstração — rede mock detalhada
        network = get_mock_family_network(parl)
        log.info("  [MOCK] Rede familiar criada: %d membros · %d empresas",
                 len(network.membros), network.total_empresas)
    else:
        # 2. TSE — buscar candidato
        network = FamilyNetwork(
            parlamentar_id   = str(dep_id),
            parlamentar_nome = parl["nome"],
            partido          = parl["partido"],
            uf               = parl["uf"],
            atualizado_em    = datetime.now(timezone.utc).isoformat(),
        )

        for ano in [2022, 2018]:
            candidatos = get_tse_candidato(parl["nome"], parl["uf"], ano)
            time.sleep(RATE_LIMIT_S)
            if candidatos:
                c_data  = candidatos[0]
                membros = get_tse_family(c_data)
                for m in membros:
                    m = enrich_member_with_cnpjs(m, parl["uf"])
                    network.membros.append(m)
                network.fontes_usadas.append(f"tse_{ano}")
                break

        network.total_empresas = sum(len(m.cnpjs) for m in network.membros)

    # 3. Persistir
    if not dry_run:
        save_to_firestore(db, network)
    else:
        log.info("  [DRY-RUN] Network: %d membros", len(network.membros))

    return network


def main() -> None:
    parser = argparse.ArgumentParser(description="A.S.M.O.D.E.U.S. — Family Oracle")
    parser.add_argument("--dep-id",   default=None, help="ID do deputado (único)")
    parser.add_argument("--gcp-project", default=GCP_PROJECT)
    parser.add_argument("--fs-project",  default=FIRESTORE_PROJECT)
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--mock",     action="store_true",
                        help="Usar rede familiar mock (demonstração)")
    args = parser.parse_args()

    # Inicializar clientes
    bq_client = db = None
    if not args.dry_run:
        try:
            import firebase_admin
            from firebase_admin import credentials as fb_cred, firestore
            sa_key = os.environ.get("FIRESTORE_SA_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if not firebase_admin._apps:
                cred = fb_cred.Certificate(sa_key) if (sa_key and os.path.isfile(sa_key)) \
                       else fb_cred.ApplicationDefault()
                firebase_admin.initialize_app(cred, {"projectId": args.fs_project})
            db = firestore.client()
        except Exception as e:
            log.warning("Firestore indisponível: %s", e)

    if args.dep_id:
        net = process_parlamentar(args.dep_id, args.dry_run, db, bq_client, args.mock)
        if net:
            log.info("Concluído: %s — %d membros · %d empresas",
                     net.parlamentar_nome, len(net.membros), net.total_empresas)
    else:
        log.error("Forneça --dep-id. Exemplo: python 15_family_oracle.py --dep-id 204521 --mock")
        log.info("Para processar todos os deputados, integre com a lista de IDs do BQ/Firestore.")


if __name__ == "__main__":
    main()
