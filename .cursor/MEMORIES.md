# 🧠 MEMORIES — Agente Autônomo G.O.A.T. | TransparênciaBR / FiscalizaPA
> Arquivo de memória persistente do agente. Atualizar ao fim de cada operação.
> Localização canônica: `.cursor/MEMORIES.md`
> Última atualização: 2026-04-27

---

## 📋 AUDITORIA_DRACULA.md
### Operação D.R.A.C.U.L.A. + Protocolo A.F.R.O.D.I.T.E.
**Detecção de Redes em Saúde e Redesign Estético Global**
- Data de execução: 2026-04-08
- Fase: 10 — Operação D.R.A.C.U.L.A. integrada ao Protocolo A.F.R.O.D.I.T.E.
- Status: ✅ Implementado

### 1. Sumário Executivo
A Operação D.R.A.C.U.L.A. transforma o A.S.M.O.D.E.U.S. no auditor especializado do setor de saúde pública brasileira. O sistema é capaz de:
- Mapear toda a rede de entidades de saúde com contratos públicos via 16 CNAEs específicos
- Detectar **laboratórios fantasmas** — recebem milhões sem licença ANVISA ou estrutura compatível
- Auditar contratos de OSS com Gemini, identificando cláusulas de baixa accountability
- Visualizar fluxo financeiro Estado → OSS → Destinos finais em Sankey SVG
- Exibir Mapa de Corrupção em Saúde com modal AFRODITE por hospital

O **Protocolo A.F.R.O.D.I.T.E.** redesenha a estética global: `Verde Médico (#00f5d4)` para transparência e `Carmesim Pulsante (#ff0054)` para anomalias.

### 2. Arquivos Criados / Modificados
| Arquivo | Tipo | Descrição |
|---|---|---|
| `engines/17_health_scanner.py` | NOVO | Scanner saúde: CNAE + ANVISA + Lab Fantasma |
| `engines/18_oss_scanner.py` | NOVO | Scanner OSS + análise Gemini de contratos |
| `frontend/src/components/SankeyChart.jsx` | NOVO | Visualização SVG de fluxo financeiro |
| `frontend/src/pages/HealthMap.jsx` | NOVO | Mapa de calor + modal AFRODITE (rota `/saude`) |
| `frontend/src/App.jsx` | ATUALIZADO | Rota `/saude` adicionada |
| `frontend/src/index.css` | ATUALIZADO | Paleta AFRODITE + glass 25px + animações |
| `frontend/src/components/Layout.jsx` | ATUALIZADO | 5 orbs DRACULA/AFRODITE + parallax |

> **Nota de numeração:** engines/15 e engines/16 = Protocolo Sangue e Poder. Este protocolo usa 17 e 18.

### 3. CNAEs de Saúde Cobertos (16)
```
8610-1/01 · Hospital (geral)        8640-2/01 · Lab. anatomia patológica
8610-1/02 · Pronto-socorro          8640-2/02 · Laboratório clínico
8621-6/01 · UTI Móvel               8640-2/03 · Diálise / Nefrologia
8621-6/02 · Urgência móvel          8640-2/99 · Diagnóstico complementar
8630-5/01 · Ambulatório c/ cirurgia 8650-0/01 · Fisioterapia
8630-5/02 · Ambulatório c/ exames   8650-0/99 · Outros serviços humanos
8630-5/03 · Consultório médico      8630-5/06 · Vacinação / Imunização
8630-5/08 · Terapia ocupacional     8711-5/02 · Clínica de repouso
```

### 4. Algoritmo Laboratório Fantasma (engine 17)
```
🚩 +30pts → Recebe > R$ 1M em contratos públicos
🚩 +40pts → SEM autorização ANVISA ativa (DATAVISA)
🚩 +25pts → Porte ME/EPP com contratos de alto volume
🚩 +20pts → Empresa aberta < 1 ano antes do 1º contrato

Threshold: 2+ bandeiras E score ≥ 50 → gera alerta
score ≥ 85 → NIVEL_5 | score ≥ 65 → ALTA | score ≥ 50 → MEDIA
```
ANVISA API: `https://consultas.anvisa.gov.br/api/consulta/empresas?cnpj={cnpj}`

### 5. Padrões OSS Suspeitos (engine 18)
```
1. repasse_emergencial  (+35pts)
2. prestacao_fraca      (+30pts)
3. subcontratacao_livre (+25pts)
4. reajuste_automatico  (+20pts)
5. sem_devolucao        (+25pts)
6. meta_vaga            (+20pts)
```

### 6. Protocolo A.F.R.O.D.I.T.E. — CSS Variables
```css
--afrodite-clean:      #00f5d4   /* Verde Médico */
--dracula-red:         #ff0054   /* Carmesim Pulsante */
--dracula-bg:          #0a0a1e   /* Fundo escuro */
--dracula-card:        rgba(15,15,35,0.75)
/* .glass → blur(25px) | .glass-medical → verde | .glass-alert → carmesim */
```
Animações: `draculaPulse`, `cleanGlow`, `afroditeFadeIn`, `blinkCursor`

### 7. CI/CD — Adicionar ao `asmodeus_cron.yml`
```yaml
- name: "🏥 ENGINE 17 — Health Scanner (DRACULA)"
  run: python ${{ env.ENGINES_DIR }}/17_health_scanner.py --mock ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true

- name: "🔬 ENGINE 18 — OSS Scanner (Gemini)"
  run: python ${{ env.ENGINES_DIR }}/18_oss_scanner.py --mock ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true
```

### 8. Próximas Integrações (D.R.A.C.U.L.A.)
| Tarefa | Prioridade |
|---|---|
| Scraper DATAVISA certificado para ANVISA real | Alta |
| Integração com CNES (equipamentos declarados vs. comprados) | Alta |
| Prestações de contas Portal TCE/TCU para OSS | Alta |
| react-simple-maps para HealthMap georreferenciado | Média |
| Alerta por email quando Índice OSS > 70 | Média |
| SankeyChart com dados reais do BigQuery | Média |

---

## 🏛️ CONTEXTO DO PROJETO

### Identidade
- **Nome:** TransparênciaBR / FiscalizaPA
- **Repositório:** `mmbaesso1980/fiscalizapa`
- **Missão:** Plataforma de transparência política brasileira — rastreamento de emendas parlamentares, gastos CEAP, votações nominais e auditorias forenses de nepotismo/superfaturamento
- **Motor de scoring:** Protocolo A.S.M.O.D.E.U.S. (Automação de Sistemas de Monitoramento e Detecção de Esquemas no Uso de Subsídios)

### Stack Atual
```
Frontend:    React + Vite (artefatos em frontend/dist/)
Hosting:     Firebase Hosting (target: fiscallizapa)
Backend/DB:  Firebase Firestore + Cloud Functions (GCP)
Data WH:     BigQuery (codex-br/projeto-codex-br)
CI/CD:       GitHub Actions (mmbaesso1980/fiscalizapa)
Mapa:        MapLibre GL JS (migrado do Leaflet)
UI:          Tailwind CSS, Cabinet Grotesk + Satoshi, glassmorphism
Auth:        Firebase Authentication
Engines:     Python scripts (engines/01–18)
```

### O Que Já Existe
- Rankings Top 10 / Bottom 10 (Câmara)
- Páginas de dossiê por parlamentar
- Seção de emendas PIX (parcial)
- Login funcionando
- Galaxy3D (visualização de nós 3D)
- Motor Asmodeus (calculateAsmodeusScore em Cloud Functions)
- CEAP / gastos nota a nota
- Protocolo Sangue e Poder (engines 15 e 16)
- Operação D.R.A.C.U.L.A. (engines 17 e 18) ✅ IMPLEMENTADO

---

## 🗄️ ARQUITETURA DE DADOS

### BigQuery
- Projeto: `codex-br` / Dataset: `projeto-codex-br`
- Tabelas particionadas por data (DATE(data_emissao)) + clusterizadas
- Clusterização em `ceap_despesas`: `parlamentar_id`, `uf_fornecedor`, `cnpj_fornecedor`
- Modelos BQML: ARIMA_PLUS (anomalias temporais) + KMEANS (fornecedores suspeitos)
- Lei de Benford implementada em SQL puro via CTEs

### Firestore Collections
| Coleção | Chave | Descrição |
|---|---|---|
| `parlamentares` | `String(idDeputado)` ou `"SEN-{codigo}"` | Perfil completo desnormalizado |
| `emendas_pix` | `nrEmenda` | Emendas Transferências Especiais (RP99) |
| `alertas_bodes` | auto | Resultados consolidados dos motores forenses |
| `alertas_saude` | auto | Alertas da Operação D.R.A.C.U.L.A. (engine 17) |
| `oss_contratos` | auto | Contratos OSS analisados (engine 18) |
| `usuarios` | `UID Firebase` | Permissões + saldo de créditos |
| `diarios_atos` | auto | Textos extraídos de Diários Oficiais |
| `denuncias` | auto | Denúncias de cidadãos (status: PENDENTE) |

### Esquema Canônico de Parlamentar
```javascript
{
  id: String,           // idDeputado ou "SEN-{codigo}"
  casa: 'CAMARA'|'SENADO',
  nome: String,
  slug: String,         // ex: "nikolas-ferreira"
  siglaPartido: String,
  uf: String,
  fotoUrl: String,
  scoreAsmodeus: Number|null,
  flags: String[],
  _atualizadoEm: Timestamp
}
```

---

## 🔬 MOTORES FORENSES (engines/)

| # | Nome | Descrição | Status |
|---|---|---|---|
| 01–06 | ETL Base | Ingestão parlamentares, CEAP, emendas PIX/RP6 | ✅ |
| 07 | gemini_translator | Circuit Breaker + análise Gemini de documentos | ✅ |
| 08–10 | Análise CEAP | Lei de Benford, padrões de fraude | ✅ |
| 11–12 | Votações | Módulo E.S.P.E.C.T.R.O., alinhamento partidário | ✅ |
| 13–14 | Protocolo F.L.A.V.I.O. | Rachadinhas, funcionários fantasmas | ✅ |
| 15–16 | Sangue e Poder | Nepotismo, cruzamento familiar + QSA | ✅ |
| **17** | **health_scanner** | **D.R.A.C.U.L.A.: CNAE saúde + ANVISA + Lab Fantasma** | **✅** |
| **18** | **oss_scanner** | **D.R.A.C.U.L.A.: OSS + Gemini + Índice Corrupção** | **✅** |

---

## ⚙️ BUGS CONHECIDOS / PENDENTES

| Bug | Prioridade | Status |
|---|---|---|
| "Politician not found" em dossiês (ex: Kim Kataguiri) | CRÍTICA | 🔴 Pendente |
| Scores Asmodeus defaultando para 100 após ETL | CRÍTICA | 🔴 Pendente |
| SEO zero — mesma meta tag genérica em todas as páginas | ALTA | 🟠 Pendente |
| Apenas Emendas PIX cobertas — faltam RP6, RP7, RP8 | ALTA | 🟠 Pendente |
| Senadores sem cobertura completa | ALTA | 🟠 Pendente |
| Sem agenda do dia (Câmara e Senado) | MÉDIA | 🟡 Pendente |
| Build com erros de auth Firebase no deploy | ALTA | 🟠 Pendente |

**Fix do bug "Politician not found":**
```javascript
const isNumeric = /^\d+$/.test(param)
const docRef = isNumeric
  ? db.collection('parlamentares').doc(param)
  : db.collection('parlamentares').where('slug', '==', param).limit(1)
```

**Fix do bug Asmodeus score 100:**
```javascript
// Substituir: valor ?? 100  →  valor ?? 0
// Substituir: valor || 100  →  valor || 0
```

---

## 💰 MODELO DE MONETIZAÇÃO

- **Freemium com créditos:** visão geral pública gratuita
- **Paywall glassmorphism** para: Laboratório Oráculo, Módulo 4 (grafos 3D), PDF gerado por IA
- **Conversão:** "200 créditos" em vez de valor monetário (reduz pain of paying)
- **Cotas diárias:** `dossies_gratuitos_restantes` renovados via Cloud Scheduler CRON
- **Pagamento:** Stripe → Firebase Webhooks → runTransaction atômica no Firestore

---

## 🔐 SEGURANÇA (Projeto I.R.O.N.M.A.N.)

- **LGPD Shield:** SHA-256 anonimização de PII encontrada nos crawlers (CPFs, emails de civis)
- **Security Rules:** `isValidCreditDeduction()` — créditos só decrementam, nunca incrementam pelo cliente
- **Kill Switch:** painel admin para imobilizar motores em caso de falsos positivos em massa
- **Neutralidade:** Índice de Cobertura Proporcional (ICP) + Coeficiente de Gini por partido para monitorar viés algorítmico

---

## 🚀 PRÓXIMAS FASES (Ordem de Prioridade)

### FASE 1 — Correções Críticas
1. Corrigir "Politician not found" (slug lookup + migração Firestore)
2. Corrigir scores Asmodeus defaultando para 100
3. Esquema canônico de Parlamentar (`src/types/parlamentar.js`)

### FASE 2 — SEO e Performance
1. react-helmet-async: meta tags únicas por parlamentar
2. MapLibre GL JS (já migrado — validar 60fps mobile)
3. Lazy loading + bundle < 200KB gzipped

### FASE 3 — Novas Funcionalidades
1. ETL Emendas RP6 (`scripts/ingest-emendas-rp6.js`)
2. Cobertura completa de Senadores
3. Componente AgendaDoDia (Câmara + Senado, refresh 5min)
4. Hotpage com 5 tabs: Emendas | Cota | Votações | Agenda | Alertas Asmodeus

### FASE 4 — Qualidade e Deploy
1. `.env.example` documentado
2. GitHub Actions CI/CD completo
3. Checklist de qualidade (10 critérios de pronto)

---

## 📏 REGRAS DO AGENTE

1. **Nunca quebrar o deploy** — reverter imediatamente se build falhar
2. **Preservar o que funciona:** Galaxy3D, login, rankings
3. **Commit atômico por tarefa** com mensagem convencional: `fix:`, `feat:`, `perf:`, `seo:`, `chore:`
4. **Dado ausente = null/loading** — nunca placeholder inventado
5. **Variável de ambiente faltando** → documentar, pular a tarefa, continuar as demais
6. **Ordem de prioridade absoluta:** Fase 0 (auditoria) → 1 → 2 → 3 → 4
7. **Relatar ao fim de cada fase:** ✅ Feito | ⚠️ Parcial | 🔴 Bloqueio | ⏭️ Próximo
8. **Engines D.R.A.C.U.L.A.** (17 e 18): rodar com `--mock --dry-run` para validação
9. **Antes de qualquer mudança:** verificar se arquivo já existe no repo para não sobrescrever

---

## 🔑 VARIÁVEIS DE AMBIENTE NECESSÁRIAS

```bash
# Firebase
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=fiscallizapa.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=fiscallizapa
VITE_FIREBASE_STORAGE_BUCKET=fiscallizapa.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID   # número 12 dígitos, NÃO email
VITE_FIREBASE_APP_ID               # formato: 1:123456789:web:abc123
VITE_FIREBASE_MEASUREMENT_ID       # formato: G-XXXXXXXXXX

# APIs Governamentais
PORTAL_API_KEY          # portaldatransparencia.gov.br/api-de-dados
GEMINI_API_KEY          # para engines 07, 18

# GCP (scripts backend)
GOOGLE_CLOUD_PROJECT=codex-br
BIGQUERY_DATASET=projeto_codex_br
```

---

## 📡 APIS GOVERNAMENTAIS INTEGRADAS

| API | URL Base | Uso |
|---|---|---|
| Câmara dos Deputados | `https://dadosabertos.camara.leg.br/api/v2` | Parlamentares, votações, eventos |
| Senado Federal | `https://legis.senado.leg.br/dadosabertos` | Senadores, agenda, votações |
| Portal Transparência | `https://api.portaldatransparencia.gov.br/api-de-dados` | Contratos, CEAP, emendas RP6 |
| Transferegov | `https://api.transferegov.gestao.gov.br` | Emendas PIX (RP99) |
| ANVISA DATAVISA | `https://consultas.anvisa.gov.br/api/consulta/empresas` | Autorização sanitária |
| Receita Federal (QSA) | via API pública | Quadro de Sócios (Sangue e Poder) |

---
*Gerado automaticamente pela Perplexity AI em 2026-04-27. Atualizar manualmente ao fim de cada operação.*
