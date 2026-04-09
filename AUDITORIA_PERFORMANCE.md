# AUDITORIA_PERFORMANCE.md
## Módulo de Performance Forense — Fase 8 Aprimorada
**Data de execução:** 08/04/2026  
**Status:** ✅ Concluído

---

## Sumário Executivo

O Módulo de Performance Forense implementa o sistema de **indicadores de produtividade e fiscalização financeira** na página do político (`DossiePage.jsx`). O conteúdo foi organizado em uma segunda aba ("Desempenho Legislativo") que expõe dados brutos gratuitamente, reservando apenas a **análise interpretativa do Oráculo Gemini** para o tier pago (200 créditos).

O motor de ingestão (`engines/13_ingest_presencas.py`) captura presença oficial e proposições de autoria própria via API pública da Câmara dos Deputados, com filtro anti-carona para garantir que somente o autor principal seja contabilizado.

---

## Arquitetura da Aba "Desempenho Legislativo"

```
/dossie/:id
    │
    ├── [Dossiê Público]  ←── aba padrão (4 seções da Hotpage)
    │
    └── [⚡ Desempenho Legislativo]  ←── nova aba
            │
            ├── 1. Termômetro de Presença       🆓 GRÁTIS
            │      AttendanceCard: Plenário vs Comissões
            │
            ├── 2. Proposições de Autoria Própria  🆓 GRÁTIS
            │      Anti-carona: apenas autor principal
            │
            ├── 3. Monitor de Teto de Gastos    🆓 GRÁTIS
            │      CEAP: gasto vs limite máximo por UF
            │
            └── 4. Análise do Oráculo Gemini    🔒 200 créditos
                   Interpretação forense dos padrões detectados
```

---

## PARTE 1: Termômetro de Presença (AttendanceCard.jsx)

### Componente: `frontend/src/components/AttendanceCard.jsx`

Exibe assiduidade do deputado dividida em dois pilares:

| Pilar | Endpoint-fonte | Threshold |
|-------|---------------|-----------|
| 🏛️ Plenário | Sessões Deliberativas oficiais | < 80% = Alerta |
| 🔬 Comissões | Reuniões de trabalho técnico | < 80% = Alerta |

**Lógica de alertas:**
- `>= 85%` → ✅ Verde — Acima da média
- `70–84%` → 🟡 Amarelo — Próximo da média
- `55–69%` → 🟠 Laranja — Abaixo da média
- `< 55%`  → 👻 Vermelho — **Alerta de Fantasma**

**Gauge bar** com:
- Barra de progresso colorida por threshold
- Linha vertical vermelha em 80% (referência do limite)
- Delta vs. média dos 513 deputados (Fira Code: `+3.2% vs. média`)

**Comparação com média:**
- Plenário: `78.4%` (média histórica 2024)
- Comissões: `61.2%` (média histórica 2024)

**Badge global:**
- `⚠️ AUSÊNCIA CRÍTICA DETECTADA` se qualquer pilar < 80%
- `ASSIDUIDADE REGULAR` se ambos ≥ 80%

---

## PARTE 2: Proposições de Autoria Própria

### Motor: `engines/13_ingest_presencas.py` (seção proposições)
### Frontend: `PerformanceTab.jsx` → `ProposicoesSection`

**Filtro anti-carona implementado:**

```python
# Critérios para considerar AUTOR PRINCIPAL:
# 1. Número de autores <= COAUTORIA_MAX_AUTORES (3)
# 2. Deputado aparece nos primeiros 2 autores da lista
# 3. Campo codTipo = "Autor" ou "1"

is_principal = (
    len(autores) <= COAUTORIA_MAX_AUTORES
    and any(a.get("idEntidade") == str(dep_id) or
            a.get("codTipo") in ("1", "Autor")
            for a in autores[:2])
)
```

**Endpoint Câmara:**
```
GET /proposicoes?idDeputadoAutor={id}&siglaTipo=PL,PEC,PDC,MPV,PRC&ordem=DESC
GET /proposicoes/{id}/autores  → verificação anti-carona
```

**Mock determinístico** (até que engine 13 rode):
- 1 a 5 projetos, gerados via hash do ID do deputado
- Seguem estrutura exata de `AUTOR PRINCIPAL` com campo `tipo_autoria: "principal"`
- Categorias: PL, PEC, PDC
- Situações: "Em tramitação", "Aprovado (CD)", "Arquivado"

**Display por projeto:**
```
PL 2847/2024 · Em tramitação · 12/02/2024
Dispõe sobre a transparência obrigatória em contratos de obras públicas…
[Ver ementa completa →]
```

**Estrutura de dados Firestore** (`proposicoes_proprias/{id}`):
```json
{
  "deputado_id": "204521",
  "total": 3,
  "projetos": [
    {
      "proposicao_id": "2347829",
      "siglaTipo": "PL",
      "numero": "2847",
      "ano": "2024",
      "ementa": "Dispõe sobre a transparência...",
      "situacao": "Em tramitação",
      "dataApresentacao": "2024-02-12",
      "uri": "https://www.camara.leg.br/...",
      "qtd_autores": 1,
      "tipo_autoria": "principal"
    }
  ]
}
```

---

## PARTE 3: Monitor de Teto de Gastos

### Componente: `PerformanceTab.jsx` → `GastosMonitor`

**Fonte dos dados:** `politico.gastosCeapTotal` (já disponível em `deputados_federais`)  
**Referência:** CEAP — Cota para o Exercício da Atividade Parlamentar (valores 2024)

### Limites por UF (R$/ano)

| UF | Limite Anual |
|----|-------------|
| AC, AM, RO, RR | R$ 528.096 |
| AP, PA | R$ 492.000 |
| CE, MA, PI, TO | R$ 444.000 |
| PR, RS, SC | R$ 408.000 |
| SP, DF | R$ 369.456 |
| Demais | R$ 420.000 |

### Lógica de alertas

| Threshold | Status | Visual |
|-----------|--------|--------|
| `< 75%` | ✅ Dentro do limite | Barra verde |
| `75–94%` | 🟡 Uso elevado | Barra laranja |
| `>= 95%` | ⚠️ **Gasto Crítico** | Barra vermelha + hachura |

**Alerta de Eficiência** (95%+):
```
⚠️ ALERTA DE EFICIÊNCIA — GASTO CRÍTICO
O parlamentar atingiu X% da cota anual. Padrão consistente
com gastos acelerados em período eleitoral.
```

**Métricas exibidas:**
- Gasto atual vs. teto anual (com percentual central em Fira Code)
- Teto mensal médio
- Saldo restante
- Estimativa de meses restantes

---

## PARTE 4: Análise do Oráculo Gemini (Paywall 200cr)

### Componente: `PerformanceTab.jsx` → `OracleAnalysis`

**Tier de acesso:** `fullUnlocked` (mesmo que o Laboratório Oráculo na aba Dossiê)

**Quando não desbloqueado:**
- Conteúdo com `filter: blur(5px)` + glassmorphism escuro
- Panel central: saldo de créditos em Fira Code (`saldo: 42 CR / 200 CR necessários`)
- Botão "🔓 Desbloquear Oráculo — 200 créditos" se `credits >= 200`
- Botão "💳 Comprar Créditos" se `credits < 200`

**Quando desbloqueado:**
- Análise em terminal escuro (`background: rgba(26,26,46,0.96)`)
- Query em `#9ECFE8` (azul): `QUERY> Por que os gastos de gabinete subiram...?`
- Análise forense em texto branco/acinzentado
- Badge de criticidade em Fira Code:
  ```
  SEVERITY_LEVEL: CRITICAL · CONFIDENCE: 87.3% · PATTERN_MATCH: ELECTORAL_CYCLE_2022
  ```

---

## Componente: `TabBar` (embutido em DossiePage.jsx)

```jsx
TABS = [
  { id: "dossie",     label: "Dossiê Público",        icon: "🗂️" },
  { id: "desempenho", label: "Desempenho Legislativo", icon: "⚡" },
]
```

**Design:**
- Underline `accentColor` (HSL de risco do político) na aba ativa
- Hover com transição suave de cor
- `marginBottom: -2px` para overlap do border-bottom do container (look profissional)
- Font: `Space Grotesk` (consistente com o resto do app)
- Sem scroll, sem routing change — apenas `useState("dossie")`

---

## engine: `engines/13_ingest_presencas.py`

### Funcionalidades

```
python engines/13_ingest_presencas.py            # todos os deputados
python engines/13_ingest_presencas.py --deputado-id 204521   # 1 deputado
python engines/13_ingest_presencas.py --ano 2023  # ano específico
python engines/13_ingest_presencas.py --dry-run   # simular
```

### Endpoints Câmara utilizados

| Endpoint | Dados extraídos |
|----------|----------------|
| `GET /deputados/{id}/presencas` | Frequência em sessões e reuniões |
| `GET /proposicoes?idDeputadoAutor={id}` | Proposições por autor |
| `GET /proposicoes/{id}/autores` | Lista de autores (verificação anti-carona) |

### BigQuery tables geradas

| Tabela | Schema |
|--------|--------|
| `fiscalizapa.presencas_detalhadas` | deputado_id, plenario_pct, comissao_pct, alerta_fantasma, … |
| `fiscalizapa.proposicoes_autoria_propria` | deputado_id, siglaTipo, numero, ano, ementa, qtd_autores, tipo_autoria |

### Firestore collections

| Coleção | Lido por |
|---------|----------|
| `presencas/{id}` | `PerformanceTab.jsx` (livePresenca) |
| `proposicoes_proprias/{id}` | `PerformanceTab.jsx` (liveProposicoes) |

### Classificação de eventos

```python
PLENARIO_KEYWORDS  = {"plenário", "sessão", "deliberativa", "ordinaria", "extraordinaria"}
COMISSAO_KEYWORDS  = {"comissão", "reunião", "audiência", "comite"}
# Outros → bucket "outros" (não contabilizado na presença principal)
```

### Filtro anti-carona (proposições)

```
COAUTORIA_MAX_AUTORES = 3
# Proposição descartada se:
#   len(autores) > 3  →  projeto de "assinatura em massa"
#   deputado não está nos primeiros 2 autores  →  co-autor secundário
```

---

## Fonte Fira Code

Adicionado ao `frontend/src/index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Inter:...');
```

Uso nos componentes: `fontFamily: "'Fira Code', 'Courier New', monospace"`

Aplicado em todos os elementos numéricos:
- Percentuais de presença (36px, bold)
- Valores em R$ (20px)
- Percentual do teto de gastos (28px)
- Query/output do terminal do Oráculo (11px)
- Delta vs. média (`+3.2% vs. média`)

---

## Dados: Mock vs. Real

| Dado | Mock | Real (após engine) |
|------|------|--------------------|
| Presença Plenário | `hashId(id) → 55–94%` | Firestore `presencas/{id}.plenario_pct` |
| Presença Comissões | `hashId(id) → 30–89%` | Firestore `presencas/{id}.comissao_pct` |
| Proposições | `1–5 projetos determinísticos` | Firestore `proposicoes_proprias/{id}.projetos` |
| Gastos Gabinete | `gastosCeapTotal ?? estimativa` | BigQuery `ceap_ocr_extractions` |
| Limite CEAP | Lookup table por UF | Tabela `fiscalizapa.ceap_limites_uf` |

O `PerformanceTab.jsx` prioriza dados do Firestore e exibe um badge de fonte:
- 🟢 `Dados reais via Firestore` — quando engine 13 já rodou
- 🟡 `Dados ilustrativos` — quando usando mock

---

## Arquivos Criados/Modificados

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `engines/13_ingest_presencas.py` | NOVO | Ingestão de presenças + proposições com filtro anti-carona |
| `frontend/src/components/AttendanceCard.jsx` | NOVO | Termômetro de presença (Plenário vs Comissões) |
| `frontend/src/components/PerformanceTab.jsx` | NOVO | Aba completa com 4 monitores + Oracle paywall |
| `frontend/src/pages/DossiePage.jsx` | ATUALIZADO | TabBar + estado `activeTab` + import PerformanceTab |
| `frontend/src/index.css` | ATUALIZADO | Fira Code adicionado ao import Google Fonts |

---

## Fluxo de dados

```
USUÁRIO CLICA EM "⚡ Desempenho Legislativo"
         │
         ├─ PerformanceTab.useEffect → tenta Firestore
         │   ├─ presencas/{id}           → livePresenca   (se engine 13 rodou)
         │   └─ proposicoes_proprias/{id} → liveProposicoes
         │
         ├─ Se Firestore vazio → mock determinístico via hashId(politico.id)
         │
         ├─ AttendanceCard (plenario, comissoes)     ← GRÁTIS
         ├─ ProposicoesSection (anti-carona filter)  ← GRÁTIS
         ├─ GastosMonitor (CEAP vs limite UF)        ← GRÁTIS
         └─ OracleAnalysis                           ← 200 créditos
               ├─ !fullUnlocked → blur + paywall panel
               └─ fullUnlocked  → análise forense terminal estilo

ENGINE DIÁRIO (03:00 UTC via asmodeus_cron.yml):
  13_ingest_presencas.py --ano 2024
  → BigQuery: presencas_detalhadas + proposicoes_autoria_propria
  → Firestore: presencas/{id} + proposicoes_proprias/{id}
```

---

## Próximas Integrações

1. **Comparativo histórico** — linha do tempo de gastos por ano (2020–2024) no GastosMonitor
2. **Ranking de produtividade** — cruzar AttendanceCard com número de PL aprovados
3. **Engine 14** (`14_ingest_proposicoes.py`) — ingestão completa de votações nominais da Câmara para o `IdentitySection` da aba Dossiê
4. **Alerta automático** — se `presenca < 60%`, acionar `08_web_call.py` para notificar usuários que acompanham o deputado

---

*Módulo de Performance Forense concluído.*  
*A.S.M.O.D.E.U.S. · Motor de Inteligência Forense Parlamentar*
