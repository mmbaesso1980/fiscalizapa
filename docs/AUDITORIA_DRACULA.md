# AUDITORIA_DRACULA.md
## Operação D.R.A.C.U.L.A. + Protocolo A.F.R.O.D.I.T.E.
### Detecção de Redes em Saúde e Redesign Estético Global

**Data de execução:** 2026-04-08  
**Fase:** 10 — Operação D.R.A.C.U.L.A. integrada ao Protocolo A.F.R.O.D.I.T.E.  
**Status:** ✅ Implementado

---

## 1. Sumário Executivo

A Operação D.R.A.C.U.L.A. transforma o A.S.M.O.D.E.U.S. no auditor mais especializado do setor de saúde pública brasileira. O sistema agora é capaz de:

1. **Mapear toda a rede de entidades de saúde** com contratos públicos via CNAEs específicos
2. **Detectar laboratórios fantasmas** — que recebem milhões sem licença ANVISA ou estrutura compatível
3. **Auditar contratos de OSS** com Gemini, identificando cláusulas de baixa accountability
4. **Visualizar o fluxo financeiro** Estado → OSS → Destinos finais (incluindo suspeitos) em Sankey SVG
5. **Exibir um Mapa de Corrupção em Saúde** com modal AFRODITE por hospital

O Protocolo A.F.R.O.D.I.T.E. redesenha a estética global com identidade visual impactante: **Verde Médico (#00f5d4)** para transparência e **Carmesim Pulsante (#ff0054)** para anomalias.

---

## 2. Arquitetura

```
OPERAÇÃO D.R.A.C.U.L.A. — Pipeline
═══════════════════════════════════════════════════════════════════

  [BQ contratos_publicos]  [Diários Oficiais]  [ANVISA DATAVISA]
          ↓                        ↓                    ↓
  engines/17_health_scanner.py
    → filtra 16 CNAEs de saúde
    → agrega por CNPJ (valor total + contratos)
    → verifica ANVISA via API pública
    → detecta "Laboratório Fantasma" (score 0-100)
    → salva: Firestore[alertas_saude] + BQ[health_anomalies]
          ↓
  engines/18_oss_scanner.py
    → identifica contratos de gestão com OSS
    → análise Gemini de cláusulas suspeitas
    → calcula Índice de Corrupção da OSS (0-100)
    → salva: Firestore[oss_contratos] + BQ[oss_anomalias]
          ↓
  frontend: SankeyChart.jsx
    → visualização SVG pura do fluxo financeiro
    → Verde Médico = fluxos regulares
    → Carmesim = fluxos suspeitos
    → tooltips interativos com valores
          ↓
  frontend: HealthMap.jsx (rota /saude)
    → tile grid dos 27 estados colorido por índice de saúde
    → painel lateral com unidades suspeitas por estado
    → Modal AFRODITE: equipamentos / alertas / fluxo
          ↓
  frontend: index.css + Layout.jsx
    → Protocolo A.F.R.O.D.I.T.E. — redesign global
    → 5 orbs com parallax e nova paleta de cores
    → classes glassmorphism 25px (.glass, .glass-dark, .glass-medical, .glass-alert)
```

---

## 3. Arquivos Criados / Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `engines/17_health_scanner.py` | **NOVO** | Scanner de saúde: CNAE + ANVISA + Lab Fantasma |
| `engines/18_oss_scanner.py` | **NOVO** | Scanner de OSS + análise Gemini de contratos |
| `frontend/src/components/SankeyChart.jsx` | **NOVO** | Visualização SVG de fluxo financeiro |
| `frontend/src/pages/HealthMap.jsx` | **NOVO** | Mapa de calor + modal AFRODITE |
| `frontend/src/App.jsx` | **ATUALIZADO** | Rota `/saude` adicionada |
| `frontend/src/index.css` | **ATUALIZADO** | Paleta AFRODITE + glass 25px + animações |
| `frontend/src/components/Layout.jsx` | **ATUALIZADO** | 5 orbs DRACULA/AFRODITE + parallax |

> **Nota de numeração:** `engines/15` e `engines/16` já ocupados pelo Protocolo Sangue e Poder. Este protocolo usa 17 e 18.

---

## 4. Detalhamento por Parte

### PARTE 1 — `engines/17_health_scanner.py` (Mapeamento de Saúde)

**16 CNAEs de saúde cobertos:**
```
8610-1/01 · Hospital (geral)        8640-2/01 · Lab. anatomia patológica
8610-1/02 · Pronto-socorro          8640-2/02 · Laboratório clínico  ← foco
8621-6/01 · UTI Móvel               8640-2/03 · Diálise / Nefrologia
8621-6/02 · Urgência móvel          8640-2/99 · Diagnóstico complementar
8630-5/01 · Ambulatório c/ cirurgia 8650-0/01 · Fisioterapia
8630-5/02 · Ambulatório c/ exames   8650-0/99 · Outros serviços humanos
8630-5/03 · Consultório médico      8630-5/06 · Vacinação / Imunização
8630-5/08 · Terapia ocupacional     8711-5/02 · Clínica de repouso
```

**Algoritmo de detecção de Laboratório Fantasma:**
```
Bandeiras (cumulativas):
  🚩 +30pts → Recebe > R$ 1M em contratos públicos
  🚩 +40pts → SEM autorização ANVISA ativa (DATAVISA)
  🚩 +25pts → Porte ME/EPP com contratos de alto volume
  🚩 +20pts → Empresa aberta < 1 ano antes do 1º contrato

Threshold: 2+ bandeiras E score ≥ 50 → gera alerta
Criticidade:
  score ≥ 85 → NIVEL_5
  score ≥ 65 → ALTA
  score ≥ 50 → MEDIA
```

**ANVISA API:**
- Endpoint: `https://consultas.anvisa.gov.br/api/consulta/empresas?cnpj={cnpj}`
- Dados: situação da autorização, tipo (AFE/AFT), validade, número
- Fallback: análise heurística por dígitos do CNPJ (modo demo)
- Em produção: substituir fallback por scraper certificado DATAVISA

---

### PARTE 2 — `engines/18_oss_scanner.py` (OSS + Gemini)

**Identificação de OSS:**
- Keywords: "organização social", "contrato de gestão", "entidade privada sem fins lucrativos"
- Filtra contratos com esses termos no objeto ou razão social

**6 Padrões de Cláusulas Suspeitas (regex local + Gemini):**
```
1. repasse_emergencial  (+35pts) → "repasse emergencial sem procedimento"
2. prestacao_fraca      (+30pts) → "prestação de contas simplificada"
3. subcontratacao_livre (+25pts) → "subcontratação livremente"
4. reajuste_automatico  (+20pts) → "reajuste automático sem justificativa"
5. sem_devolucao        (+25pts) → "saldo não obrigatoriamente revertido"
6. meta_vaga            (+20pts) → "metas a definir" / "indicadores a combinar"
```

**Análise Gemini:**
- Prompt especializado em direito público e contratos OSS
- Retorna: nivel_risco, clausulas_encontradas, resumo_forense, recomendacoes
- Fallback local: análise regex se GEMINI_API_KEY não definida

**Índice de Corrupção da OSS (0-100):**
- Ponderação: Gemini crítico (+40) + cada cláusula (+8) + bandeiras locais
- Exibido no Modal AFRODITE e na hotpage do político gestor

---

### PARTE 3 — `SankeyChart.jsx` (Visualização de Fluxo)

**Layout em 3 colunas (puro SVG, zero dependências externas):**
```
[GOVERNO/ESTADO] ──► [OSS] ──► [Laboratórios / Hospitais / Subcontratados]
```

**Implementação:**
- `computeLayout()`: calcula posições dos nós e paths Bézier cúbicos
- Largura dos links proporcional ao valor financeiro (escala log)
- Cores: `#00f5d4` fluxo regular, `#ff0054` fluxo suspeito
- Glow filter SVG para links suspeitos (`feGaussianBlur`)
- Hover interativo: tooltip com valor e status
- Resumo automático: total rastreado, % suspeito, destinos suspeitos

**Dados mock (caso "Marquinho Boi" + OSS):**
- Estado SP → Instituto Saúde Plena (R$ 45M) → 4 destinos (2 suspeitos)
- Mun. Rio → Fundação Vida (R$ 28M) → 2 destinos (1 suspeito)
- Total suspeito: ~R$ 10M (13.3% do fluxo rastreado)

---

### PARTE 4 — `HealthMap.jsx` + Modal AFRODITE

**Mapa de calor (rota `/saude`):**
- Mesmo tile grid de 27 estados do `BrazilHeatmap`
- Coloração baseada em Índice de Corrupção em Saúde (0-100):
  - 0-19: Verde escuro (limpo)
  - 20-44: Verde médico (baixo risco)  
  - 45-69: Laranja (moderado)
  - 70+:   Carmesim pulsante (crítico)
- Badge `●N` nos tiles com unidades suspeitas

**Painel lateral (ao selecionar estado):**
- Lista de unidades de saúde suspeitas
- Índice OSS colorido por severidade
- Botão "→ Abrir dossiê AFRODITE"

**Modal AFRODITE (ao clicar na unidade):**
3 abas:
1. **🔧 Equipamentos** — tabela equipamentos comprados vs. verificados, divergências, "economia fantasma" calculada
2. **⚠️ Alertas** — alertas dos motores 17 e 18, score por alerta
3. **💸 Fluxo Financeiro** — SankeyChart inline com dados do contrato OSS

**KPIs rápidos do modal:**
- Índice de Corrupção OSS (colorido)
- Economia Fantasma em reais
- Tempo médio de espera (urgência + consulta)

---

## 5. Protocolo A.F.R.O.D.I.T.E. — Redesign Visual

### Novas variáveis CSS:
```css
--afrodite-clean:        #00f5d4  /* Verde Médico — dados limpos */
--afrodite-clean-glow:   rgba(0,245,212,0.25)
--dracula-red:           #ff0054  /* Carmesim Pulsante — anomalias */
--dracula-red-glow:      rgba(255,0,84,0.35)
--dracula-bg:            #0a0a1e  /* Fundo escuro DRACULA */
--dracula-card:          rgba(15,15,35,0.75)
```

### Glassmorphism atualizado (blur: 12px → **25px**):
```css
.glass        → backdrop-filter: blur(25px) saturate(180%) — páginas claras
.glass-dark   → backdrop-filter: blur(25px) saturate(140%) — DRACULA
.glass-medical→ Verde Médico + border clean
.glass-alert  → Carmesim + glow dracula
```

### Animações novas:
- `draculaPulse` — labels críticos e tiles de alto risco
- `cleanGlow` — badges de dados verificados
- `afroditeFadeIn` — entrada do modal AFRODITE
- `blinkCursor` — `.fira-typing` para displays Fira Code

### Layout.jsx — 5 Orbs DRACULA/AFRODITE:
| Orb | Cor | Posição | Blend |
|-----|-----|---------|-------|
| 1 | Âmbar (#FBD87F) | Superior esq. | multiply, 22% |
| 2 | Verde Médico (#00f5d4) | Superior dir. | multiply, 12% |
| 3 | Carmesim (#ff0054) | Meio esq. | multiply, 7% |
| 4 | Índigo (#6366f1) | Centro-baixo | multiply, 10% |
| 5 | Violeta (#7c3aed) | Rodapé dir. | multiply, 9% |

Todos com `blur(70-90px)` e parallax individual (taxas: 0.07, -0.06, 0.09, -0.04, 0.05).

---

## 6. Caso de Uso Detalhado

### Detectando "Hospital Estadual X" — OSS Instituto Saúde Plena

```
1. engine 17 filtra CNPJ 55667788000120 (CNAE 8610-1/01):
   → valor_total: R$ 45M · num_contratos: 3
   → ANVISA check: ativo (AFE válida) → sem alerta fantasma
   → Salva como entidade auditada em alertas_saude

2. engine 18 analisa contrato de gestão:
   Texto: "Cláusula 8ª — prestação de contas simplificada...
           Cláusula 12ª — subcontratação de serviços diagnósticos livremente...
           Cláusula 21ª — repasses emergenciais dispensados de licitação..."

   → Bandeiras locais: prestacao_fraca, subcontratacao_livre, repasse_emergencial
   → Score local: 90pts → Gemini: CRÍTICO
   → Índice de Corrupção: 78/100
   → Salva em oss_contratos + alertas_bodes (NIVEL_5)

3. HealthMap.jsx:
   → SP tile: score=74 → carmesim pulsante
   → Painel lateral: "Hospital Estadual A — OSS Instituto Saúde Plena"
   
4. Modal AFRODITE:
   → Aba Equipamentos: 1 tomógrafo pago não encontrado (R$ 1.15M fantasma)
   → Aba Alertas: 2 alertas ativos (EQUIPAMENTO_FANTASMA + OSS_BAIXA_ACCOUNTABILITY)
   → Aba Fluxo: Sankey mostrando R$ 2.4M → Silva Segurança (irmão do parlamentar)
```

---

## 7. Integração no CI/CD

Adicionar ao `asmodeus_cron.yml`:
```yaml
# ENGINE 17 — Health Scanner (2x por semana)
- name: "🏥 ENGINE 17 — Health Scanner (DRACULA)"
  run: |
    python ${{ env.ENGINES_DIR }}/17_health_scanner.py \
      --mock ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true

# ENGINE 18 — OSS Scanner (diário)
- name: "🔬 ENGINE 18 — OSS Scanner (Gemini)"
  run: |
    python ${{ env.ENGINES_DIR }}/18_oss_scanner.py \
      --mock ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true
```

---

## 8. Dependências

```bash
# Python
pip install firebase-admin google-cloud-bigquery google-generativeai

# JavaScript
# Nenhuma nova dependência — SankeyChart é SVG puro
# HealthMap usa firebase (já instalado)
```

---

## 9. Próximas Integrações

| Tarefa | Prioridade | Benefício |
|--------|-----------|-----------|
| Scraper DATAVISA certificado para ANVISA real | Alta | Eliminar mock na detecção |
| Integração com CNES (Cadastro Nacional de Estabelecimentos de Saúde) | Alta | Cruzar equipamentos declarados vs. comprados |
| Busca de prestações de contas no Portal TCE/TCU | Alta | Auditar relatórios OSS automaticamente |
| react-simple-maps para HealthMap georreferenciado | Média | Mapa real vs. tile grid |
| Alerta por email quando Índice OSS > 70 | Média | Notificação proativa |
| Integração SankeyChart com dados reais do BigQuery | Média | Substituir mock estático |

---

## 10. Verificação

```bash
# Testar engines em modo mock
python engines/17_health_scanner.py --mock --dry-run
python engines/18_oss_scanner.py --mock --dry-run

# Verificar rota frontend
# Navegar para: http://localhost:5173/saude
```

---

*Gerado por A.S.M.O.D.E.U.S. — Operação D.R.A.C.U.L.A. + Protocolo A.F.R.O.D.I.T.E. (Fase 10)*  
*"Onde o dinheiro público some, a A.F.R.O.D.I.T.E. ilumina."*
