#!/bin/bash
# ============================================================
# FiscalizaPA - Deploy Script for Google Cloud Shell
# ============================================================
# Usage: chmod +x deploy_all.sh && ./deploy_all.sh

set -e

PROJECT_ID="fiscallizapa"
REGION="southamerica-east1"

echo "================================================"
echo "FiscalizaPA - Iniciando deploy completo..."
echo "Projeto: $PROJECT_ID"
echo "Região: $REGION"
echo "================================================"

# 1. Verificar se está no diretório correto
if [ ! -f "package.json" ] && [ ! -d "functions" ]; then
  echo "ERRO: Execute este script da raiz do projeto fiscalizapa"
  exit 1
fi

# 2. Configurar projeto Firebase
echo ""
echo ">>> Configurando projeto Firebase..."
firebase use $PROJECT_ID 2>/dev/null || firebase use --add

# 3. Deploy das Cloud Functions
echo ""
echo ">>> Deploy das Cloud Functions..."
cd functions
npm install --production
cd ..
firebase deploy --only functions --project $PROJECT_ID

echo ""
echo ">>> Cloud Functions deployadas com sucesso!"

# 4. Build do frontend React
echo ""
echo ">>> Build do frontend React..."
cd frontend
npm install
npm run build
cd ..

# 5. Deploy do frontend no Firebase Hosting
echo ""
echo ">>> Deploy do Hosting..."
firebase deploy --only hosting --project $PROJECT_ID

echo ""
echo "================================================"
echo "Deploy concluído com sucesso!"
echo "URL: https://fiscallizapa.web.app"
echo "================================================"
