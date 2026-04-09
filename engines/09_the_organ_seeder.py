"""
A.S.M.O.D.E.U.S. — The Organ Seeder  (09_the_organ_seeder.py)

Popula o Firestore do zero: ideal para novos ambientes (staging, produção
inicial) ou para resetar os dados de desenvolvimento.

O que este script faz:
  1. Injeta 10 deputados federais simulados em `deputados_federais`
  2. Cria `config/sistema` com apiPausada: false e metadados do sistema
  3. Semente o admin principal:
       • Encontra o usuário por e-mail no Firebase Auth
       • Define Custom Claim `admin: true` (necessário para as Security Rules)
       • Cria/atualiza documento `usuarios/{uid}` com isAdmin: true e 9999 créditos

Variáveis de ambiente:
  GOOGLE_APPLICATION_CREDENTIALS ou FIRESTORE_SA_KEY → conta de serviço GCP

Uso:
  python engines/09_the_organ_seeder.py
  python engines/09_the_organ_seeder.py --admin-email admin@codex.com
  python engines/09_the_organ_seeder.py --skip-deputies          # só config + admin
  python engines/09_the_organ_seeder.py --skip-config
  python engines/09_the_organ_seeder.py --dry-run                # imprime sem gravar
  python engines/09_the_organ_seeder.py --wipe                   # APAGA antes de semear
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("organ_seeder")

# ─── Deputados simulados ──────────────────────────────────────────────────────
# Estrutura compatível com GlobalSearch, RankingPage e DossiePage
DEPUTADOS_SEED: list[dict] = [
    {
        "id":            "dep_001",
        "nome":          "Carlos Alberto Mendes",
        "nomeCompleto":  "Carlos Alberto Mendes Silva",
        "partido":       "CODEX",
        "uf":            "SP",
        "foto":          None,
        "urlFoto":       None,
        "score":         87.4,
        "indice_transparenciabr": 87.4,
        "gastosCeapTotal":  148320.00,
        "totalEmendas":     5200000.00,
        "presenca":         92,
        "totalProjetos":    14,
        "cargo":            "Deputado Federal",
        "email":            "dep.carlosmendes@camara.leg.br",
    },
    {
        "id":            "dep_002",
        "nome":          "Fernanda Rocha Lima",
        "nomeCompleto":  "Fernanda Rocha Lima",
        "partido":       "DEMOS",
        "uf":            "RJ",
        "foto":          None,
        "urlFoto":       None,
        "score":         72.1,
        "indice_transparenciabr": 72.1,
        "gastosCeapTotal":  89540.00,
        "totalEmendas":     3100000.00,
        "presenca":         87,
        "totalProjetos":    9,
        "cargo":            "Deputada Federal",
        "email":            "dep.fernandalima@camara.leg.br",
    },
    {
        "id":            "dep_003",
        "nome":          "Roberto Cavalcante",
        "nomeCompleto":  "Roberto Cavalcante Neto",
        "partido":       "FORÇA",
        "uf":            "BA",
        "foto":          None,
        "urlFoto":       None,
        "score":         45.3,
        "indice_transparenciabr": 45.3,
        "gastosCeapTotal":  212400.00,
        "totalEmendas":     8750000.00,
        "presenca":         61,
        "totalProjetos":    3,
        "cargo":            "Deputado Federal",
        "email":            "dep.robertocavalcante@camara.leg.br",
    },
    {
        "id":            "dep_004",
        "nome":          "Ana Paula Ferreira",
        "nomeCompleto":  "Ana Paula Ferreira Santos",
        "partido":       "VERDADE",
        "uf":            "MG",
        "foto":          None,
        "urlFoto":       None,
        "score":         93.8,
        "indice_transparenciabr": 93.8,
        "gastosCeapTotal":  62100.00,
        "totalEmendas":     1950000.00,
        "presenca":         97,
        "totalProjetos":    22,
        "cargo":            "Deputada Federal",
        "email":            "dep.anapaulaferreira@camara.leg.br",
    },
    {
        "id":            "dep_005",
        "nome":          "Marcus Vinicius Prado",
        "nomeCompleto":  "Marcus Vinicius Prado de Oliveira",
        "partido":       "PLENO",
        "uf":            "RS",
        "foto":          None,
        "urlFoto":       None,
        "score":         31.7,
        "indice_transparenciabr": 31.7,
        "gastosCeapTotal":  287600.00,
        "totalEmendas":     12400000.00,
        "presenca":         44,
        "totalProjetos":    1,
        "cargo":            "Deputado Federal",
        "email":            "dep.marcusvinicius@camara.leg.br",
    },
    {
        "id":            "dep_006",
        "nome":          "Juliana Moraes Costa",
        "nomeCompleto":  "Juliana Moraes Costa",
        "partido":       "DEMOS",
        "uf":            "PE",
        "foto":          None,
        "urlFoto":       None,
        "score":         68.9,
        "indice_transparenciabr": 68.9,
        "gastosCeapTotal":  103200.00,
        "totalEmendas":     4100000.00,
        "presenca":         83,
        "totalProjetos":    11,
        "cargo":            "Deputada Federal",
        "email":            "dep.julianamoraes@camara.leg.br",
    },
    {
        "id":            "dep_007",
        "nome":          "Paulo Sérgio Teixeira",
        "nomeCompleto":  "Paulo Sérgio Teixeira Filho",
        "partido":       "CODEX",
        "uf":            "GO",
        "foto":          None,
        "urlFoto":       None,
        "score":         18.2,
        "indice_transparenciabr": 18.2,
        "gastosCeapTotal":  341800.00,
        "totalEmendas":     19700000.00,
        "presenca":         38,
        "totalProjetos":    0,
        "cargo":            "Deputado Federal",
        "email":            "dep.pauloteixeira@camara.leg.br",
    },
    {
        "id":            "dep_008",
        "nome":          "Beatriz Nascimento",
        "nomeCompleto":  "Beatriz Nascimento de Almeida",
        "partido":       "FORÇA",
        "uf":            "AM",
        "foto":          None,
        "urlFoto":       None,
        "score":         79.5,
        "indice_transparenciabr": 79.5,
        "gastosCeapTotal":  77800.00,
        "totalEmendas":     2750000.00,
        "presenca":         89,
        "totalProjetos":    17,
        "cargo":            "Deputada Federal",
        "email":            "dep.beatriznascimento@camara.leg.br",
    },
    {
        "id":            "dep_009",
        "nome":          "Tomás Rodrigues Braga",
        "nomeCompleto":  "Tomás Rodrigues Braga",
        "partido":       "PLENO",
        "uf":            "PA",
        "foto":          None,
        "urlFoto":       None,
        "score":         55.0,
        "indice_transparenciabr": 55.0,
        "gastosCeapTotal":  132500.00,
        "totalEmendas":     6300000.00,
        "presenca":         74,
        "totalProjetos":    6,
        "cargo":            "Deputado Federal",
        "email":            "dep.tomasbraga@camara.leg.br",
    },
    {
        "id":            "dep_010",
        "nome":          "Luciana Fonseca Alves",
        "nomeCompleto":  "Luciana Fonseca Alves",
        "partido":       "VERDADE",
        "uf":            "CE",
        "foto":          None,
        "urlFoto":       None,
        "score":         88.7,
        "indice_transparenciabr": 88.7,
        "gastosCeapTotal":  58900.00,
        "totalEmendas":     1600000.00,
        "presenca":         95,
        "totalProjetos":    19,
        "cargo":            "Deputada Federal",
        "email":            "dep.lucianafonseca@camara.leg.br",
    },
]

# ─── Config/sistema inicial ───────────────────────────────────────────────────
CONFIG_SISTEMA: dict = {
    "apiPausada":        False,
    "versaoEngine":      "2.0.0",
    "nomeProjeto":       "A.S.M.O.D.E.U.S.",
    "ambiente":          "producao",
    "ultimoSeed":        None,   # atualizado em runtime
    "totalDeputados":    len(DEPUTADOS_SEED),
    "motoresAtivos":     ["03_ingest", "04_views", "05_sync", "07_gemini", "08_webcall"],
    "criadoPor":         "09_the_organ_seeder",
    "alertas_total":     0,
    "creditos_gastos_sistema": 0,
}


# ─── Inicializar Firebase Admin SDK ──────────────────────────────────────────
def _init_firebase(project_id: str) -> tuple[Any, Any]:
    """Retorna (firestore_client, firebase_auth_client)."""
    sa_key = os.environ.get("FIRESTORE_SA_KEY")
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_cred, firestore, auth

        if not firebase_admin._apps:
            if sa_key and os.path.isfile(sa_key):
                cred = fb_cred.Certificate(sa_key)
            else:
                cred = fb_cred.ApplicationDefault()
            firebase_admin.initialize_app(cred, {"projectId": project_id})

        return firestore.client(), auth
    except ImportError:
        sys.exit("firebase-admin não instalado. Execute: pip install firebase-admin")


# ─── Seed: deputados federais ─────────────────────────────────────────────────
def seed_deputies(db: Any, wipe: bool, dry_run: bool) -> int:
    col = db.collection("deputados_federais")

    if wipe and not dry_run:
        log.warning("  🗑  WIPE: apagando deputados_federais existentes…")
        for d in col.stream():
            d.reference.delete()

    count = 0
    for dep in DEPUTADOS_SEED:
        doc_id = dep.pop("id")
        dep["criadoPorSeeder"] = True
        dep["seededAt"]        = datetime.now(timezone.utc).isoformat()
        log.info("  → Deputado: %s (%s/%s) · score %.1f",
                 dep["nome"], dep["partido"], dep["uf"], dep["score"])
        if not dry_run:
            col.document(doc_id).set(dep, merge=True)
        dep["id"] = doc_id  # restaura para consistência
        count += 1

    log.info("  ✓ %d deputados semeados.", count)
    return count


# ─── Seed: config/sistema ─────────────────────────────────────────────────────
def seed_config(db: Any, dry_run: bool) -> None:
    cfg = {**CONFIG_SISTEMA, "ultimoSeed": datetime.now(timezone.utc).isoformat()}
    log.info("  → config/sistema: apiPausada=%s · versao=%s",
             cfg["apiPausada"], cfg["versaoEngine"])
    if not dry_run:
        db.collection("config").document("sistema").set(cfg, merge=True)
    log.info("  ✓ config/sistema atualizado.")


# ─── Seed: admin principal ────────────────────────────────────────────────────
def seed_admin(db: Any, fb_auth: Any, admin_email: str, dry_run: bool) -> None:
    log.info("  → Buscando usuário admin: %s", admin_email)

    # 1. Buscar usuário pelo e-mail no Firebase Auth
    try:
        user_record = fb_auth.get_user_by_email(admin_email)
        uid = user_record.uid
        log.info("    Usuário encontrado: uid=%s", uid)
    except fb_auth.UserNotFoundError:
        if dry_run:
            log.warning("    [DRY-RUN] Usuário não encontrado — criaria com e-mail=%s", admin_email)
            return
        # Criar usuário se não existe
        log.info("    Usuário não encontrado. Criando…")
        try:
            user_record = fb_auth.create_user(email=admin_email, password="AlterEstePasswordImediatamente!")
            uid = user_record.uid
            log.info("    ✓ Usuário criado: uid=%s · Altere a senha imediatamente!", uid)
        except Exception as e:
            log.error("    ✗ Erro ao criar usuário: %s", e)
            return

    # 2. Definir Custom Claim `admin: true` (usado pelas Security Rules)
    log.info("    Definindo Custom Claim admin=True para uid=%s…", uid)
    if not dry_run:
        fb_auth.set_custom_user_claims(uid, {"admin": True})
        log.info("    ✓ Custom Claim definida. O token é válido após próximo login do usuário.")

    # 3. Criar/atualizar documento Firestore do admin
    admin_doc = {
        "uid":         uid,
        "email":       admin_email,
        "isAdmin":     True,
        "role":        "admin",
        "creditos":    9999,
        "criadoEm":    datetime.now(timezone.utc).isoformat(),
        "atualizadoEm": datetime.now(timezone.utc).isoformat(),
        "seededBy":    "09_the_organ_seeder",
    }
    log.info("    Atualizando Firestore usuarios/%s…", uid)
    if not dry_run:
        db.collection("usuarios").document(uid).set(admin_doc, merge=True)
    log.info("  ✓ Admin semeado: uid=%s · creditos=9999 · isAdmin=True · CustomClaim=admin:true", uid)


# ─── Wipe de coleção genérico ─────────────────────────────────────────────────
def wipe_collection(db: Any, col_name: str) -> int:
    col  = db.collection(col_name)
    docs = list(col.stream())
    for d in docs:
        d.reference.delete()
    log.warning("  🗑  Wipe: %d docs deletados de '%s'", len(docs), col_name)
    return len(docs)


# ─── Relatório final ──────────────────────────────────────────────────────────
def print_summary(args: argparse.Namespace, deputies_seeded: int) -> None:
    sep = "═" * 60
    print(f"\n{sep}")
    print(" A.S.M.O.D.E.U.S. — The Organ Seeder · Relatório Final")
    print(sep)
    print(f"  Projeto:         {args.project}")
    print(f"  Admin e-mail:    {args.admin_email}")
    print(f"  Deputados:       {deputies_seeded} semeados")
    print(f"  Config/sistema:  {'Atualizado' if not args.skip_config else 'Pulado'}")
    print(f"  Modo:            {'DRY-RUN (nada foi gravado)' if args.dry_run else 'PRODUÇÃO'}")
    print(sep)
    print()
    if not args.dry_run:
        print("  ⚠️  AÇÕES OBRIGATÓRIAS APÓS O SEED:")
        print(f"  1. Faça login com {args.admin_email} e altere a senha")
        print("  2. O Custom Claim só é aplicado após o próximo login/refresh do token")
        print("  3. Execute firebase deploy --only firestore:rules para aplicar as regras")
    print()


# ─── Ponto de entrada ─────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Semeia dados iniciais no Firestore do A.S.M.O.D.E.U.S.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--project",      default="fiscallizapa",
                        help="Projeto Firebase (padrão: fiscallizapa)")
    parser.add_argument("--admin-email",  default="admin@codex.com",
                        help="E-mail do administrador principal")
    parser.add_argument("--skip-deputies", action="store_true",
                        help="Não semeia deputados federais")
    parser.add_argument("--skip-config",   action="store_true",
                        help="Não atualiza config/sistema")
    parser.add_argument("--skip-admin",    action="store_true",
                        help="Não cria/atualiza o usuário admin")
    parser.add_argument("--wipe",          action="store_true",
                        help="⚠️ APAGA os dados existentes antes de semear")
    parser.add_argument("--dry-run",       action="store_true",
                        help="Simula sem gravar nada no Firestore/Auth")
    args = parser.parse_args()

    if args.dry_run:
        log.info("══ MODO DRY-RUN ativado — nenhum dado será gravado ══")
    if args.wipe and not args.dry_run:
        log.warning("══ MODO WIPE ativado — dados existentes serão apagados! ══")

    db, fb_auth = _init_firebase(args.project)
    deputies_seeded = 0

    # 1. Semear deputados
    if not args.skip_deputies:
        log.info("─ Semeando deputados federais ─")
        deputies_seeded = seed_deputies(db, wipe=args.wipe, dry_run=args.dry_run)

    # 2. Semear config/sistema
    if not args.skip_config:
        log.info("─ Atualizando config/sistema ─")
        seed_config(db, dry_run=args.dry_run)

    # 3. Semear admin
    if not args.skip_admin:
        log.info("─ Configurando admin principal ─")
        seed_admin(db, fb_auth, args.admin_email, dry_run=args.dry_run)

    print_summary(args, deputies_seeded)


if __name__ == "__main__":
    main()
