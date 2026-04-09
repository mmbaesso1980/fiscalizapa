# AUDITORIA_SANGUE.md
## Protocolo "Sangue e Poder" — Rastreamento de Parentesco e Contratos
**Data de execução:** 2026-04-08  
**Fase:** 9 — Protocolo Sangue e Poder  
**Status:** ✅ Implementado

---

## 1. Sumário Executivo

O Protocolo Sangue e Poder implementa a camada mais profunda de rastreamento forense do A.S.M.O.D.E.U.S.: o cruzamento entre a **vida privada do político** (rede familiar, empresas de parentes) e sua **vida pública** (atos oficiais, contratos). O sistema é agora capaz de detectar o caso paradigmático — "Marquinho Boi" — onde a empresa de um irmão do parlamentar vence contratos públicos no estado onde ele tem influência.

---

## 2. Arquitetura Implementada

```
SANGUE E PODER — Fluxo de Dados
═══════════════════════════════════════════════════════════════════

   [TSE API] + [Câmara API]
        ↓
   engines/15_family_oracle.py
        → extrai: cônjuge, filhos, irmãos, pais (nomes públicos)
        → busca CNPJs de empresas onde familiares são sócios
        → salva em: Firestore[usuarios_relacionados/{dep_id}]
        ↓
   engines/16_contract_collision.py
        → lê: Firestore[usuarios_relacionados] + BQ[contratos_publicos]
        → busca QSA de cada CNPJ via Receita Federal (BrasilAPI)
        → normaliza nomes + fuzzy match (Jaccard ≥ 0.80)
        → MATCH? → gera Alerta NÍVEL 5 (score 60-100)
        → salva em: Firestore[alertas_bodes] + BQ[alertas_corrupcao_provavel]
        ↓
   frontend/src/components/PoliticalTimeline.jsx
        ← lê: Firestore[diarios_atos] (10_universal_crawler.py)
        → linha do tempo vertical com filtros de sentimento
        → exibido na DossiePage (Seção 3B — GRÁTIS)
        ↓
   frontend/src/components/BrazilHeatmap.jsx (atualizado)
        ← lê: prop criticalUFs={Set<string>}
        → estados com N5 pulsam em ROXO (#7c3aed) com animação CSS
        ↓
   frontend/src/pages/DossiePage.jsx (atualizado)
        → banner de Alerta N5 no topo (se nivel5Alertas.length > 0)
        → PoliticalTimeline na Seção 3B
        → DossiePDFContent: seção "Nexo de Causalidade e Parentesco"
```

---

## 3. Arquivos Criados / Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `engines/15_family_oracle.py` | **NOVO** | Rastreador de genealogia via TSE + Câmara |
| `engines/16_contract_collision.py` | **NOVO** | Scanner de conflito de interesses |
| `frontend/src/components/PoliticalTimeline.jsx` | **NOVO** | Linha do tempo de atos oficiais |
| `frontend/src/components/BrazilHeatmap.jsx` | **ATUALIZADO** | Pulso roxo para estados com N5 |
| `frontend/src/pages/DossiePage.jsx` | **ATUALIZADO** | Banner N5 + Timeline + Nexo no PDF |
| `frontend/src/index.css` | **ATUALIZADO** | Animações `nivel5Pulse`, `nivel5Banner` |

> **Nota de numeração:** `engines/13` já ocupado por `13_ingest_presencas.py` (Fase 8). Os engines desta fase usam 15 e 16. A ausência de um `14_` é intencional — estava reservado na AUDITORIA_PERFORMANCE para integração futura com BQ de proposições.

---

## 4. Detalhamento por Parte

### PARTE 1 — O Rastreador de Genealogia (`15_family_oracle.py`)

**Fontes de dados (todas públicas):**
- **API Câmara** (`/deputados/{id}`) → nome civil, partido, UF
- **API TSE** (`/candidatos/{ano}/{uf}/candidatos`) → cônjuge, pai, mãe (campos diretos)
- **Bens declarados TSE** → análise de texto para inferir filhos e outros parentes
- **Receita Federal / BrasilAPI** (`/cnpj/v1/{cnpj}`) → QSA das empresas de familiares

**Estrutura da rede familiar salva no Firestore (`usuarios_relacionados/{dep_id}`):**
```json
{
  "parlamentar_id": "204521",
  "parlamentar_nome": "João Silva",
  "uf": "SP",
  "membros": [
    {
      "nome": "Marcos Silva",
      "relacao": "irmao",
      "cnpjs": ["98765432000145"],
      "empresas": [{
        "cnpj": "98.765.432/0001-45",
        "razaoSocial": "Silva Segurança e Vigilância Ltda",
        "atividade": "Atividades de vigilância e segurança privada",
        "uf": "SP"
      }],
      "fonte": "tse_bens"
    }
  ],
  "total_empresas": 3
}
```

**Nota LGPD:** O motor opera **exclusivamente com dados divulgados voluntariamente** pelos próprios políticos ao TSE durante candidaturas ou em funções públicas. Nenhum CPF de terceiros é armazenado — apenas nomes e CNPJs públicos.

**Modo mock (`--mock`):** Demonstra o caso "Marquinho Boi" com 3 familiares fictícios (cônjuge, irmão, filho) e 4 empresas nas áreas de segurança, consultoria e eventos.

---

### PARTE 2 — O Scanner de Conflito (`16_contract_collision.py`)

**Algoritmo central:**

```
Para cada CONTRATO em BQ[contratos_publicos]:
  cnpj = contrato.cnpj
  qsa  = GET /cnpj/{cnpj} via BrasilAPI
  Para cada SÓCIO em qsa:
    Para cada PARLAMENTAR em Firestore[usuarios_relacionados]:
      Para cada FAMILIAR do parlamentar:
        if name_similarity(familiar.nome, socio.nome) >= 0.80:
          score = PESO_POR_RELACAO[familiar.relacao]
          if parlamentar.uf == contrato.uf: score += 5
          → ALERTA NÍVEL 5 gerado
```

**Pesos de suspeição:**
| Relação | Score |
|---------|-------|
| Cônjuge | 95/100 |
| Filho/Filha | 90/100 |
| Irmão/Irmã | 85/100 ← caso "Marquinho Boi" |
| Pai/Mãe | 80/100 |
| Outro | 60/100 |

**Normalização de nomes:** Remoção de acentos + lowercase + similaridade de Jaccard (≥ 2 palavras em comum com comprimento total ≥ 8 chars).

**Saída — Alerta Nível 5:**
```json
{
  "criticidade": "NIVEL_5",
  "nivel": 5,
  "tipoAlerta": "CONFLITO_INTERESSE_FAMILIAR",
  "parlamentar_nome": "João Silva",
  "socio_nome": "Marcos Silva",
  "relacao_familiar": "irmao",
  "empresa_nome": "Silva Segurança e Vigilância Ltda",
  "contrato_orgao": "Secretaria de Segurança Pública de SP",
  "valor_contrato": 2400000.00,
  "score_suspeicao": 90,
  "explicacao_oraculo": "Empresa de irmão do parlamentar venceu contrato..."
}
```

---

### PARTE 3 — Linha do Tempo (`PoliticalTimeline.jsx`)

**Classificação de sentimento (local, zero custo de API):**

| Tipo | Cor | Palavras-chave |
|------|-----|----------------|
| 🔵 Nomeação | Azul | nomeação, exoneração, cargo comissionado, designado |
| 🟡 Contrato | Âmbar | contrato, aditivo, dispensa, licitação, compra |
| 🔴 Processo | Vermelho | processo, inquérito, TCU, MPF, irregularidade |
| ⚪ Outros | Cinza | (tudo que não se enquadra) |

**Funcionalidades:**
- Filtros interativos (chips) com contador por categoria
- Pontos expansíveis ao clicar → mostra descrição completa + link
- Badge `🟢 Dados do crawler` vs `🟡 Dados ilustrativos`
- Fallback: 6 itens mock determinísticos se Firestore vazio
- Seção gratuita (GRÁTIS) na aba "Dossiê Público"
- Lê de `Firestore[diarios_atos]` (populada por `10_universal_crawler.py`)

---

### PARTE 4 — Visualização de Alerta Vermelho

**BrazilHeatmap.jsx — Pulso Roxo:**
- Nova prop: `criticalUFs` (aceita `Set<string>` ou `string[]`)
- Estado com N5: `background: #7c3aed`, animação `cellPulseNivel5` (1.4s, brilho)
- Tooltip expandido: mostra "⚠️ CORRUPÇÃO PROVÁVEL — Nível 5"
- Badge `N5` substitui o contador numérico na célula
- Legenda atualizada: inclui item "Corrupção Crítica (N5)" em roxo

**DossiePage.jsx — Banner de Alerta:**
- Aparece no topo da página se `nivel5Alertas.length > 0`
- Mostra empresa(s) envolvida(s) com valor do contrato
- Gradiente violeta/vermelho com borda animada
- Estado `nivel5Alertas` filtrado de `alertas_bodes` onde `criticidade === "NIVEL_5"`

**DossiePDFContent — Seção "Nexo de Causalidade e Parentesco":**
- Aparece no PDF apenas quando há alertas N5
- Tabela estruturada: Familiar, Relação, Empresa, CNPJ, Órgão, Objeto, Valor
- Inclui `explicacao_oraculo` do Gemini (se disponível)
- Aviso ético: "dados de fontes públicas, não constitui acusação formal"

---

## 5. Caso de Uso: Detecção do "Marquinho Boi"

Passo a passo de como o sistema detecta o caso paradigmático:

```
1. engine 15 executa para deputado_id=204521 (João Silva / SP):
   → TSE retorna: cônjuge=Maria Silva, pai=José Silva
   → Bens declarados mencionam "imóvel em condomínio com irmão Marcos Silva"
   → BrasilAPI CNPJ 98.765.432/0001-45 → QSA: Marcos Silva (sócio administrador)
   → Salva em Firestore[usuarios_relacionados/204521]

2. engine 16 executa (scan de contratos SP):
   → BQ retorna contrato CTR-2024-001:
     cnpj=98765432000145, razao_social="Silva Segurança e Vigilância Ltda", valor=2.4M, uf=SP
   → BrasilAPI QSA confirma: sócio "MARCOS SILVA"
   → name_similarity("Marcos Silva", "MARCOS SILVA") → True (exact after normalize)
   → relacao="irmao", score=85+5(geo_match)=90
   → ALERTA N5 criado → salvo em Firestore[alertas_bodes/abc123...]

3. DossiePage carrega:
   → nivel5Alertas = [{ empresa_nome: "Silva Segurança...", valor_contrato: 2.4M }]
   → Banner roxo aparece no topo da página
   → PDF inclui seção "Nexo de Causalidade e Parentesco"

4. MapaPage (BrazilHeatmap):
   → criticalUFs = new Set(["SP"])
   → Célula SP pulsa em roxo com ícone ⚠️
```

---

## 6. Integração com o Pipeline CI/CD

Para incluir no `asmodeus_cron.yml`:

```yaml
# ENGINE 15 — Family Oracle (semanal, não diário — pesado)
- name: "🧬 ENGINE 15 — Family Oracle (Genealogia)"
  run: |
    python ${{ env.ENGINES_DIR }}/15_family_oracle.py \
      --mock ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true

# ENGINE 16 — Contract Collision (diário)
- name: "💥 ENGINE 16 — Contract Collision (Cruzamento)"
  run: |
    python ${{ env.ENGINES_DIR }}/16_contract_collision.py \
      --mock-data ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true
```

---

## 7. Segurança e Ética

| Aspecto | Decisão |
|---------|---------|
| CPFs de terceiros | Nunca armazenados (LGPD compliance) |
| Fonte dos dados | 100% públicos (TSE, Câmara, Receita Federal) |
| Aviso legal no PDF | Incluído em todas as exportações |
| Score de suspeição | Apresentado como "probabilidade", não certeza |
| Alerta N5 | Requer verificação manual humana antes de publicação |

---

## 8. Próximas Integrações

| Tarefa | Prioridade | Engine |
|--------|-----------|--------|
| Integrar CSV mensal da Receita Federal para QSA completo | Alta | 15/16 |
| Webhook para jornalistas quando N5 é gerado | Alta | 08 |
| Base de dados de parentes via dados.gov.br (TSE declarações) | Média | 15 |
| Cruzamento com SIAPE (servidores públicos) | Média | Novo engine 17 |
| Timeline no relatório PDF (últimos 10 atos) | Baixa | DossiePage |

---

## 9. Dependências

```bash
# Python (engines)
pip install firebase-admin google-cloud-bigquery pandas pyarrow unicodedata

# JavaScript (frontend)
# Nenhuma nova dependência — apenas firebase (já instalado) e React hooks
```

---

## 10. Verificação de Saúde

```bash
# Testar Family Oracle em modo mock
python engines/15_family_oracle.py --dep-id 204521 --mock --dry-run

# Testar Collision Scanner com dados mock
python engines/16_contract_collision.py --mock-data --dry-run

# Build do frontend
cd frontend && npm run build
```

---

*Gerado por A.S.M.O.D.E.U.S. — Protocolo Sangue e Poder (Fase 9)*  
*"O poder que não se enxerga é o poder que não se audita."*
