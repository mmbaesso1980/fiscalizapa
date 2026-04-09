# 🔥 A.S.M.O.D.E.U.S. — MISSÃO COMET

> **Projeto GCP:** `fiscallizapa`
> **Dataset BigQuery:** `fiscalizapa`
> **Repositório:** `mmbaesso1980/fiscalizapa`
> **Regra de ouro:** Execute fase por fase. Documente cada checkpoint. Se travar, pare e reporte exatamente onde.

---

## PRÉ-REQUISITOS (rode no Cloud Shell antes de tudo)

```bash
# Autenticar e configurar projeto
gcloud auth login
gcloud config set project fiscallizapa

# Instalar dependências Python
pip install google-cloud-bigquery google-cloud-pubsub requests python-dotenv

# Verificar tabelas existentes
bq ls fiscallizapa:fiscalizapa

# Ver schema real da tabela de emendas (corrige bug do Ano)
bq show --schema fiscallizapa:fiscalizapa.emendas_2024 2>/dev/null || echo "TABELA NÃO EXISTE"

# Clonar repo e entrar na pasta
cd ~ && git clone https://github.com/mmbaesso1980/fiscalizapa.git || (cd fiscalizapa && git pull)
cd ~/fiscalizapa
```

---

## ⚡ FASE 0 — CIRURGIA NOS BUGS CRÍTICOS

### BUG 1 — CEAPS do Senado retorna 0 despesas

**Diagnóstico:** A API do Senado retorna XML por padrão. O ETL não força `Accept: application/json`.

```bash
# Teste manual — deve retornar JSON com despesas
curl -H "Accept: application/json" \
  "https://legis.senado.leg.br/dadosabertos/senador/204379/despesas?ano=2024" \
  | python3 -m json.tool | head -50
```

**Correção:** Localizar o script ETL do Senado e adicionar o header:
```python
headers = {"Accept": "application/json"}
response = requests.get(url, headers=headers)
```

**Validação:**
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total FROM \`fiscallizapa.fiscalizapa.ceaps_senado\`"
```
✅ **Checkpoint:** total > 0

---

### BUG 2 — Query de emendas quebrada (`Unrecognized name: Ano`)

**Diagnóstico:** O SQL referencia coluna `Ano` mas o nome real pode ser diferente.

```bash
# Descobrir nome real da coluna
bq show --schema fiscallizapa:fiscalizapa.emendas_2024

# OU buscar nos arquivos SQL do repo
grep -r "Ano" ~/fiscalizapa/sql/ --include="*.sql"
grep -r "Ano" ~/fiscalizapa/scripts/ --include="*.js"
```

**Correção:** Substituir `Ano` pelo nome real encontrado em TODOS os arquivos afetados.

```bash
# Exemplo: se o nome real for "ano" (minúsculo)
find ~/fiscalizapa -name "*.sql" -o -name "*.js" | \
  xargs grep -l "\bAno\b" | \
  xargs sed -i 's/\bAno\b/ano/g'
```

**Validação:**
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total FROM \`fiscallizapa.fiscalizapa.emendas_2024\`"
```
✅ **Checkpoint:** query roda sem erro e total > 0

---

## ⚡ FASE 1 — CRIAR TABELAS NO BIGQUERY

```bash
# Executar script de setup de tabelas
cat > ~/fiscalizapa/scripts/setup_bq_tables.sh << 'SCRIPT'
#!/bin/bash
PROJECT="fiscallizapa"
DATASET="fiscalizapa"

echo "🔥 Criando tabelas do A.S.M.O.D.E.U.S..."

# Tabela: diarios_oficiais (Querido Diário)
bq mk --table --project_id=$PROJECT \
  $DATASET.diarios_oficiais \
  id_municipio:STRING,municipio:STRING,estado:STRING,data_publicacao:DATE,url:STRING,excerto:STRING,scraped_at:TIMESTAMP \
  2>/dev/null && echo "✅ diarios_oficiais criada" || echo "⚠️  diarios_oficiais já existe"

# Tabela: contratos_pncp
bq mk --table --project_id=$PROJECT \
  $DATASET.contratos_pncp \
  numero_contrato:STRING,orgao_cnpj:STRING,orgao_nome:STRING,fornecedor_cnpj:STRING,fornecedor_nome:STRING,valor_global:FLOAT64,data_assinatura:DATE,objeto:STRING,scraped_at:TIMESTAMP \
  2>/dev/null && echo "✅ contratos_pncp criada" || echo "⚠️  contratos_pncp já existe"

# Tabela: licitacoes_pncp
bq mk --table --project_id=$PROJECT \
  $DATASET.licitacoes_pncp \
  numero_licitacao:STRING,orgao_cnpj:STRING,orgao_nome:STRING,modalidade:STRING,valor_estimado:FLOAT64,data_publicacao:DATE,objeto:STRING,status:STRING,scraped_at:TIMESTAMP \
  2>/dev/null && echo "✅ licitacoes_pncp criada" || echo "⚠️  licitacoes_pncp já existe"

# Tabela: cnpj_enriquecido (Receita Federal via Brasil.IO)
bq mk --table --project_id=$PROJECT \
  $DATASET.cnpj_enriquecido \
  cnpj:STRING,razao_social:STRING,nome_fantasia:STRING,situacao:STRING,data_abertura:DATE,capital_social:FLOAT64,porte:STRING,cnae_principal:STRING,municipio:STRING,estado:STRING,socios:STRING,qtd_funcionarios:INT64,scraped_at:TIMESTAMP \
  2>/dev/null && echo "✅ cnpj_enriquecido criada" || echo "⚠️  cnpj_enriquecido já existe"

# Tabela: tse_doacoes
bq mk --table --project_id=$PROJECT \
  $DATASET.tse_doacoes \
  cnpj_doador:STRING,nome_doador:STRING,candidato_apoiado:STRING,partido:STRING,cargo:STRING,uf:STRING,valor_doado:FLOAT64,ano_eleicao:INT64,scraped_at:TIMESTAMP \
  2>/dev/null && echo "✅ tse_doacoes criada" || echo "⚠️  tse_doacoes já existe"

# Tabela: ceis_cnep (Empresas sancionadas - CGU)
bq mk --table --project_id=$PROJECT \
  $DATASET.ceis_cnep \
  cnpj:STRING,razao_social:STRING,tipo_sancao:STRING,orgao_sancionador:STRING,data_inicio_sancao:DATE,data_fim_sancao:DATE,fundamentacao_legal:STRING,scraped_at:TIMESTAMP \
  2>/dev/null && echo "✅ ceis_cnep criada" || echo "⚠️  ceis_cnep já existe"

# Tabela: pca_planos_contratacao (PNCP - O futuro)
bq mk --table --project_id=$PROJECT \
  $DATASET.pca_planos_contratacao \
  orgao_cnpj:STRING,orgao_nome:STRING,item_descricao:STRING,valor_estimado:FLOAT64,quantidade:FLOAT64,unidade:STRING,ano_referencia:INT64,scraped_at:TIMESTAMP \
  2>/dev/null && echo "✅ pca_planos_contratacao criada" || echo "⚠️  pca_planos_contratacao já existe"

echo ""
echo "📊 Tabelas no dataset $DATASET:"
bq ls $PROJECT:$DATASET

SCRIPT

chmod +x ~/fiscalizapa/scripts/setup_bq_tables.sh
bash ~/fiscalizapa/scripts/setup_bq_tables.sh
```

✅ **Checkpoint:** 7+ tabelas listadas no dataset `fiscalizapa`

---

## ⚡ FASE 2 — ETL: QUERIDO DIÁRIO (Diários Municipais do Pará)

```bash
cat > ~/fiscalizapa/functions/etl_querido_diario.py << 'PYTHON'
"""
ETL — Querido Diário (Open Knowledge Brasil)
API: https://queridodiario.ok.org.br/api/docs
Ingere excertos de Diários Oficiais municipais no BigQuery.
Municípios prioritários: Pará (Belém, Bragança, Barcarena, Marabá, Santarém)
"""

import requests
import time
from datetime import datetime, timedelta
from google.cloud import bigquery

PROJECT = "fiscallizapa"
DATASET = "fiscalizapa"
TABLE = "diarios_oficiais"
BASE_URL = "https://queridodiario.ok.org.br/api/gazettes"

# Municípios prioritários — Pará
MUNICIPIOS = {
    "1501709": "Bragança",
    "1500602": "Belém",
    "1501758": "Barcarena",
    "1502103": "Castanhal",
    "1503044": "Marabá",
    "1506807": "Santarém",
    "1504208": "Paragominas",
    "1507508": "Tucuruí",
    "1505502": "Marabá",
    "1504422": "Parauapebas",
}

# Palavras-chave para filtrar excertos relevantes
KEYWORDS = [
    "contrato", "licitação", "inexigibilidade", "dispensa",
    "convênio", "emenda", "fornecedor", "CNPJ", "show",
    "evento", "serviço", "obra", "pagamento"
]

def ingerir_municipio(territory_id: str, municipio: str, dias: int = 90):
    client = bigquery.Client(project=PROJECT)
    table_ref = f"{PROJECT}.{DATASET}.{TABLE}"

    data_inicio = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d")
    total_inseridos = 0

    for keyword in KEYWORDS:
        params = {
            "territory_ids": territory_id,
            "querystring": keyword,
            "published_since": data_inicio,
            "size": 100,
            "offset": 0
        }

        while True:
            try:
                response = requests.get(BASE_URL, params=params, timeout=30)
                response.raise_for_status()
                data = response.json()
            except Exception as e:
                print(f"  ⚠️  Erro {municipio}/{keyword}: {e}")
                break

            gazettes = data.get("gazettes", [])
            if not gazettes:
                break

            rows = []
            for g in gazettes:
                for excerto in g.get("excerpts", []):
                    rows.append({
                        "id_municipio": territory_id,
                        "municipio": municipio,
                        "estado": "PA",
                        "data_publicacao": g.get("date"),
                        "url": g.get("url", ""),
                        "excerto": excerto,
                        "scraped_at": datetime.utcnow().isoformat()
                    })

            if rows:
                errors = client.insert_rows_json(table_ref, rows)
                if not errors:
                    total_inseridos += len(rows)
                else:
                    print(f"  ❌ Erro BigQuery: {errors[:2]}")

            # Paginação
            params["offset"] += len(gazettes)
            if len(gazettes) < 100:
                break

            time.sleep(1)  # rate limit

    return total_inseridos

def main():
    print("🔥 A.S.M.O.D.E.U.S. — Ingestão Querido Diário (Pará)")
    print("=" * 55)
    total_geral = 0
    for territory_id, municipio in MUNICIPIOS.items():
        print(f"\n📍 {municipio} ({territory_id})...")
        n = ingerir_municipio(territory_id, municipio)
        print(f"   ✅ {n} excertos inseridos")
        total_geral += n
        time.sleep(2)

    print(f"\n🏁 TOTAL GERAL: {total_geral} excertos no BigQuery")

if __name__ == "__main__":
    main()
PYTHON

echo "✅ etl_querido_diario.py criado"
cd ~/fiscalizapa && python3 functions/etl_querido_diario.py
```

✅ **Checkpoint:** `SELECT COUNT(*) FROM fiscalizapa.diarios_oficiais` > 0

---

## ⚡ FASE 3 — ETL: PNCP (Licitações e Contratos)

```bash
cat > ~/fiscalizapa/functions/etl_pncp.py << 'PYTHON'
"""
ETL — Portal Nacional de Contratações Públicas (PNCP)
API: https://pncp.gov.br/app/api
Ingere contratos e licitações no BigQuery.
"""

import requests
import time
from datetime import datetime, timedelta
from google.cloud import bigquery

PROJECT = "fiscallizapa"
DATASET = "fiscalizapa"
BASE_URL = "https://pncp.gov.br/api/pncp/v1"

def ingerir_contratos(dias: int = 30):
    client = bigquery.Client(project=PROJECT)
    table_ref = f"{PROJECT}.{DATASET}.contratos_pncp"

    data_inicio = (datetime.now() - timedelta(days=dias)).strftime("%Y%m%d")
    data_fim = datetime.now().strftime("%Y%m%d")
    pagina = 1
    total = 0

    print("📦 Ingerindo contratos do PNCP...")

    while True:
        try:
            resp = requests.get(
                f"{BASE_URL}/contratos",
                params={"dataInicial": data_inicio, "dataFinal": data_fim,
                        "pagina": pagina, "tamanhoPagina": 500},
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  ⚠️  Erro pág {pagina}: {e}")
            break

        items = data.get("data", [])
        if not items:
            break

        rows = []
        for item in items:
            rows.append({
                "numero_contrato": str(item.get("numeroContratoEmpenho", "")),
                "orgao_cnpj": item.get("orgaoEntidade", {}).get("cnpj", ""),
                "orgao_nome": item.get("orgaoEntidade", {}).get("razaoSocial", ""),
                "fornecedor_cnpj": item.get("fornecedor", {}).get("cnpjCpf", ""),
                "fornecedor_nome": item.get("fornecedor", {}).get("razaoSocial", ""),
                "valor_global": float(item.get("valorGlobal", 0) or 0),
                "data_assinatura": item.get("dataAssinatura", "")[:10] if item.get("dataAssinatura") else None,
                "objeto": item.get("objetoContrato", "")[:1000],
                "scraped_at": datetime.utcnow().isoformat()
            })

        if rows:
            errors = client.insert_rows_json(table_ref, rows)
            if not errors:
                total += len(rows)
            else:
                print(f"  ❌ Erro BQ: {errors[:1]}")

        print(f"  📄 Página {pagina}: {len(rows)} contratos (total: {total})")
        pagina += 1

        if len(items) < 500:
            break

        time.sleep(1)

    return total

def main():
    print("🔥 A.S.M.O.D.E.U.S. — Ingestão PNCP")
    print("=" * 40)
    total = ingerir_contratos(dias=90)
    print(f"\n🏁 {total} contratos inseridos no BigQuery")

if __name__ == "__main__":
    main()
PYTHON

echo "✅ etl_pncp.py criado"
cd ~/fiscalizapa && python3 functions/etl_pncp.py
```

✅ **Checkpoint:** `SELECT COUNT(*) FROM fiscalizapa.contratos_pncp` > 0

---

## ⚡ FASE 4 — ETL: CGU (Portal da Transparência)

```bash
# ATENÇÃO: Gere sua chave gratuita em https://api.portaldatransparencia.gov.br/
# e exporte antes de rodar:
# export CGU_API_KEY="sua_chave_aqui"

cat > ~/fiscalizapa/functions/etl_cgu.py << 'PYTHON'
"""
ETL — Portal da Transparência (CGU)
API: https://api.portaldatransparencia.gov.br/swagger-ui.html
Ingere: CEIS/CNEP (sancionados), emendas executadas, contratos federais.
Requer: variável de ambiente CGU_API_KEY
"""

import os
import requests
import time
from datetime import datetime
from google.cloud import bigquery

PROJECT = "fiscallizapa"
DATASET = "fiscalizapa"
BASE_URL = "https://api.portaldatransparencia.gov.br/api-de-dados"
API_KEY = os.environ.get("CGU_API_KEY", "")

if not API_KEY:
    raise ValueError("❌ Defina CGU_API_KEY: export CGU_API_KEY='sua_chave'")

HEADERS = {"chave-api-dados": API_KEY, "Accept": "application/json"}

def ingerir_ceis():
    """Cadastro de Empresas Inidôneas e Suspensas"""
    client = bigquery.Client(project=PROJECT)
    table_ref = f"{PROJECT}.{DATASET}.ceis_cnep"
    pagina = 1
    total = 0

    print("🚫 Ingerindo CEIS (empresas sancionadas)...")

    while True:
        try:
            resp = requests.get(
                f"{BASE_URL}/ceis",
                headers=HEADERS,
                params={"pagina": pagina, "quantidade": 500},
                timeout=30
            )
            resp.raise_for_status()
            items = resp.json()
        except Exception as e:
            print(f"  ⚠️  Erro pág {pagina}: {e}")
            break

        if not items:
            break

        rows = []
        for item in items:
            rows.append({
                "cnpj": item.get("cpfCnpjSancionado", "").replace(".", "").replace("/", "").replace("-", ""),
                "razao_social": item.get("nomeSancionado", ""),
                "tipo_sancao": item.get("tipoSancao", {}).get("descricaoResumida", ""),
                "orgao_sancionador": item.get("orgaoSancionador", {}).get("nome", ""),
                "data_inicio_sancao": item.get("dataInicioSancao", "")[:10] if item.get("dataInicioSancao") else None,
                "data_fim_sancao": item.get("dataFimSancao", "")[:10] if item.get("dataFimSancao") else None,
                "fundamentacao_legal": item.get("fundamentacaoLegal", ""),
                "scraped_at": datetime.utcnow().isoformat()
            })

        if rows:
            errors = client.insert_rows_json(table_ref, rows)
            if not errors:
                total += len(rows)

        print(f"  📄 Página {pagina}: {len(rows)} registros (total: {total})")
        pagina += 1

        if len(items) < 500:
            break

        time.sleep(1)

    return total

def main():
    print("🔥 A.S.M.O.D.E.U.S. — Ingestão CGU Portal da Transparência")
    print("=" * 55)
    t1 = ingerir_ceis()
    print(f"\n🏁 CEIS/CNEP: {t1} registros inseridos")

if __name__ == "__main__":
    main()
PYTHON

echo "✅ etl_cgu.py criado"
echo ""
echo "⚠️  ANTES DE RODAR: export CGU_API_KEY='sua_chave'"
echo "   Gere em: https://api.portaldatransparencia.gov.br/"
echo ""
echo "Depois rode: python3 ~/fiscalizapa/functions/etl_cgu.py"
```

✅ **Checkpoint:** `SELECT COUNT(*) FROM fiscalizapa.ceis_cnep` > 0

---

## ⚡ FASE 5 — ETL: BRASIL.IO (QSA da Receita Federal)

```bash
cat > ~/fiscalizapa/functions/etl_brasilio_qsa.py << 'PYTHON'
"""
ETL — Brasil.IO (Quadro de Sócios e Administradores da Receita Federal)
API: https://brasil.io/api/
Ingere dados de empresas e sócios no BigQuery para cruzamento forense.
"""

import requests
import time
from datetime import datetime
from google.cloud import bigquery

PROJECT = "fiscallizapa"
DATASET = "fiscalizapa"
TABLE = "cnpj_enriquecido"
BASE_URL = "https://brasil.io/api/dataset/socios-brasil"

def enriquecer_cnpj(cnpj: str) -> dict | None:
    """Busca dados de um CNPJ específico no Brasil.IO"""
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    try:
        resp = requests.get(
            f"{BASE_URL}/empresas/data/",
            params={"cnpj": cnpj_limpo},
            headers={"User-Agent": "ASMODEUS-Fiscalizapa/1.0"},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if results:
            return results[0]
    except Exception as e:
        print(f"  ⚠️  Erro CNPJ {cnpj}: {e}")
    return None

def ingerir_socios_cnpj(cnpj: str) -> list:
    """Busca sócios de um CNPJ"""
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    socios = []
    try:
        resp = requests.get(
            f"{BASE_URL}/socios/data/",
            params={"cnpj": cnpj_limpo},
            headers={"User-Agent": "ASMODEUS-Fiscalizapa/1.0"},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        socios = [s.get("nome_socio", "") for s in data.get("results", [])]
    except Exception as e:
        print(f"  ⚠️  Erro sócios {cnpj}: {e}")
    return socios

def enriquecer_cnpjs_contratos():
    """Pega CNPJs únicos dos contratos e enriquece com QSA"""
    client = bigquery.Client(project=PROJECT)
    table_ref = f"{PROJECT}.{DATASET}.{TABLE}"

    # Pegar CNPJs únicos que ainda não foram enriquecidos
    query = f"""
        SELECT DISTINCT fornecedor_cnpj
        FROM `{PROJECT}.{DATASET}.contratos_pncp`
        WHERE fornecedor_cnpj NOT IN (
            SELECT cnpj FROM `{PROJECT}.{DATASET}.{TABLE}`
        )
        AND fornecedor_cnpj IS NOT NULL
        AND LENGTH(fornecedor_cnpj) >= 14
        LIMIT 500
    """

    rows_bq = list(client.query(query).result())
    print(f"🔍 {len(rows_bq)} CNPJs para enriquecer...")

    rows_to_insert = []
    for row in rows_bq:
        cnpj = row.fornecedor_cnpj
        empresa = enriquecer_cnpj(cnpj)
        if not empresa:
            time.sleep(0.5)
            continue

        socios = ingerir_socios_cnpj(cnpj)

        rows_to_insert.append({
            "cnpj": cnpj,
            "razao_social": empresa.get("razao_social", ""),
            "nome_fantasia": empresa.get("nome_fantasia", ""),
            "situacao": empresa.get("situacao_cadastral", ""),
            "data_abertura": empresa.get("data_abertura", ""),
            "capital_social": float(empresa.get("capital_social", 0) or 0),
            "porte": empresa.get("porte", ""),
            "cnae_principal": empresa.get("cnae_fiscal", ""),
            "municipio": empresa.get("municipio", ""),
            "estado": empresa.get("uf", ""),
            "socios": " | ".join(socios),
            "qtd_funcionarios": None,
            "scraped_at": datetime.utcnow().isoformat()
        })

        time.sleep(0.5)  # respeitar rate limit do Brasil.IO

    if rows_to_insert:
        errors = client.insert_rows_json(table_ref, rows_to_insert)
        if not errors:
            print(f"✅ {len(rows_to_insert)} empresas enriquecidas")
        else:
            print(f"❌ Erros BQ: {errors[:2]}")

    return len(rows_to_insert)

def main():
    print("🔥 A.S.M.O.D.E.U.S. — Enriquecimento QSA via Brasil.IO")
    print("=" * 55)
    total = enriquecer_cnpjs_contratos()
    print(f"\n🏁 {total} empresas com QSA no BigQuery")

if __name__ == "__main__":
    main()
PYTHON

echo "✅ etl_brasilio_qsa.py criado"
cd ~/fiscalizapa && python3 functions/etl_brasilio_qsa.py
```

---

## ⚡ FASE 6 — VIEWS FORENSES NO BIGQUERY

```bash
cat > ~/fiscalizapa/sql/views_forenses.sql << 'SQL'
-- ============================================================
-- A.S.M.O.D.E.U.S. — VIEWS FORENSES
-- Motor de Detecção de Irregularidades
-- ============================================================

-- VIEW 1: Extração automática de CNPJ e valores dos Diários Oficiais
CREATE OR REPLACE VIEW `fiscallizapa.fiscalizapa.v_diario_cnpj_valores` AS
SELECT
  data_publicacao,
  id_municipio,
  municipio,
  url,
  REGEXP_EXTRACT(excerto, r'[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}') AS cnpj_extraido,
  REGEXP_EXTRACT(excerto, r'R\$\s?[0-9]{1,3}(?:\.[0-9]{3})*\,[0-9]{2}') AS valor_extraido,
  excerto
FROM `fiscallizapa.fiscalizapa.diarios_oficiais`
WHERE excerto IS NOT NULL;

-- VIEW 2: 🔴 ALERTA — Doador Vencedor (financiador de campanha vence licitação)
CREATE OR REPLACE VIEW `fiscallizapa.fiscalizapa.v_alerta_doador_vencedor` AS
SELECT
  c.numero_contrato,
  c.orgao_nome,
  c.fornecedor_cnpj,
  c.fornecedor_nome,
  c.valor_global,
  c.data_assinatura,
  c.objeto,
  t.nome_doador,
  t.candidato_apoiado,
  t.valor_doado,
  t.ano_eleicao,
  '🔴 DOADOR VENCEDOR' AS tipo_alerta
FROM `fiscallizapa.fiscalizapa.contratos_pncp` c
INNER JOIN `fiscallizapa.fiscalizapa.tse_doacoes` t
  ON c.fornecedor_cnpj = t.cnpj_doador
WHERE c.valor_global > 10000;

-- VIEW 3: 🔴 ALERTA — Empresa Sancionada Vencendo Contratos (CEIS/CNEP)
CREATE OR REPLACE VIEW `fiscallizapa.fiscalizapa.v_alerta_sancionado_ativo` AS
SELECT
  c.numero_contrato,
  c.orgao_nome,
  c.fornecedor_cnpj,
  c.fornecedor_nome,
  c.valor_global,
  c.data_assinatura,
  s.tipo_sancao,
  s.orgao_sancionador,
  s.data_inicio_sancao,
  s.data_fim_sancao,
  '🔴 SANCIONADO ATIVO' AS tipo_alerta
FROM `fiscallizapa.fiscalizapa.contratos_pncp` c
INNER JOIN `fiscallizapa.fiscalizapa.ceis_cnep` s
  ON c.fornecedor_cnpj = s.cnpj
WHERE (s.data_fim_sancao IS NULL OR s.data_fim_sancao >= CURRENT_DATE())
  AND c.data_assinatura >= s.data_inicio_sancao;

-- VIEW 4: 🔴 ALERTA — Empresa de Fachada (zero funcionários, alto valor)
CREATE OR REPLACE VIEW `fiscallizapa.fiscalizapa.v_alerta_empresa_fachada` AS
SELECT
  c.fornecedor_cnpj,
  e.razao_social,
  e.data_abertura,
  e.capital_social,
  e.socios,
  COUNT(c.numero_contrato) AS qtd_contratos,
  SUM(c.valor_global) AS valor_total,
  '🔴 EMPRESA FACHADA' AS tipo_alerta
FROM `fiscallizapa.fiscalizapa.contratos_pncp` c
INNER JOIN `fiscallizapa.fiscalizapa.cnpj_enriquecido` e
  ON c.fornecedor_cnpj = e.cnpj
WHERE (e.qtd_funcionarios = 0 OR e.qtd_funcionarios IS NULL)
  AND e.capital_social < 10000
GROUP BY 1,2,3,4,5
HAVING valor_total > 50000;

-- VIEW 5: 🟠 ALERTA — Fracionamento de Despesas
CREATE OR REPLACE VIEW `fiscallizapa.fiscalizapa.v_alerta_fracionamento` AS
SELECT
  orgao_nome,
  fornecedor_cnpj,
  COUNT(*) AS qtd_contratos_suspeitos,
  SUM(valor_global) AS valor_total_fracionado,
  MIN(data_assinatura) AS primeira_contratacao,
  MAX(data_assinatura) AS ultima_contratacao,
  '🟠 FRACIONAMENTO' AS tipo_alerta
FROM `fiscallizapa.fiscalizapa.contratos_pncp`
WHERE valor_global < 50000
  AND data_assinatura >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
GROUP BY 1,2
HAVING qtd_contratos_suspeitos >= 3
  AND valor_total_fracionado > 50000;

-- VIEW 6: 🔥 OPERAÇÃO BRAGANÇA — Caça ao Contrato de Show/Evento
CREATE OR REPLACE VIEW `fiscallizapa.fiscalizapa.v_operacao_braganca` AS
SELECT
  data_publicacao,
  municipio,
  url,
  REGEXP_EXTRACT(excerto, r'[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}') AS cnpj_produtora,
  REGEXP_EXTRACT(excerto, r'R\$\s?[0-9]{1,3}(?:\.[0-9]{3})*\,[0-9]{2}') AS valor_contrato,
  excerto
FROM `fiscallizapa.fiscalizapa.diarios_oficiais`
WHERE (id_municipio = '1501709' OR UPPER(municipio) = 'BRAGANÇA')
  AND (
    UPPER(excerto) LIKE '%ALOK%' OR
    UPPER(excerto) LIKE '%CARNAVAL%' OR
    UPPER(excerto) LIKE '%SHOW%' OR
    UPPER(excerto) LIKE '%FESTA%'
  )
  AND (
    UPPER(excerto) LIKE '%INEXIGIBILIDADE%' OR
    UPPER(excerto) LIKE '%CONTRATO%' OR
    UPPER(excerto) LIKE '%DISPENSA%'
  )
ORDER BY data_publicacao DESC;

-- VIEW 7: 🔥 OPERAÇÃO BARCARENA — Mineração e Royalties
CREATE OR REPLACE VIEW `fiscallizapa.fiscalizapa.v_operacao_barcarena` AS
SELECT
  data_publicacao,
  municipio,
  url,
  REGEXP_EXTRACT(excerto, r'[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}') AS cnpj_empresa,
  REGEXP_EXTRACT(excerto, r'R\$\s?[0-9]{1,3}(?:\.[0-9]{3})*\,[0-9]{2}') AS valor,
  excerto
FROM `fiscallizapa.fiscalizapa.diarios_oficiais`
WHERE (id_municipio = '1501758' OR UPPER(municipio) = 'BARCARENA')
  AND (
    UPPER(excerto) LIKE '%HYDRO%' OR
    UPPER(excerto) LIKE '%ALUNORTE%' OR
    UPPER(excerto) LIKE '%MINERAÇÃO%' OR
    UPPER(excerto) LIKE '%CFEM%' OR
    UPPER(excerto) LIKE '%ROYALT%' OR
    UPPER(excerto) LIKE '%ALUMÍNIO%'
  )
ORDER BY data_publicacao DESC;

-- VIEW 8: 📊 PAINEL GERAL DE ALERTAS (une todas as views)
CREATE OR REPLACE VIEW `fiscallizapa.fiscalizapa.v_painel_alertas` AS
SELECT tipo_alerta, COUNT(*) AS qtd, SUM(valor_global) AS valor_total
FROM `fiscallizapa.fiscalizapa.v_alerta_doador_vencedor`
GROUP BY tipo_alerta
UNION ALL
SELECT tipo_alerta, COUNT(*), SUM(valor_global)
FROM `fiscallizapa.fiscalizapa.v_alerta_sancionado_ativo`
GROUP BY tipo_alerta
UNION ALL
SELECT tipo_alerta, COUNT(*), SUM(valor_total)
FROM `fiscallizapa.fiscalizapa.v_alerta_empresa_fachada`
GROUP BY tipo_alerta
UNION ALL
SELECT tipo_alerta, COUNT(*), SUM(valor_total_fracionado)
FROM `fiscallizapa.fiscalizapa.v_alerta_fracionamento`
GROUP BY tipo_alerta;

SQL

echo "✅ views_forenses.sql criado"

# Executar as views no BigQuery
bq query --use_legacy_sql=false < ~/fiscalizapa/sql/views_forenses.sql && \
  echo "✅ Views criadas no BigQuery" || \
  echo "❌ Erro ao criar views — verificar output acima"
```

---

## ⚡ FASE 7 — SETUP PUB/SUB (Orquestração)

```bash
cat > ~/fiscalizapa/scripts/setup_pubsub.sh << 'SCRIPT'
#!/bin/bash
PROJECT="fiscallizapa"

echo "🔧 Configurando Pub/Sub para o A.S.M.O.D.E.U.S..."

# Topic principal
gcloud pubsub topics create asmodeus-ingestao --project=$PROJECT \
  2>/dev/null && echo "✅ Topic asmodeus-ingestao criado" || echo "⚠️  Já existe"

# Dead letter topic (erros)
gcloud pubsub topics create asmodeus-erros --project=$PROJECT \
  2>/dev/null && echo "✅ Topic asmodeus-erros criado" || echo "⚠️  Já existe"

# Subscriptions para cada worker
for worker in querido-diario pncp cgu brasilio-qsa; do
  gcloud pubsub subscriptions create asmodeus-sub-$worker \
    --topic=asmodeus-ingestao \
    --project=$PROJECT \
    --dead-letter-topic=asmodeus-erros \
    --max-delivery-attempts=5 \
    2>/dev/null && echo "✅ Subscription $worker criada" || echo "⚠️  Já existe"
done

echo ""
echo "📡 Pub/Sub configurado. Topics ativos:"
gcloud pubsub topics list --project=$PROJECT
SCRIPT

chmod +x ~/fiscalizapa/scripts/setup_pubsub.sh
bash ~/fiscalizapa/scripts/setup_pubsub.sh
```

---

## ⚡ FASE 8 — CLOUD SCHEDULER (Automatização)

```bash
cat > ~/fiscalizapa/scripts/setup_scheduler.sh << 'SCRIPT'
#!/bin/bash
PROJECT="fiscallizapa"
REGION="us-central1"

echo "⏰ Configurando Cloud Scheduler..."

# Querido Diário — diário às 02h
gcloud scheduler jobs create pubsub asmodeus-querido-diario-daily \
  --project=$PROJECT \
  --location=$REGION \
  --schedule="0 2 * * *" \
  --topic=asmodeus-ingestao \
  --message-body='{"source":"querido_diario","municipios":"todos"}' \
  --time-zone="America/Belem" \
  2>/dev/null && echo "✅ Scheduler Querido Diário" || echo "⚠️  Já existe"

# PNCP — diário às 03h
gcloud scheduler jobs create pubsub asmodeus-pncp-daily \
  --project=$PROJECT \
  --location=$REGION \
  --schedule="0 3 * * *" \
  --topic=asmodeus-ingestao \
  --message-body='{"source":"pncp","dias":1}' \
  --time-zone="America/Belem" \
  2>/dev/null && echo "✅ Scheduler PNCP" || echo "⚠️  Já existe"

# CGU — diário às 04h
gcloud scheduler jobs create pubsub asmodeus-cgu-daily \
  --project=$PROJECT \
  --location=$REGION \
  --schedule="0 4 * * *" \
  --topic=asmodeus-ingestao \
  --message-body='{"source":"cgu"}' \
  --time-zone="America/Belem" \
  2>/dev/null && echo "✅ Scheduler CGU" || echo "⚠️  Já existe"

# Brasil.IO QSA — semanal aos domingos às 05h
gcloud scheduler jobs create pubsub asmodeus-brasilio-weekly \
  --project=$PROJECT \
  --location=$REGION \
  --schedule="0 5 * * 0" \
  --topic=asmodeus-ingestao \
  --message-body='{"source":"brasilio_qsa"}' \
  --time-zone="America/Belem" \
  2>/dev/null && echo "✅ Scheduler Brasil.IO" || echo "⚠️  Já existe"

echo ""
echo "⏰ Jobs agendados:"
gcloud scheduler jobs list --project=$PROJECT --location=$REGION
SCRIPT

chmod +x ~/fiscalizapa/scripts/setup_scheduler.sh
bash ~/fiscalizapa/scripts/setup_scheduler.sh
```

---

## ⚡ FASE 9 — VALIDAÇÃO FINAL (Sanity Check)

```bash
cat > ~/fiscalizapa/scripts/sanity_check.sh << 'SCRIPT'
#!/bin/bash
echo "🔍 A.S.M.O.D.E.U.S. — SANITY CHECK"
echo "======================================"

PROJECT="fiscallizapa"
DATASET="fiscalizapa"

tabelas=(
  "ceaps_senado"
  "emendas_2024"
  "diarios_oficiais"
  "contratos_pncp"
  "licitacoes_pncp"
  "cnpj_enriquecido"
  "tse_doacoes"
  "ceis_cnep"
  "pca_planos_contratacao"
)

for tabela in "${tabelas[@]}"; do
  count=$(bq query --use_legacy_sql=false --format=csv \
    "SELECT COUNT(*) FROM \`$PROJECT.$DATASET.$tabela\`" 2>/dev/null | tail -1)
  if [ "$count" = "0" ] || [ -z "$count" ]; then
    echo "❌ $tabela — VAZIA ou INEXISTENTE"
  else
    echo "✅ $tabela — $count registros"
  fi
done

echo ""
echo "📊 ALERTAS ATIVOS:"
bq query --use_legacy_sql=false \
  "SELECT tipo_alerta, qtd, valor_total FROM \`$PROJECT.$DATASET.v_painel_alertas\` ORDER BY qtd DESC" \
  2>/dev/null || echo "⚠️  Views ainda não populadas (aguardar ingestão)"

echo ""
echo "🔥 OPERAÇÃO BRAGANÇA:"
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as registros FROM \`$PROJECT.$DATASET.v_operacao_braganca\`" \
  2>/dev/null || echo "⚠️  Aguardando dados do Querido Diário"
SCRIPT

chmod +x ~/fiscalizapa/scripts/sanity_check.sh
bash ~/fiscalizapa/scripts/sanity_check.sh
```

---

## 📋 RESUMO DE EXECUÇÃO PARA O COMET

```
Execute nesta ordem exata:

1. PRÉ-REQUISITOS     → autenticar, instalar deps, clonar repo
2. FASE 0 Bug 1       → corrigir CEAPS (header JSON)
3. FASE 0 Bug 2       → corrigir coluna Ano das emendas
4. FASE 1             → criar 7 tabelas no BigQuery
5. FASE 2             → rodar etl_querido_diario.py
6. FASE 3             → rodar etl_pncp.py
7. FASE 4             → rodar etl_cgu.py (precisa de CGU_API_KEY)
8. FASE 5             → rodar etl_brasilio_qsa.py
9. FASE 6             → criar views forenses no BigQuery
10. FASE 7            → setup Pub/Sub
11. FASE 8            → setup Cloud Scheduler
12. FASE 9            → sanity_check.sh — reportar resultado

SE CRASHAR: pare, rode o sanity_check.sh e reporte o output completo.
```

---

*Gerado em 2026-04-06 | Projeto fiscallizapa | A.S.M.O.D.E.U.S. v1.0*
