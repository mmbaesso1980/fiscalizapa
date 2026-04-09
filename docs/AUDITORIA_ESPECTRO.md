# AUDITORIA_ESPECTRO.md
## Módulo E.S.P.E.C.T.R.O. — Análise Ideológica e Bússola Política
### Posicionamento Científico de Parlamentares no Espectro Político

**Data de execução:** 2026-04-09
**Fase:** 11 — Módulo E.S.P.E.C.T.R.O.
**Status:** ✅ Implementado

> **E.S.P.E.C.T.R.O.** = *Escala de Posicionamento Estocástico e Classificação Técnica de Representantes e Orientações*

---

## 1. Sumário Executivo

O Módulo E.S.P.E.C.T.R.O. implementa a camada de análise ideológica do A.S.M.O.D.E.U.S. com **rigor científico e transparência metodológica total**. Diferentemente de sistemas subjetivos de classificação política, o ESPECTRO deriva o posicionamento de cada parlamentar **exclusivamente de seus atos públicos verificáveis**: como votou, o que propôs, como gastou a verba de gabinete, e com quem se aliou em plenário.

O módulo entrega:

1. **Spectrum Analyzer** (`24_spectrum_analyzer.py`) — Engine de análise multidimensional do posicionamento político baseado em votações nominais da Câmara
2. **Alliance Scanner** (`25_alliance_scanner.py`) — Mapeador de coalizões: quem vota com quem sistematicamente
3. **PoliticalCompass.jsx** — Bússola política interativa 2D (eixo econômico × eixo social)
4. **EspectroPage.jsx** — Página pública `/espectro` com filtros, comparador e metodologia inline

---

## 2. Metodologia Científica

### 2.1 — Eixos do Espectro

O ESPECTRO usa dois eixos independentes, inspirados no modelo Political Compass com adaptações para a realidade legislativa brasileira:

```
EIXO 1 — ECONÔMICO (0-100)
  0  = Estatizante extremo
       (defende monopólios estatais, planificação centralizada)
  50 = Centro econômico
       (mix regulado de mercado + estado)
  100 = Liberal extremo
       (defende privatizações totais, desregulamentação)

EIXO 2 — SOCIAL/CULTURAL (0-100)
  0  = Conservador extremo
       (opõe-se a direitos civis ampliados, defende tradição)
  50 = Centro social
  100 = Progressista extremo
       (apoia ampliação de direitos, pluralismo)
```

### 2.2 — Fontes de Dados e Pesos

| Fonte | Peso | Motivo |
|-------|------|--------|
| Votações nominais (Câmara API) | 50% | Ato mais objetivo: sim/não/abstenção |
| Proposições de autoria | 25% | Agenda legislativa declarada |
| Discursos plenário (palavras-chave) | 15% | Sinalização retórica |
| Histórico de emendas destinadas | 10% | Preferência por áreas de política pública |

### 2.3 — Algoritmo de Pontuação

**Para o Eixo Econômico:**
```python
VOTOS_LIBERAIS = [
    "privatização", "concessão", "reforma_trabalhista",
    "teto_de_gastos", "autonomia_bc", "reducao_impostos_pj"
]
VOTOS_ESTATIZANTES = [
    "reestatizacao", "ampliacao_funcionalismo", "revogacao_reforma_trabalhista",
    "controle_precos", "fundo_publico_saude_educacao"
]

score_eco = (votos_liberais / total_votos_eco) * 100
# Normalizado pelo número de votações disponíveis no período
```

**Para o Eixo Social:**
```python
VOTOS_PROGRESSISTAS = [
    "criminalizacao_homofobia", "descriminalizacao_aborto",
    "estatuto_igualdade_racial", "reducao_maioridade_nao",
    "direitos_indigenas", "cotas_ampliacao"
]
VOTOS_CONSERVADORES = [
    "estatuto_familia_conservador", "escola_sem_partido",
    "reducao_maioridade_sim", "contra_cotas",
    "armas_ampliacao", "contra_religioes_africanas"
]

score_social = (votos_progressistas / total_votos_soc) * 100
```

**Confiabilidade do score (ICS — Índice de Confiança do Score):**
```
ICS = min(votos_analisados / 50, 1.0) * 100

ICS ≥ 80 → Score "Alta confiança" (≥ 40 votações analisadas)
ICS 50-79 → "Confiança média" (25–39 votações)
ICS < 50 → "Dados insuficientes" (exibido com cautela)
```

### 2.4 — Tratamento de Ausências e Abstenções

- **Ausência justificada (missão):** não contada no denominador
- **Ausência injustificada:** conta como abstenção (peso 0.3 no score)
- **Abstenção explícita:** peso 0.5 (parlamentar optou por não se posicionar)
- **Obstrução:** tratada como ausência para fins de score

---

## 3. Arquitetura

```
MÓDULO E.S.P.E.C.T.R.O. — Pipeline
═══════════════════════════════════════════════════════════════════

  [Câmara API /votacoes]  [Câmara API /proposicoes]  [DOU discursos]
          ↓                         ↓                       ↓
  engines/24_spectrum_analyzer.py
    → ingestão de votações nominais (últimos 2 anos legislativos)
    → classifica cada votação em dimensões eco/social (NLP + keyword)
    → calcula score_eco e score_social por parlamentar
    → calcula ICS (Índice de Confiança do Score)
    → salva: Firestore[espectro_scores] + BQ[political_spectrum]
          ↓
  engines/25_alliance_scanner.py
    → lê votações → matriz de co-votação por pares de parlamentares
    → clustering (k-means, k=8) por similaridade de voto
    → identifica "bancadas reais" (vs. oficiais) com cohesion score
    → salva: Firestore[voting_clusters] + BQ[alliance_map]
          ↓
  frontend: PoliticalCompass.jsx
    ← lê: Firestore[espectro_scores] + Firestore[voting_clusters]
    → scatter plot 2D interativo (eixo eco × eixo social)
    → pontos coloridos por partido, tamanho por ICS
    → hover: mini-card com nome, partido, top 3 votações decisivas
    → filtros: partido, UF, mandato, ano
    → quadrantes: Liberal-Progressista / Liberal-Conservador /
                  Estatizante-Progressista / Estatizante-Conservador
          ↓
  frontend: EspectroPage.jsx (rota /espectro)
    → bússola principal + painel de detalhe lateral
    → comparador de 2 parlamentares (scores sobrepostos)
    → ranking por eixo (top 10 mais liberal, top 10 mais conservador)
    → link para dossiê completo de cada ponto
```

---

## 4. Arquivos Criados / Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `engines/24_spectrum_analyzer.py` | **NOVO** | Análise do espectro econômico/social por votação |
| `engines/25_alliance_scanner.py` | **NOVO** | Mapeador de coalizões e bancadas reais |
| `frontend/src/components/PoliticalCompass.jsx` | **NOVO** | Bússola política 2D interativa |
| `frontend/src/pages/EspectroPage.jsx` | **NOVO** | Página /espectro com comparador |
| `frontend/src/pages/DossiePage.jsx` | **ATUALIZADO** | + mini-bússola na aba "Análise" |
| `frontend/src/App.jsx` | **ATUALIZADO** | Rota `/espectro` adicionada |

> **Nota de numeração:** engines 22–23 ocupados pelo Projeto IRONMAN. Este módulo usa 24 e 25.

---

## 5. Detalhamento por Parte

### PARTE 1 — `engines/24_spectrum_analyzer.py`

**Fluxo de processamento por parlamentar:**

```
1. GET /camara/v2/deputados/{id}/votacoes?dataInicio=2024-01-01&itens=200
   → lista de votações em que o parlamentar participou

2. Para cada votação:
   GET /camara/v2/votacoes/{idVotacao}
   → objeto: { titulo, ementa, tipoVotacao, proposicao }

3. classify_vote(ementa, proposicao_tema):
   → NLP lightweight (TF-IDF sobre keywords predefinidas)
   → retorna: { dimensao: "ECO"|"SOC"|"AMBAS"|"NEUTRA", direcao: +1|-1|0 }

4. Agregar:
   score_eco  = mean([voto.direcao for voto in votos if voto.dimensao in ["ECO","AMBAS"]])
   score_soc  = mean([voto.direcao for voto in votos if voto.dimensao in ["SOC","AMBAS"]])
   # normalizar para 0-100

5. Calcular ICS e salvar em Firestore + BQ
```

**Schema BigQuery: `fiscalizapa.political_spectrum`**
```sql
parlamentar_id    STRING        -- ID Câmara
parlamentar_nome  STRING
partido           STRING
uf                STRING
score_economico   FLOAT64       -- 0 (estatizante) a 100 (liberal)
score_social      FLOAT64       -- 0 (conservador) a 100 (progressista)
ics               FLOAT64       -- Índice de Confiança do Score (0-100)
total_votos       INT64         -- Votações analisadas
votos_eco         INT64         -- Votações classificadas eixo econômico
votos_soc         INT64         -- Votações classificadas eixo social
quadrante         STRING        -- "LIB_PROG"|"LIB_CONS"|"EST_PROG"|"EST_CONS"
periodo_analise   STRING        -- "2024-2026"
atualizadoEm      TIMESTAMP
```

**Uso CLI:**
```bash
# Analisar todos os deputados (atualização completa)
python engines/24_spectrum_analyzer.py

# Analisar deputado específico
python engines/24_spectrum_analyzer.py --dep-id 204521

# Analisar partido inteiro
python engines/24_spectrum_analyzer.py --partido PT

# Dry-run (sem salvar)
python engines/24_spectrum_analyzer.py --dry-run

# Forçar re-análise dos últimos 30 dias de votações
python engines/24_spectrum_analyzer.py --since 2026-03-09
```

---

### PARTE 2 — `engines/25_alliance_scanner.py`

**Construção da matriz de co-votação:**

```python
# Para cada par de deputados (i, j):
agreement_rate(i, j) = votos_iguais(i, j) / votos_ambos_presentes(i, j)

# Matriz N×N onde N = número de deputados ativos (~513)
# Sparse (apenas pares com ≥ 20 votações em comum armazenados)
```

**Clustering em bancadas reais (k-means, k=8):**

| Cluster esperado | Descrição |
|-----------------|-----------|
| Centrão fiscal | Partidos que votam juntos em matérias econômicas independente de ideologia declarada |
| Bancada Evangélica | Coesão em pautas morais/culturais, cruzando partidos |
| Oposição consistente | Vota contra governo independente da pauta |
| Base governista fiel | Vota com o governo em > 85% dos casos |
| Bancada Ruralista | Coesão em agronegócio, ambiente, fundiário |
| Progressistas urbanos | Coesão em pautas sociais, direitos civis |
| Regionalistas | Vota por interesse de UF específica |
| Independentes | Baixa coesão com qualquer cluster |

**Cohesion Score por cluster:**
```
cohesion(cluster) = mean(agreement_rate(i,j)) for all pairs i,j in cluster
1.0 = votam sempre juntos | 0.0 = votam sempre opostos
```

**Schema Firestore: `voting_clusters/{cluster_id}`**
```json
{
  "cluster_id":      "cluster_bancada_evangelica_2026",
  "nome_sugerido":   "Bancada Evangélica",
  "cohesion_score":  0.84,
  "membros":         ["dep:123", "dep:456", "dep:789"],
  "qtd_membros":     67,
  "partidos_mix":    { "PL": 18, "PP": 12, "PRD": 9, "outros": 28 },
  "temas_coesos":    ["reducao_maioridade", "escola_sem_partido", "familia_conservador"],
  "periodo":         "2024-2026",
  "atualizadoEm":    "Timestamp"
}
```

---

### PARTE 3 — `PoliticalCompass.jsx`

**Layout da bússola (canvas SVG responsivo):**

```
                    PROGRESSISTA (100)
                          │
           EST-PROG        │        LIB-PROG
           ● ●             │             ● ●
         ●●   ●     ●      │      ●    ●●  ●●
ESTATIZANTE ──────────────┼────────────────── LIBERAL
(0)          ●  ●●   ●    │    ● ●●  ●          (100)
                    ●     │   ●
           EST-CONS        │        LIB-CONS
                           │
                    CONSERVADOR (0)
```

**Interatividade:**

| Interação | Comportamento |
|-----------|--------------|
| Hover no ponto | Mini-card: foto, nome, partido, UF, scores, ICS |
| Click no ponto | Painel lateral com top-5 votações mais definidoras |
| Click no mini-card | Navega para `/politico/deputados/{id}` (dossiê completo) |
| Filtro partido | Exibe apenas pontos do partido selecionado |
| Filtro UF | Filtra por estado |
| Zoom scroll | Zoom in/out na área do gráfico |
| Drag | Pan no gráfico |
| Botão "Comparar" | Seleciona 2 parlamentares para overlay |

**Codificação visual:**

| Elemento | Significado |
|----------|------------|
| Cor do ponto | Partido político (paleta de 15 partidos principais) |
| Tamanho do ponto | ICS — confiança do score (maior = mais dados) |
| Borda pulsante | Parlamentar com alerta N5 ativo |
| Ponto transparente | ICS < 50 (dados insuficientes — exibido com aviso) |
| Estrela ★ | Parlamentar em destaque (ex: presidentes de comissão) |

**Quadrantes com nomes intuitivos:**

```jsx
const QUADRANTES = {
  LIB_PROG:  { label: "Liberal Progressista",    cor: "#6366f1", x: "direita",  y: "cima"  },
  LIB_CONS:  { label: "Liberal Conservador",     cor: "#f59e0b", x: "direita",  y: "baixo" },
  EST_PROG:  { label: "Estatizante Progressista", cor: "#10b981", x: "esquerda", y: "cima"  },
  EST_CONS:  { label: "Estatizante Conservador",  cor: "#ef4444", x: "esquerda", y: "baixo" },
};
```

---

### PARTE 4 — `EspectroPage.jsx` (Rota `/espectro`)

**4 seções da página:**

**Seção 1 — A Bússola (acima da dobra)**
```
┌──────────────────────────────────────────────────────────────┐
│  ESPECTRO POLÍTICO BRASILEIRO            [Filtros ▾]         │
│  513 deputados · Dados: jan/2024 – abr/2026                  │
│                                                              │
│  [                    PoliticalCompass                    ]  │
│  [              (scatter plot 2D interativo)              ]  │
│                                                              │
│  [ Liberal-Progressista: 127 ]  [ Liberal-Conservador: 198 ]│
│  [ Estat.-Progressista:   89 ]  [ Estat.-Conservador:   99 ]│
└──────────────────────────────────────────────────────────────┘
```

**Seção 2 — Comparador de Parlamentares**
```
┌──────────────────────────────────────────────────────────────┐
│  COMPARAR PARLAMENTARES                                      │
│  ┌────────────┐           ┌────────────┐                     │
│  │ [Buscar 1] │    VS     │ [Buscar 2] │                     │
│  │ João Silva │           │ Maria Lima │                     │
│  │ PT-SP      │           │ PL-RJ      │                     │
│  │ Eco:  28   │◄─────────►│ Eco:  78   │                     │
│  │ Social: 81 │           │ Social: 22 │                     │
│  └────────────┘           └────────────┘                     │
│  Concordância em votações: 23%  ·  Votaram juntos: 47x       │
└──────────────────────────────────────────────────────────────┘
```

**Seção 3 — Rankings por Eixo**
```
Top 5 mais LIBERAL (econômico):      Top 5 mais ESTATIZANTE:
  1. Nome A (PL-SP)  ████████ 94        1. Nome F (PSOL-RJ) ██ 8
  2. Nome B (PP-MG)  ███████  91        2. Nome G (PT-BA)   ██ 11
  ...                                   ...
```

**Seção 4 — Bancadas Reais (Clusters)**
```
BANCADAS IDENTIFICADAS POR PADRÃO DE VOTO
  🔵 Centrão Fiscal           · 89 dep. · Coesão: 0.79
  ✝️  Bancada Evangélica      · 67 dep. · Coesão: 0.84
  🌱 Ruralistas               · 72 dep. · Coesão: 0.81
  ...
```

---

## 6. Mini-Bússola no Dossiê (`DossiePage.jsx`)

Na aba "Análise" de cada dossiê de parlamentar, é adicionado um **widget compacto** mostrando:

```
POSICIONAMENTO POLÍTICO
──────────────────────────────────────
   Econômico:  ●──────────────────  72  Liberal
   Social:     ──────────────●────  38  Moderado Conservador
   Confiança:  ████████░░ 81%  (ICS)
   Quadrante:  Liberal Conservador
──────────────────────────────────────
Baseado em 94 votações nominais (jan/2024–abr/2026)
[Ver na bússola completa →]
```

Aparece **somente** se ICS ≥ 30 (dados mínimos suficientes). Abaixo disso, exibe:
```
⚠️ Dados insuficientes para posicionamento no espectro
   (menos de 15 votações analisadas neste período)
```

---

## 7. Transparência Metodológica e Limites

### 7.1 — O que o ESPECTRO mede (e o que não mede)

| ✅ Mede | ❌ Não mede |
|---------|-----------|
| Comportamento legislativo real | Intenção ou valores pessoais |
| Posicionamento em votações nominais | Convicções não expressas em voto |
| Consistência do voto com discurso | "Verdadeiro" posicionamento ideológico |
| Coalizões práticas de votação | Afiliação cultural ou religiosa pessoal |

### 7.2 — Limitações conhecidas

1. **Mandato de liderança:** alguns votos seguem orientação de bancada, não convicção pessoal
2. **Matérias sem divisão ideológica clara:** votações consensuais (≥ 90% favoráveis) são excluídas da análise
3. **Parlamentares com < 2 anos de mandato:** ICS naturalmente baixo, exibido com caveat
4. **Mudança de partido:** scores são recalculados por período, não assumem posição do partido novo

### 7.3 — Aviso exibido em destaque na EspectroPage

```
ℹ️ O ESPECTRO analisa comportamento legislativo verificável, não ideologia declarada.
   Um score não é um julgamento de valor — é um espelho de votos públicos.
   Metodologia completa e votações fonte disponíveis para download.
```

---

## 8. Integração no CI/CD (`asmodeus_cron.yml`)

```yaml
# ENGINE 24 — Spectrum Analyzer (semanal, segunda-feira 03h)
- name: "🧭 ENGINE 24 — Spectrum Analyzer (Atualização Semanal)"
  run: |
    python ${{ env.ENGINES_DIR }}/24_spectrum_analyzer.py \
      --since $(date -d '8 days ago' +%Y-%m-%d) \
      ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true

# ENGINE 25 — Alliance Scanner (quinzenal)
- name: "🕸️ ENGINE 25 — Alliance Scanner (Bancadas Reais)"
  run: |
    python ${{ env.ENGINES_DIR }}/25_alliance_scanner.py \
      ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true
  # Rodar apenas nos dias 1 e 15 de cada mês:
  if: ${{ github.event.schedule == '0 4 1,15 * *' }}
```

---

## 9. Dependências

```bash
# Python
pip install scikit-learn numpy pandas firebase-admin google-cloud-bigquery

# JavaScript (frontend)
# Nenhuma nova dependência
# PoliticalCompass usa SVG puro + React hooks (sem D3 ou Recharts)
# Mantém bundle lean
```

---

## 10. Próximas Integrações

| Tarefa | Prioridade | Benefício |
|--------|-----------|-----------|
| Análise de discursos via Gemini (NLP avançado) | Alta | Score social mais preciso |
| Histórico temporal (scores por ano de mandato) | Alta | Ver evolução do posicionamento |
| Comparação com declaração do partido (TSE) | Média | Detectar divergência partido/parlamentar |
| Export de dataset completo (CSV open data) | Média | Transparência + usos acadêmicos |
| Integração com Senado Federal | Média | Cobertura do Legislativo completo |
| Scores para vereadores (dados câmaras municipais) | Baixa | Escala subnacional |
| API pública `/api/espectro/{dep_id}` | Baixa | Integração por terceiros |

---

## 11. Verificação

```bash
# Testar Spectrum Analyzer em modo mock
python engines/24_spectrum_analyzer.py --mock --dry-run

# Testar Alliance Scanner em modo mock
python engines/25_alliance_scanner.py --mock --dry-run

# Build do frontend
cd frontend && npm run build
# Navegar para: http://localhost:5173/espectro
```

---

*Gerado por A.S.M.O.D.E.U.S. — Módulo E.S.P.E.C.T.R.O. (Fase 11)*
*"Para entender o poder, observe não o que ele diz — observe como ele vota."*
