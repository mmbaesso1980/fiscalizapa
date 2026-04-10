"""
TransparenciaBR — Leitura somente leitura do Firestore (99_check_db.py)

Uso:
  python engines/99_check_db.py

Credenciais (mesmo padrão dos outros engines):
  - FIRESTORE_SA_KEY  → caminho para JSON da conta de serviço com acesso ao Firestore
  - ou GOOGLE_APPLICATION_CREDENTIALS / ADC

Projeto Firestore padrão: fiscallizapa (Firebase do app).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from typing import Any

DEFAULT_PROJECT = "fiscallizapa"
COLLECTION = "deputados_federais"
TARGET_NOME = "Kim Kataguiri"

try:
    import firebase_admin
    from firebase_admin import credentials as fb_credentials
    from firebase_admin import firestore
except ImportError:
    sys.exit("Instale: pip install firebase-admin\n")


def init_firestore(project_id: str):
    sa_key_path = os.environ.get("FIRESTORE_SA_KEY")

    if not firebase_admin._apps:
        if sa_key_path and os.path.isfile(sa_key_path):
            cred = fb_credentials.Certificate(sa_key_path)
            print(f"[auth] Firestore: FIRESTORE_SA_KEY → {sa_key_path}")
        else:
            cred = fb_credentials.ApplicationDefault()
            print("[auth] Firestore: Application Default Credentials (ou GOOGLE_APPLICATION_CREDENTIALS)")

        firebase_admin.initialize_app(cred, {"projectId": project_id})

    return firestore.client()


def serialize_value(v: Any) -> Any:
    """Converte tipos Firestore para algo imprimível em JSON."""
    if v is None:
        return None
    if hasattr(v, "timestamp"):  # DatetimeWithNanoseconds
        try:
            return v.isoformat()
        except Exception:
            return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: serialize_value(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [serialize_value(x) for x in v]
    if isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def main() -> None:
    project = os.environ.get("FIRESTORE_PROJECT_ID", DEFAULT_PROJECT)
    print(f"=== 99_check_db — projeto Firestore: {project} ===\n")

    try:
        db = init_firestore(project)
    except Exception as e:
        print(f"ERRO ao inicializar Firestore: {e}")
        print(
            "\nDica: defina o caminho da chave JSON com permissão no Firestore, por exemplo:\n"
            '  set FIRESTORE_SA_KEY=C:\\caminho\\service-account.json\n'
            "Ou use `gcloud auth application-default login` com uma conta que acesse o projeto.\n"
        )
        sys.exit(1)

    col = db.collection(COLLECTION)

    # Contagem total (stream — coleção ~513 docs)
    print(f"Contando documentos em `{COLLECTION}` …")
    try:
        docs_list = list(col.stream())
        total = len(docs_list)
        print(f"Total de documentos: {total}\n")
    except Exception as e:
        print(f"ERRO ao listar coleção: {e}")
        sys.exit(1)

    # Buscar Kim Kataguiri por campo `nome`
    print(f"Buscando documento com nome == \"{TARGET_NOME}\" …")
    kim_snap = list(col.where("nome", "==", TARGET_NOME).limit(5).stream())

    if not kim_snap:
        # Fallback: varredura leve por substring no nome (sem índice composto)
        print("Nenhum hit exato em `nome`. Tentando correspondência parcial …")
        for d in docs_list:
            data = d.to_dict() or {}
            nome = (data.get("nome") or data.get("nomeCompleto") or "") or ""
            if TARGET_NOME.lower() in nome.lower():
                kim_snap = [d]
                print(f"Encontrado por substring no documento id={d.id!r}")
                break

    if not kim_snap:
        print(f"AVISO: Nenhum documento encontrado para \"{TARGET_NOME}\".")
        print("Primeiros 5 nomes na coleção (amostra):")
        for d in docs_list[:5]:
            dd = d.to_dict() or {}
            print(f"  id={d.id} nome={dd.get('nome')!r}")
        sys.exit(0)

    doc = kim_snap[0]
    raw = doc.to_dict() or {}

    print(f"\n--- Documento id = {doc.id!r} ---\n")

    # Destaque para campos citados pelo time
    highlight = (
        "ceap_total",
        "gastosCeapTotal",
        "totalGasto",
        "score",
        "indice_transparenciabr",
        "historico_despesas",
        "historicoDespesas",
    )
    print("Campos em destaque (se existirem):")
    for key in highlight:
        if key in raw:
            val = raw[key]
            preview = val
            if isinstance(val, (dict, list)) and len(str(val)) > 500:
                preview = f"<{type(val).__name__} com {len(val) if hasattr(val, '__len__') else '?'} itens>"
            else:
                preview = serialize_value(val)
            print(f"  {key}: {preview}")
    print()

    # Dump completo (JSON indentado)
    safe = {k: serialize_value(v) for k, v in raw.items()}
    print("Todos os campos (JSON):")
    print(json.dumps(safe, ensure_ascii=False, indent=2, default=str))

    print("\n=== Fim ===")


if __name__ == "__main__":
    main()
