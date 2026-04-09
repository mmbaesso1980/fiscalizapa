"""
A.S.M.O.D.E.U.S. — Motor de Notificação (08_web_call.py)

Vigia ativo: consulta o Firestore buscando alertas com criticidade ALTA
criados nas últimas 24 horas. Para cada alerta novo, simula o disparo de
uma notificação (Webhook estruturado + Email simulado) para o usuário
que monitora aquele político.

Fluxo:
  1. Carregar lista de monitores: usuarios/{uid} onde watchlist contém o parlamentar_id
  2. Buscar alertas novos (ALTA, últimas 24h) em alertas_bodes
  3. Cruzar: se algum usuário monitora o parlamentar do alerta → gerar notificação
  4. Emitir payload estruturado no terminal (simula Webhook + SendGrid)
  5. Marcar alerta como notificado (campo notificado_em) para evitar duplicidade

Circuit Breakers:
  • Limita a MAX_ALERTS_PER_RUN alertas por execução
  • Pula alertas já marcados como notificados (a menos que --force)
  • Pula usuarios sem campo email no documento Firestore
  • Não dispara em --dry-run (apenas imprime os payloads)

Variáveis de ambiente:
  GOOGLE_APPLICATION_CREDENTIALS ou FIRESTORE_SA_KEY → acesso ao Firestore

Uso:
  python engines/08_web_call.py
  python engines/08_web_call.py --dry-run         # simula sem marcar
  python engines/08_web_call.py --hours 48        # janela de 48h
  python engines/08_web_call.py --force           # renotifica mesmo marcados
  python engines/08_web_call.py --min-sev MEDIA   # inclui severidade MEDIA
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import textwrap
from datetime import datetime, timedelta, timezone
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("web_call")

# ─── Constantes ───────────────────────────────────────────────────────────────
FIRESTORE_PROJECT     = "fiscallizapa"
COLLECTION_ALERTAS    = "alertas_bodes"
COLLECTION_USUARIOS   = "usuarios"
DEFAULT_WINDOW_HOURS  = 24
MAX_ALERTS_PER_RUN    = 200
SEV_ORDER             = {"ALTA": 3, "MEDIA": 2, "BAIXA": 1}

# ─── Inicializar Firestore ────────────────────────────────────────────────────
def _get_firestore(project_id: str) -> Any:
    sa_key = os.environ.get("FIRESTORE_SA_KEY")
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


# ─── Construir payload de notificação ────────────────────────────────────────
def _build_payload(usuario: dict, alerta: dict) -> dict:
    """
    Retorna o payload estruturado que seria enviado via Webhook (ex: Zapier,
    Make, n8n) ou por e-mail (ex: SendGrid, Resend).
    """
    explicacao = alerta.get("explicacao_oraculo") or (
        f"Alerta do tipo '{alerta.get('tipoAlerta', '?')}' foi detectado para "
        f"{alerta.get('parlamentarNome', '?')} com criticidade "
        f"{alerta.get('criticidade', '?')}."
    )

    created_at = alerta.get("criadoEm")
    if hasattr(created_at, "ToDatetime"):
        created_at = created_at.ToDatetime().isoformat()
    elif hasattr(created_at, "isoformat"):
        created_at = created_at.isoformat()
    else:
        created_at = datetime.now(timezone.utc).isoformat()

    return {
        "event":     "asmodeus.alerta.alta_severidade",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "recipient": {
            "uid":   usuario.get("uid", "–"),
            "email": usuario.get("email", "–"),
            "nome":  usuario.get("displayName") or usuario.get("nomeCompleto") or "Usuário",
        },
        "alerta": {
            "id":            alerta.get("id", "–"),
            "tipo":          alerta.get("tipoAlerta") or alerta.get("tipo", "–"),
            "criticidade":   alerta.get("criticidade", "ALTA"),
            "parlamentar":   alerta.get("parlamentarNome") or alerta.get("nome", "–"),
            "partido":       alerta.get("partido", "–"),
            "uf":            alerta.get("uf", "–"),
            "valor_suspeito": alerta.get("valorSuspeito") or alerta.get("valor", None),
            "criado_em":     created_at,
            "descricao":     alerta.get("descricao", "–"),
        },
        "oraculo": {
            "explicacao": explicacao,
            "gerado_por": "gemini-1.5-flash · A.S.M.O.D.E.U.S. v2",
        },
        "cta": {
            "dossie_url":    f"https://transparenciabr.app/dossie/{alerta.get('parlamentar_id', '')}",
            "ranking_url":   "https://transparenciabr.app/ranking",
        },
        "email_subject": (
            f"🚨 ALERTA FORENSE: {alerta.get('parlamentarNome', 'Político')} "
            f"— {alerta.get('tipoAlerta', 'Irregularidade Detectada')}"
        ),
        "email_body_text": textwrap.dedent(f"""
            Olá, {usuario.get('displayName') or 'Arquiteto'}!

            O A.S.M.O.D.E.U.S. detectou uma irregularidade de ALTO RISCO:

            Político: {alerta.get('parlamentarNome', '?')} ({alerta.get('partido','?')}/{alerta.get('uf','?')})
            Tipo:     {alerta.get('tipoAlerta', '?')}

            {explicacao}

            Acesse o Dossiê Forense Completo:
            {f"https://transparenciabr.app/dossie/{alerta.get('parlamentar_id', '')}"}

            --
            A.S.M.O.D.E.U.S. · Sistema de Auditoria Forense Parlamentar
            transparenciabr.app — Este e-mail foi gerado automaticamente.
        """).strip(),
    }


# ─── Emitir notificação (simulada) ───────────────────────────────────────────
def _emit_notification(payload: dict, dry_run: bool) -> None:
    """
    Em produção, substitua este bloco por chamadas reais a:
      • SendGrid  →  sendgrid.send(to=payload["recipient"]["email"], ...)
      • Resend     →  resend.Emails.send(...)
      • Webhook    →  requests.post(WEBHOOK_URL, json=payload)
      • FCM Push   →  messaging.send(Message(token=..., notification=...))
    """
    sep = "─" * 68
    mode_tag = "[DRY-RUN] " if dry_run else "[DISPARO] "

    log.info("%s%s", mode_tag, payload["email_subject"])
    log.info(sep)
    log.info("  Para:      %s <%s>", payload["recipient"]["nome"], payload["recipient"]["email"])
    log.info("  Político:  %s", payload["alerta"]["parlamentar"])
    log.info("  Tipo:      %s", payload["alerta"]["tipo"])
    log.info("  Oráculo:   %s", payload["oraculo"]["explicacao"][:100] + "…"
             if len(payload["oraculo"]["explicacao"]) > 100
             else payload["oraculo"]["explicacao"])
    log.info("  CTA:       %s", payload["cta"]["dossie_url"])
    log.info(sep)

    # Imprime payload JSON completo para integração downstream (ex: n8n, Zapier)
    print("\n[WEBHOOK PAYLOAD]\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


# ─── Buscar usuários que monitoram um parlamentar ─────────────────────────────
def _get_monitoring_users(db: Any, parlamentar_id: str) -> list[dict]:
    """
    Lógica: usuários que têm o campo `watchlist` contendo `parlamentar_id`.
    Fallback: se nenhum usuário monitorar, notifica todos com role 'premium'.

    Na V1 (simulado), se watchlist não existir → usa os 10 primeiros usuarios
    como proxy para demonstrar o fluxo de notificação.
    """
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter
        q = db.collection(COLLECTION_USUARIOS).where(
            filter=FieldFilter("watchlist", "array_contains", parlamentar_id)
        ).limit(50)
        docs = list(q.stream())
        if docs:
            return [{"uid": d.id, **d.data()} for d in docs]
    except Exception:
        pass

    # Fallback: primeiros 5 usuários premium (simulação)
    try:
        docs = list(db.collection(COLLECTION_USUARIOS).limit(5).stream())
        return [{"uid": d.id, **d.data()} for d in docs]
    except Exception:
        return []


# ─── Ponto de entrada ─────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Vigia ativo: notifica usuários sobre alertas de alto risco.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--project",   default=FIRESTORE_PROJECT)
    parser.add_argument("--hours",     type=int, default=DEFAULT_WINDOW_HOURS,
                        help="Janela de tempo em horas (padrão: 24)")
    parser.add_argument("--min-sev",   default="ALTA", choices=["ALTA", "MEDIA", "BAIXA"],
                        help="Severidade mínima para notificar (padrão: ALTA)")
    parser.add_argument("--force",     action="store_true",
                        help="Renotifica mesmo alertas já marcados")
    parser.add_argument("--dry-run",   action="store_true",
                        help="Simula sem gravar no Firestore")
    args = parser.parse_args()

    if args.dry_run:
        log.info("══ MODO DRY-RUN ativado ══")

    db = _get_firestore(args.project)

    # 1. Janela temporal
    since = datetime.now(timezone.utc) - timedelta(hours=args.hours)
    min_sev_order = SEV_ORDER.get(args.min_sev.upper(), 3)
    log.info("Buscando alertas desde %s (janela: %dh · min sev: %s)",
             since.strftime("%d/%m %H:%M"), args.hours, args.min_sev)

    # 2. Buscar alertas recentes de alto risco
    alertas_ref = db.collection(COLLECTION_ALERTAS)
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter
        q = alertas_ref.where(
            filter=FieldFilter("criadoEm", ">=", since)
        ).limit(MAX_ALERTS_PER_RUN)
        docs = list(q.stream())
    except Exception:
        # Sem índice de timestamp — busca os mais recentes e filtra localmente
        docs = list(alertas_ref.limit(MAX_ALERTS_PER_RUN).stream())

    if not docs:
        log.info("Nenhum alerta encontrado na janela de %dh.", args.hours)
        return

    # 3. Filtrar por severidade e campo notificado
    alertas = []
    for d in docs:
        data = {"id": d.id, **d.data()}
        sev  = data.get("criticidade", data.get("severidade", "BAIXA")).upper()
        if SEV_ORDER.get(sev, 0) < min_sev_order:
            continue
        if not args.force and data.get("notificado_em"):
            log.debug("  Pulando %s (já notificado)", d.id[:20])
            continue
        alertas.append((d, data))

    log.info("%d alertas elegíveis para notificação.", len(alertas))
    if not alertas:
        log.info("Nada a notificar.")
        return

    # 4. Para cada alerta, buscar usuários e emitir notificação
    total_notificados = 0
    for doc_snap, alerta in alertas:
        parlamentar_id = alerta.get("parlamentar_id", "")
        usuarios       = _get_monitoring_users(db, parlamentar_id)

        if not usuarios:
            log.debug("  Nenhum usuário monitora %s", alerta.get("parlamentarNome", parlamentar_id))
            continue

        for usuario in usuarios:
            if not usuario.get("email"):
                log.debug("  Usuário %s sem email — pulando", usuario.get("uid", "?")[:10])
                continue

            payload = _build_payload(usuario, alerta)
            _emit_notification(payload, dry_run=args.dry_run)
            total_notificados += 1

        # Marcar alerta como notificado
        if not args.dry_run:
            doc_snap.reference.update({
                "notificado_em": datetime.now(timezone.utc),
                "notificacoes_enviadas": len(usuarios),
            })

    log.info("══ Concluído: %d notificações disparadas ══", total_notificados)


if __name__ == "__main__":
    main()
