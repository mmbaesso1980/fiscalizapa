#!/bin/bash
# Roda crawlers UMA VEZ. Timer dispara a cada 4h.

if [ "$CRAWLER_DRY_RUN" = "1" ]; then
  echo "[DRY-RUN] Iniciando simulacao de crawl run"
  echo "[DRY-RUN] Crawl run concluído"
else
  echo "[$(date)] Iniciando crawl run (safe/default)"
  # placeholder for safe script
  echo "[$(date)] Crawl run concluído"
fi
