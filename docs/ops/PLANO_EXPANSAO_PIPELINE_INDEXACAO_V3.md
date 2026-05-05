# Plano de Operação · Expansão do Pipeline de Indexação TransparênciaBR
**Versão:** 3.0 (engenharia conservadora) · **Data:** 05/05/2026
**Autor (humano responsável):** Comandante Baesso — manusalt13@gmail.com
**Ambiente alvo:** GCP `projeto-codex-br` (Vertex/DocAI) e `transparenciabr` (Hosting/Functions)
**Orçamento aprovado pelo dono:** até R$ 5.500 em consumo Vertex AI / Document AI / Gemini API.
**Janela de execução autorizada:** próximas 24h, com kill-switch automático ao atingir 90% do orçamento.

---

## 1. Contexto e justificativa de negócio

A TransparênciaBR já possui um pipeline operacional de busca em 10 datastores Vertex AI Search (45.191 documentos), uma Cloud Function pública (`getDossiePoliticoV2`) e frontend em produção (`/politica/busca`). Este plano descreve a **fase de expansão controlada** que:

1. Consolida dados já existentes (Firestore + BigQuery) em um datastore unificado, evitando ilhas de dados.
2. Habilita busca semântica via embeddings, complementando a busca lexical atual.
3. Adiciona geração assistida (RAG) com citações ancoradas, sem alucinação.
4. Automatiza ingestão contínua dos endpoints públicos já catalogados (143 APIs federais), mantendo o índice atualizado.

O orçamento de R$ 5.500 corresponde a aproximadamente **uma janela de Vertex AI Search Standard Edition** + processamento Document AI dos PDFs de prestação de contas já no Data Lake. **Todo gasto fica abaixo do orçamento já alocado e auditado** pelo dono do projeto.

---

## 2. Princípios de engenharia (não negociáveis)

| Princípio | Implementação |
|---|---|
| **Idempotência** | Toda escrita verifica existência antes (skip se já processado) |
| **Observabilidade** | Logs estruturados em `/var/log/queima_*` e Cloud Logging com labels |
| **Kill-switch financeiro** | Watchdog cron de 30 em 30min lendo Cloud Billing — encerra workers se gasto MTD >= 90% do budget |
| **Sem efeitos colaterais destrutivos** | Zero writes em Firestore de produção. Apenas leituras para export. Lake (`gs://datalake-tbr-clean/`) é destino exclusivo |
| **Dry-run obrigatório** | Toda Frente possui modo `--dry-run` que apenas inventaria e estima custo antes de gastar |
| **Restart com backoff** | systemd com `Restart=always RestartSec=30` + jitter para não criar tempestade de retry |
| **Concorrência limitada** | Pools de no máximo 4-8 threads/processos por worker |
| **Auditoria git** | Cada milestone gera commit no `main` com `chore(queima): <frente> · métrica` |

---

## 3. Inventário do estado atual (verificado em 05/05/2026)

### 3.1 Operacional (não tocar)
- Cloud Function v2: `https://getdossiepoliticov2-evkxdmnelq-uc.a.run.app`
- Frontend: `https://transparenciabr.web.app/politica/busca`
- 10 datastores `tbr-fs2-*` em `projeto-codex-br` (45.191 docs)
- Repo: `mmbaesso1980/transparenciabr` · branch `main` · último commit `4f95d21c`

### 3.2 Recursos provisionados ociosos
- VM `tbr-mainframe` (g2-standard-8 + L4 24GB) em `transparenciabr` — atualmente parada
- 3 processors Document AI em `projeto-codex-br` (Invoice, Form, OCR genérico)

### 3.3 Service Accounts
- `queima-vertex@projeto-codex-br.iam.gserviceaccount.com` — admin Vertex/DocAI/Storage
- JSON key: `~/projeto-codex-br/queima-vertex.json` (criar via `gcloud iam service-accounts keys create` se ausente)

### 3.4 Catálogo de endpoints públicos (`engines/arsenal_apis.json`)
143 endpoints documentados: Câmara, Senado, TCU, CGU, PNCP, TSE, INLABS, Receita, IBGE, Base dos Dados, DATASUS, SIOP/SIAFI, etc. Todos públicos, sem autenticação proprietária.
