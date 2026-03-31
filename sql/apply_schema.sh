#!/bin/bash
# apply_schema.sh - Aplica o schema no Cloud SQL
# Uso: bash sql/apply_schema.sh

set -e

PROJECT_ID="fiscallizapa"
INSTANCE="transparenciabr-db"
DB="transparenciabr"
USER="postgres"

echo "=== Aplicando schema no Cloud SQL ==="
echo "Projeto: $PROJECT_ID"
echo "Instancia: $INSTANCE"
echo "Banco: $DB"

# Opcao 1: Via Cloud SQL Proxy (local)
# cloud-sql-proxy $PROJECT_ID:southamerica-east1:$INSTANCE &
# sleep 3
# PGPASSWORD=$DB_PASSWORD psql -h 127.0.0.1 -U $USER -d $DB -f sql/schema.sql

# Opcao 2: Via gcloud (Cloud Shell)
echo "Conectando via gcloud sql connect..."
echo "IMPORTANTE: Quando solicitado, digite a senha do usuario postgres"
echo ""
gcloud sql connect $INSTANCE --user=$USER --database=$DB --project=$PROJECT_ID < sql/schema.sql

echo ""
echo "=== Schema aplicado com sucesso! ==="
echo "Verificando tabelas criadas..."
gcloud sql connect $INSTANCE --user=$USER --database=$DB --project=$PROJECT_ID <<EOF
\dt
EOF
