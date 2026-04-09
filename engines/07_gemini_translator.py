"""
A.S.M.O.D.E.U.S. — Tradutor Forense Gemini  (07_gemini_translator.py)

Lê alertas brutos da coleção `alertas_bodes` do Firestore e usa a IA
do Gemini para gerar uma explicação em linguagem natural para cada alerta,
acessível a qualquer cidadão ou jornalista.

O campo gerado é `explicacao_oraculo` e é escrito de volta no próprio
documento do alerta no Firestore.

Circuit Breakers:
  • Lotes de 10 alertas por ciclo (BATCH_SIZE)
  • sleep de RATE_SLEEP_SEC entre documentos (evita quota burst)
  • Retry automático com backoff exponencial em erros 429 / ServiceUnavailable
  • Pula documentos que já têm `explicacao_oraculo` (a menos que --force)

Variáveis de ambiente:
  GEMINI_API_KEY               → chave da API Google AI Studio / Vertex AI
  GOOGLE_APPLICATION_CREDENTIALS → conta de serviço com acesso ao Firestore

Uso:
  python engines/07_gemini_translator.py
  python engines/07_gemini_translator.py --limit 50
  python engines/07_gemini_translator.py --force         # regenera todos
  python engines/07_gemini_translator.py --dry-run        # imprime sem salvar
  python engines/07_gemini_translator.py --model gemini-1.5-pro
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from typing import Any, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gemini_translator")

# ─── Constantes / Circuit Breaker ─────────────────────────────────────────────
BATCH_SIZE        = 10
RATE_SLEEP_SEC    = 1.5    # pausa entre cada chamada Gemini
BATCH_SLEEP_SEC   = 5.0    # pausa entre lotes
MAX_RETRIES       = 3
RETRY_BASE_SEC    = 4.0    # backoff exponencial: 4, 8, 16s
DEFAULT_MODEL     = "gemini-1.5-flash"
FIRESTORE_PROJECT = "fiscallizapa"
COLLECTION        = "alertas_bodes"
OUTPUT_FIELD      = "explicacao_oraculo"
MAX_OUTPUT_TOKENS = 300

# ─── Prompt do Oráculo ────────────────────────────────────────────────────────
_PROMPT_TEMPLATE = """Você é o A.S.M.O.D.E.U.S. — Sistema Automatizado de Monitoramento e Detecção de Desvios do Erário Usando IA —, a inteligência forense mais avançada do Brasil.

Analise o alerta forense abaixo e gere uma explicação em português do Brasil, clara e direta, como se estivesse explicando para um cidadão comum ou jornalista.

Regras:
- Máximo de 3 frases curtas
- Cite valores monetários com formatação BR (R$ 1.200,00) quando disponíveis
- Mencione a lei ou irregularidade específica quando presente
- Use linguagem simples, sem jargão técnico
- Comece a frase com "Este alerta foi gerado porque" ou "Foi detectado que"

Dados do alerta (JSON):
{alerta_json}

Explicação do Oráculo:"""


# ─── Inicializar Gemini ────────────────────────────────────────────────────────
def _get_gemini_model(model_name: str) -> Any:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit(
            "GEMINI_API_KEY não definida.\n"
            "Execute: export GEMINI_API_KEY='sua-chave'"
        )
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        return genai.GenerativeModel(
            model_name=model_name,
            generation_config={
                "max_output_tokens": MAX_OUTPUT_TOKENS,
                "temperature":       0.3,    # mais determinístico para análise forense
                "top_p":             0.85,
            },
        )
    except ImportError:
        sys.exit(
            "google-generativeai não instalado.\n"
            "Execute: pip install 'google-generativeai>=0.8.0'"
        )


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


# ─── Preparar JSON seguro para o prompt ───────────────────────────────────────
def _alerta_to_prompt_json(alerta: dict) -> str:
    """Remove campos técnicos/internos que confundiriam o Gemini."""
    safe = {
        k: v for k, v in alerta.items()
        if k not in {"id", OUTPUT_FIELD, "sincronizadoEm", "processado_em"}
        and not callable(v)
    }
    # Converte Timestamps para strings
    cleaned = {}
    for k, v in safe.items():
        if hasattr(v, "isoformat"):
            cleaned[k] = v.isoformat()
        elif hasattr(v, "ToDatetime"):
            cleaned[k] = v.ToDatetime().isoformat()
        else:
            cleaned[k] = v
    return json.dumps(cleaned, ensure_ascii=False, indent=2)[:2000]  # max 2KB


# ─── Chamar Gemini com retry exponencial ─────────────────────────────────────
def _translate_alerta(model: Any, alerta: dict, dry_run: bool) -> Optional[str]:
    """
    Chama o Gemini com retry em caso de quota (429) ou erros transientes.
    Retorna o texto gerado ou None em caso de falha permanente.
    """
    prompt = _PROMPT_TEMPLATE.format(alerta_json=_alerta_to_prompt_json(alerta))

    if dry_run:
        return (
            f"[DRY-RUN] Este alerta foi gerado porque {alerta.get('tipoAlerta','?')} "
            f"foi detectado para {alerta.get('parlamentarNome','?')} "
            f"com criticidade {alerta.get('criticidade','?')}."
        )

    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            response = model.generate_content(prompt)
            text     = (response.text or "").strip()
            if not text:
                log.warning("Gemini retornou resposta vazia para alerta %s", alerta.get("id"))
                return None
            return text

        except Exception as exc:
            last_exc = exc
            err_str  = str(exc).lower()
            # Rate limit ou overload → backoff exponencial
            if "429" in err_str or "quota" in err_str or "overloaded" in err_str:
                wait = RETRY_BASE_SEC * (2 ** attempt)
                log.warning("Rate limit (attempt %d/%d) — aguardando %.0fs…",
                            attempt + 1, MAX_RETRIES, wait)
                time.sleep(wait)
            else:
                log.error("Erro Gemini (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, exc)
                break

    log.error("Falha permanente ao traduzir alerta %s: %s", alerta.get("id"), last_exc)
    return None


# ─── Processar lote ────────────────────────────────────────────────────────────
def process_batch(
    db:      Any,
    model:   Any,
    docs:    list,
    *,
    dry_run: bool,
    force:   bool,
) -> tuple[int, int]:
    """Processa um lote de documentos. Retorna (traduzidos, pulados)."""
    traduzidos = 0
    pulados    = 0

    for doc_snap in docs:
        alerta = {"id": doc_snap.id, **doc_snap.to_dict()}

        # Pular se já tem explicação e não está em modo force
        if not force and alerta.get(OUTPUT_FIELD):
            log.debug("  Pulando %s (já tem %s)", doc_snap.id, OUTPUT_FIELD)
            pulados += 1
            continue

        log.info("  Traduzindo: %s — %s", doc_snap.id[:20], alerta.get("tipoAlerta", "?"))
        explicacao = _translate_alerta(model, alerta, dry_run)

        if explicacao:
            if not dry_run:
                doc_snap.reference.update({
                    OUTPUT_FIELD:          explicacao,
                    "explicacao_gerada_em": __import__("datetime").datetime.now(
                        __import__("datetime").timezone.utc
                    ),
                })
            log.info("    ✓ %s…", explicacao[:80])
            traduzidos += 1
        else:
            log.warning("    ✗ Falha ao gerar explicação para %s", doc_snap.id)

        # Pausa entre documentos — respeita quota
        time.sleep(RATE_SLEEP_SEC)

    return traduzidos, pulados


# ─── Ponto de entrada ──────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Traduz alertas do Firestore para linguagem natural usando Gemini.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--project",    default=FIRESTORE_PROJECT,
                        help="Projeto Firestore (padrão: %(default)s)")
    parser.add_argument("--collection", default=COLLECTION,
                        help="Coleção Firestore (padrão: %(default)s)")
    parser.add_argument("--model",      default=DEFAULT_MODEL,
                        help="Modelo Gemini (padrão: %(default)s)")
    parser.add_argument("--limit",  type=int, default=100,
                        help="Máximo de alertas a processar (padrão: 100)")
    parser.add_argument("--force",      action="store_true",
                        help="Regenera explicações mesmo se já existem")
    parser.add_argument("--dry-run",    action="store_true",
                        help="Simula sem chamar Gemini nem salvar no Firestore")
    args = parser.parse_args()

    if args.dry_run:
        log.info("══ MODO DRY-RUN ativado ══")

    # 1. Clientes
    db    = _get_firestore(args.project)
    model = _get_gemini_model(args.model)

    log.info("Modelo: %s · Coleção: %s · Limite: %d",
             args.model, args.collection, args.limit)

    # 2. Buscar documentos
    col_ref = db.collection(args.collection)
    query   = col_ref.limit(args.limit)
    docs    = list(query.stream())
    log.info("Total de documentos encontrados: %d", len(docs))

    if not docs:
        log.info("Nenhum documento para processar.")
        return

    # 3. Processar em lotes de BATCH_SIZE
    batches      = [docs[i : i + BATCH_SIZE] for i in range(0, len(docs), BATCH_SIZE)]
    total_trad   = 0
    total_pulado = 0

    for idx, batch in enumerate(batches, 1):
        log.info("═══ Lote %d/%d (%d docs) ═══", idx, len(batches), len(batch))
        t, p = process_batch(db, model, batch, dry_run=args.dry_run, force=args.force)
        total_trad   += t
        total_pulado += p

        if idx < len(batches):
            log.info("Aguardando %.0fs antes do próximo lote…", BATCH_SLEEP_SEC)
            time.sleep(BATCH_SLEEP_SEC)

    log.info(
        "══ Concluído: %d traduzidos · %d pulados · %d total ══",
        total_trad, total_pulado, len(docs),
    )


if __name__ == "__main__":
    main()
