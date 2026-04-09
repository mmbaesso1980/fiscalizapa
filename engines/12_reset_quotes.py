"""
A.S.M.O.D.E.U.S. — Reset Diário de Cotas Gratuitas  (12_reset_quotes.py)

Restaura o campo `dossies_gratuitos_restantes` para 2 em todos os documentos
da coleção `usuarios` do Firestore.

Deve ser executado todo dia (adicionado ao asmodeus_cron.yml).

Fluxo:
  1. Carregar todos os documentos de `usuarios` (em lotes de BATCH_SIZE)
  2. Verificar se o campo já está no valor-alvo (pular para economizar writes)
  3. Atualizar via Firestore batch para maximizar eficiência
  4. Reportar total de usuários resetados vs pulados

Variáveis de ambiente:
  GOOGLE_APPLICATION_CREDENTIALS ou FIRESTORE_SA_KEY → acesso ao Firestore

Uso:
  python engines/12_reset_quotes.py
  python engines/12_reset_quotes.py --quota 3         # resetar para 3 (promoção)
  python engines/12_reset_quotes.py --dry-run
  python engines/12_reset_quotes.py --uid XPTO123     # resetar apenas 1 usuário
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
log = logging.getLogger("reset_quotes")

FIRESTORE_PROJECT  = "fiscallizapa"
COLLECTION         = "usuarios"
QUOTA_FIELD        = "dossies_gratuitos_restantes"
DEFAULT_QUOTA      = 2
BATCH_SIZE         = 500   # Firestore batch write limit


def _init_firestore(project_id: str) -> Any:
    sa_key = os.environ.get("FIRESTORE_SA_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_cred, firestore

        if not firebase_admin._apps:
            if sa_key and os.path.isfile(sa_key):
                cred = fb_cred.Certificate(sa_key)
            else:
                cred = fb_cred.ApplicationDefault()
            firebase_admin.initialize_app(cred, {"projectId": project_id})

        return firestore.client()
    except ImportError:
        sys.exit("firebase-admin não instalado. Execute: pip install firebase-admin")


def reset_single_user(db: Any, uid: str, quota: int, dry_run: bool) -> None:
    ref  = db.collection(COLLECTION).document(uid)
    snap = ref.get()
    if not snap.exists:
        log.warning("Usuário %s não encontrado.", uid)
        return
    current = snap.data().get(QUOTA_FIELD, -1)
    if current == quota:
        log.info("  %s → já em %d (pulado)", uid, quota)
        return
    log.info("  %s → %d → %d", uid, current, quota)
    if not dry_run:
        ref.update({
            QUOTA_FIELD:   quota,
            "quotaResetEm": datetime.now(timezone.utc).isoformat(),
        })


def reset_all_users(db: Any, quota: int, dry_run: bool) -> tuple[int, int]:
    """Reseta em lotes usando batch write. Retorna (resetados, pulados)."""
    resetados = 0
    pulados   = 0
    col_ref   = db.collection(COLLECTION)
    cursor    = None

    while True:
        q = col_ref.limit(BATCH_SIZE)
        if cursor:
            q = q.start_after(cursor)

        docs = list(q.stream())
        if not docs:
            break

        batch = db.batch()
        batch_count = 0

        for doc_snap in docs:
            data    = doc_snap.to_dict() or {}
            current = data.get(QUOTA_FIELD, -1)

            # Pular admins (quota ilimitada) e usuários já no valor correto
            if data.get("isAdmin") or data.get("role") == "admin":
                pulados += 1
                continue
            if current == quota:
                pulados += 1
                continue

            batch.update(doc_snap.reference, {
                QUOTA_FIELD:    quota,
                "quotaResetEm": datetime.now(timezone.utc).isoformat(),
            })
            batch_count += 1
            resetados   += 1

        if batch_count > 0 and not dry_run:
            batch.commit()
            log.info("  Lote: %d resets commitados.", batch_count)
        elif batch_count > 0 and dry_run:
            log.info("  [DRY-RUN] Lote: %d resets simulados.", batch_count)

        cursor = docs[-1]
        if len(docs) < BATCH_SIZE:
            break

    return resetados, pulados


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reset diário de cotas gratuitas de dossiês.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--project",  default=FIRESTORE_PROJECT)
    parser.add_argument("--quota",    type=int, default=DEFAULT_QUOTA,
                        help=f"Valor de reset (padrão: {DEFAULT_QUOTA})")
    parser.add_argument("--uid",      default=None,
                        help="UID de um único usuário a resetar")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Simula sem gravar no Firestore")
    args = parser.parse_args()

    if args.dry_run:
        log.info("══ MODO DRY-RUN ativado ══")

    db = _init_firestore(args.project)
    log.info("Resetando %s para %d…", "usuário " + args.uid if args.uid else "todos os usuários", args.quota)

    if args.uid:
        reset_single_user(db, args.uid, args.quota, args.dry_run)
        log.info("Concluído.")
        return

    resetados, pulados = reset_all_users(db, args.quota, args.dry_run)
    log.info("══ Concluído: %d resetados · %d pulados (admin/já em %d) ══",
             resetados, pulados, args.quota)


if __name__ == "__main__":
    main()
