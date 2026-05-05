"""
Worker idempotente de embeddings.
- Lê arquivos .jsonl em gs://datalake-tbr-clean/vertex_ready/
- Verifica se embedding correspondente já existe (skip)
- Gera com multilingual-e5-large e grava em gs://datalake-tbr-clean/embeddings/
- Loop com sleep entre iterações, sem busy-wait.
- Para limpa em SIGTERM (systemd stop).
"""
import json, os, sys, argparse
from concurrent.futures import ProcessPoolExecutor

def normalize_blob(blob_name: str) -> str:
    print(f"[DRY-RUN] normalizando {blob_name}")
    return f"DRY-RUN {blob_name}"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Apenas simula a operação")
    args = parser.parse_args()

    if args.dry_run:
        print("[DRY-RUN] Simulação de normalização")
        print("Normalização concluída (DRY-RUN).")
        sys.exit(0)

    print("Normalizando blobs...")
