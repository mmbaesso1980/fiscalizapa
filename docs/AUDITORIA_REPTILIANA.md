# AUDITORIA — Protocolo Invasão Reptiliana (Ingestão em Enxame e Diários Oficiais)
> A.S.M.O.D.E.U.S. · Fase 7 · Sessão executada em: **08/04/2026**
> Arquiteto responsável: Claude (Cursor Agent)

---

## Resumo Executivo

O **Protocolo Invasão Reptiliana** transformou o sistema de ingestão de um pipeline sequencial para uma máquina paralela capaz de escalar até 1.000 fontes simultâneas. O crawler é orientado a dados (config-driven), o registro é extensível sem novo código Python, o contexto econômico alimenta detecção de superfaturamento e o DataPulse expõe a atividade em tempo real na Sala do Trono.

---

## PARTE 1 — O Sistema Nervoso Central (`10_universal_crawler.py`)

### Arquivo criado: `engines/10_universal_crawler.py`

#### Hierarquia de Classes

```
AsmodeusCrawler (abc.ABC)           ← contrato base
├── RSSCrawler                       ← RSS/Atom: DOU, DOE, DOM
├── JSONAPICrawler                   ← REST JSON: Transparência, Compras, Câmara
└── HTMLScraper                      ← Fallback HTML com html.parser stdlib

BodeDetector                         ← Gemini integration (lazy init)
CrawlerOrchestrator                  ← ThreadPoolExecutor + registry reader
CrawlerResult (dataclass)            ← imutável, serializable
```

#### Métodos obrigatórios (interface)

| Método | Responsabilidade |
|--------|-----------------|
| `fetch() → Any` | HTTP request (implementado por subclasse) |
| `parse(raw) → list[dict]` | Extração de dados estruturados |

#### Métodos herdados (AsmodeusCrawler)

| Método | Descrição |
|--------|-----------|
| `extract_text_for_bode(record)` | Concatena campos de texto para análise Gemini |
| `save_to_bq(records)` | Chama `sanitize_and_load` do 01_bq_setup.py via importlib |
| `save_bode_to_firestore(record, bode)` | Grava alerta em `alertas_bodes` |
| `run() → CrawlerResult` | Orquestra: fetch → parse → detect → save |

#### BodeDetector — Pré-filtro por keywords

Para economizar quota do Gemini, cada ato passa por um **filtro de keywords local** antes de ser enviado à IA. Se nenhuma keyword suspeita aparecer no texto, a chamada Gemini é pulada.

```python
# Keywords configuradas por API no registry
"bode_keywords": ["dispensa de licitação","inexigibilidade","nomeação de parentes","aditivo"]

# Pré-filtro (O(n) em texto, zero custo de API)
if not any(kw.lower() in text_lower for kw in keywords):
    return None  # sem suspeita → não chama Gemini
```

#### Prompt Gemini de Detecção

```
Analise o seguinte trecho de ato oficial e responda APENAS com JSON:
{
  "is_bode": true/false,
  "tipo_alerta": "DISPENSA_LICITACAO|NEPOTISMO|SUPERFATURAMENTO|...",
  "criticidade": "ALTA|MEDIA|BAIXA",
  "descricao": "...",
  "entidades_suspeitas": [...],
  "valores_suspeitos": [...]
}
```

#### CrawlerOrchestrator — Execução Paralela

```python
with ThreadPoolExecutor(max_workers=N, thread_name_prefix="asmodeus") as pool:
    future_to_api = {
        pool.submit(make_crawler(cfg, detector, db, bq, dry_run).run): cfg
        for cfg in apis
    }
    for future in as_completed(future_to_api):
        result = future.result()
        _write_activity(run_id, results, status="running")  # tempo real → DataPulse
```

#### Atividade em Firestore (`crawler_activity/{run_id}`)

Cada resultado parcial é gravado em tempo real:

```json
{
  "run_id":        "run_20260408_030012",
  "status":        "running",
  "total_records": 1842,
  "total_bodes":   3,
  "updatedAt":     Timestamp,
  "apis": [
    { "api_id": "dou_rss_edicao1", "status": "done", "records": 47, "bodes": 1, "duration_ms": 1240 },
    { "api_id": "transparencia_contratos", "status": "running", "records": 0, ... }
  ]
}
```

Esta estrutura alimenta o `DataPulse.jsx` no AdminDashboard em tempo real.

#### Uso CLI

```bash
# Crawl completo (todos os 20 da registry)
python engines/10_universal_crawler.py

# Crawl específico de 2 APIs
python engines/10_universal_crawler.py --api-ids dou_rss_edicao1 transparencia_contratos

# 8 workers paralelos + sem Gemini
python engines/10_universal_crawler.py --max-workers 8 --no-gemini

# Respeita Kill Switch do Firestore
python engines/10_universal_crawler.py --kill-check

# Dry-run (sem salvar)
python engines/10_universal_crawler.py --dry-run
```

---

## PARTE 2 — O Mapa das 1.000 APIs (`registry_apis.json`)

### Arquivo criado: `engines/registry_apis.json`

**20 endpoints críticos catalogados.** Para adicionar um novo alvo, basta incluir um objeto JSON no array — nenhum código Python precisa ser alterado.

#### Estrutura de cada entrada

```json
{
  "id":              "identificador_unico",
  "name":            "Nome legível",
  "type":            "rss | json_api | html",
  "url":             "https://...",
  "headers":         { "chave-api-dados": "${TRANSPARENCIA_API_KEY}" },
  "params":          { "pagina": 1, "ano": "${CURRENT_YEAR}" },
  "bq_table":        "fiscalizapa.nome_tabela",
  "firestore_col":   "alertas_bodes | null",
  "bode_detection":  true,
  "rate_limit_ms":   1000,
  "priority":        1,
  "active":          true,
  "tags":            ["diario_oficial", "federal"],
  "pagination":      { "type": "page", "param": "pagina", "page_size": 500 },
  "bode_keywords":   ["dispensa","nomeação"]
}
```

#### Placeholders dinâmicos suportados

| Placeholder | Valor |
|-------------|-------|
| `${TODAY}` | data atual (DD/MM/YYYY) |
| `${CURRENT_YEAR}` | ano atual |
| `${DATE_30_DAYS_AGO}` | 30 dias atrás |
| `${DATE_365_DAYS_AGO}` | 365 dias atrás |
| `${TRANSPARENCIA_API_KEY}` | env var |

#### Os 20 endpoints cadastrados

| ID | Fonte | Tipo | BQ Table | Bodes? |
|----|-------|------|----------|--------|
| `dou_rss_edicao1` | DOU Ed.1 (RSS) | rss | diarios_atos | ✅ |
| `dou_rss_edicao2` | DOU Ed.2 Extra (RSS) | rss | diarios_atos | ✅ |
| `transparencia_emendas` | Portal Transparência | json | emendas_parlamentares | — |
| `transparencia_contratos` | Portal Transparência | json | contratos_federais | ✅ |
| `transparencia_despesas` | Portal Transparência | json | despesas_federais | — |
| `transparencia_servidores` | Portal Transparência | json | servidores_federais | — |
| `transparencia_cnep` | CNEP | json | empresas_punidas | ✅ |
| `transparencia_ceis` | CEIS | json | empresas_inidôneas | ✅ |
| `compras_contratos` | Compras.gov SIASG | json | contratos_siasg | ✅ |
| `compras_licitacoes` | Compras.gov Licitações | json | licitacoes_siasg | — |
| `camara_deputados` | Câmara API | json | deputados_raw | — |
| `camara_despesas_ceap` | Câmara CEAP | json | ceap_raw | ✅ |
| `camara_proposicoes` | Câmara Proposições | json | proposicoes_raw | — |
| `bcb_cambio_usd` | BCB Dólar | json | contexto_economico | — |
| `bcb_cambio_eur` | BCB Euro | json | contexto_economico | — |
| `bcb_ipca` | BCB IPCA | json | contexto_economico | — |
| `ibge_municipios` | IBGE Municípios | json | ibge_municipios | — |
| `dou_sp_imesp_rss` | DO São Paulo | rss | diarios_atos | ✅ |
| `dou_rj_doerj_rss` | DO Rio de Janeiro | rss | diarios_atos | ✅ |
| `dou_pa_belem_rss` | DO Belém/PA | rss | diarios_atos | ✅ |

#### Escalabilidade para 1.000 APIs

Para adicionar um novo alvo: **editar apenas `registry_apis.json`**. O `10_universal_crawler.py` lê e instancia automaticamente. O `ThreadPoolExecutor` escala o paralelismo pelo parâmetro `--max-workers`.

```json
// Exemplo: adicionar Diário Oficial de Fortaleza
{
  "id":             "doe_ce_fortaleza",
  "name":           "DO Fortaleza/CE",
  "type":           "rss",
  "url":            "https://diario.fortaleza.ce.gov.br/rss",
  "bq_table":       "fiscalizapa.diarios_atos",
  "bode_detection": true,
  "active":         true
}
```

---

## PARTE 3 — Monitor de Dados Externos (`11_external_context.py`)

### Arquivo criado: `engines/11_external_context.py`

#### 4 fontes de contexto econômico

| Fonte | Status | Dados |
|-------|--------|-------|
| **BCB/SGS** | ✅ API real | USD/BRL, EUR/BRL, IPCA, IGP-M, Selic, INCC, TJLP (8 séries) |
| **IPEADATA** | ✅ API real | Brent, asfalto, FCI construção (4 séries) |
| **ANP** | ⚠ Simulado | Gasolina, Diesel S-10, Etanol, GNV (preços semanais calibrados) |
| **SINAPI** | ⚠ Simulado | Asfalto, cimento, aço CA-50, mão de obra (preços mensais) |

#### Schema BigQuery: `fiscalizapa.contexto_economico`

```sql
data_referencia   DATE        -- Data da observação
indicador         STRING      -- "USD_BRL_PTAX_COMPRA", "ASFALTO_USINADO", ...
categoria         STRING      -- "CAMBIO", "INFLACAO", "COMBUSTIVEL", "CONSTRUCAO"
valor             FLOAT64     -- Valor numérico
unidade           STRING      -- "BRL/USD", "R$/t", "%", ...
fonte             STRING      -- "BCB_SGS_1", "ANP_SIMULADO", ...
descricao         STRING      -- Descrição legível da série
ingestao_ts       TIMESTAMP   -- Quando foi ingerido
```

#### Uso em Views Forenses (detecção de superfaturamento)

```sql
-- Exemplo de view forense que usa contexto_economico:
CREATE OR REPLACE VIEW fiscalizapa.vw_superfaturamento_asfalto AS
SELECT
  c.data_empenho,
  c.nome_fornecedor,
  c.valor_contrato,
  e.valor AS preco_mercado_ton,
  c.quantidade_ton,
  c.valor_contrato / c.quantidade_ton AS preco_pago_ton,
  (c.valor_contrato / c.quantidade_ton) / e.valor AS multiplicador_preco,
  CASE
    WHEN (c.valor_contrato / c.quantidade_ton) > e.valor * 1.5 THEN 'ALTA'
    WHEN (c.valor_contrato / c.quantidade_ton) > e.valor * 1.25 THEN 'MEDIA'
    ELSE 'BAIXA'
  END AS criticidade_superfaturamento
FROM fiscalizapa.contratos_federais c
JOIN fiscalizapa.contexto_economico e
  ON e.indicador = 'SINAPI_ASFALTO_USINADO'
  AND e.data_referencia = DATE_TRUNC(c.data_empenho, MONTH)
WHERE c.objeto_contrato LIKE '%asfalto%';
```

#### Uso CLI

```bash
python engines/11_external_context.py                    # últimos 60 dias, todas as fontes
python engines/11_external_context.py --days 365         # 1 ano histórico
python engines/11_external_context.py --sources bcb anp  # fontes específicas
python engines/11_external_context.py --dry-run          # sem gravar no BQ
```

---

## PARTE 4 — Visualização de Dados Vivos (`DataPulse.jsx`)

### Arquivo criado: `frontend/src/components/DataPulse.jsx`

### Arquivo atualizado: `frontend/src/pages/AdminDashboard.jsx`

O `DataPulse` foi adicionado acima do log terminal existente, na seção "Motor · Atividade em Tempo Real".

#### Fonte de dados (Firestore em tempo real)

```js
onSnapshot(
  query(collection(db, "crawler_activity"), orderBy("updatedAt","desc"), limit(3)),
  (snap) => {
    const latest = snap.docs[0].data();
    // apis[].status, records, bodes, duration_ms → PulseLine
  }
)
```

#### Fallback mock (quando Firestore vazio)

Se não houver atividade real, o componente gera eventos mock com um **gerador JavaScript infinito** (`function*`) que cicla pelos 10 APIs do mock em intervalo de 900ms, simulando running → done/error.

#### Layout terminal (6 colunas fixas)

```
HORA      ST    TIPO   API NAME                     RECS    BODES/MS
03:14:22  OK   [API]  Câmara · Despesas CEAP          480       2ms
03:14:23  >>>  [RSS]  DOU RSS Ed.1                      …
03:14:24  ERR  [API]  BCB · Câmbio USD                  0     ERR
```

#### Status visual

| Status | Indicador | Cor | Animação |
|--------|-----------|-----|----------|
| `running` | `>>>` | Azul `#58A6FF` | pulse 1s |
| `done` | ` OK` | Verde `#56D364` | — |
| `error` | `ERR` | Vermelho `#FF4C4C` | blink 1s |
| `skipped` | `SKP` | Cinza | — |

#### Linha com Bode detectado

Quando `bodes > 0`, a linha fica amarela (`#D29922`) e exibe `🐐 N` na coluna de métricas, destacando visualmente as detecções de irregularidade.

---

## Todos os Arquivos Criados/Modificados

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `engines/registry_apis.json` | **Novo** | 20 endpoints · config-driven · extensível para 1.000 |
| `engines/10_universal_crawler.py` | **Novo** | AsmodeusCrawler + RSS/JSON/HTML + BodeDetector + ThreadPoolExecutor |
| `engines/11_external_context.py` | **Novo** | BCB + IPEADATA + ANP + SINAPI → BigQuery contexto_economico |
| `frontend/src/components/DataPulse.jsx` | **Novo** | Terminal hacker em tempo real · mock fallback |
| `frontend/src/pages/AdminDashboard.jsx` | Atualizado | + import DataPulse + seção "Atividade em Tempo Real" |

---

## Índices Firestore Necessários

```
crawler_activity → updatedAt DESC  (para onSnapshot do DataPulse)
```

## Dependências Opcionais Python

```bash
pip install feedparser    # RSS parsing (fallback para xml.etree sem feedparser)
```

## Executar o Pipeline Completo

```bash
# 1. Dados econômicos (contexto para views forenses)
python engines/11_external_context.py

# 2. Crawl de todas as APIs em paralelo (6 workers padrão)
python engines/10_universal_crawler.py --kill-check

# 3. Modo turbo (máximo paralelismo)
python engines/10_universal_crawler.py --max-workers 12

# 4. Adicionar ao cron (após 08_web_call.py no asmodeus_cron.yml):
# python engines/11_external_context.py --days 2
# python engines/10_universal_crawler.py --max-workers 8 --kill-check
```

---

## Mapa de Expansão (Roadmap para 1.000 APIs)

```
20 APIs (atual)
   ├─ Fase 8: + 50 Diários Oficiais Municipais (automatizar via registro)
   ├─ Fase 9: + TCU obras paralisadas, Controladoria, MPF
   ├─ Fase 10: + Cartórios (RCPN - RFB), Juntas Comerciais (DREI)
   ├─ Fase 11: + Todos os 26 estados × 3 poderes = ~80 fontes
   └─ Fase 12: + Câmaras Municipais capitais (27) + Assembleias (27) = ~1.000
```

---

*Gerado automaticamente pelo Cursor Agent — Protocolo Invasão Reptiliana · 08/04/2026*
