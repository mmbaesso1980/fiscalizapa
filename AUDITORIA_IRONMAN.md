# AUDITORIA_IRONMAN.md
## Projeto I.R.O.N.M.A.N. — Blindagem, Compliance e Neutralidade
### Tornando o A.S.M.O.D.E.U.S. Processualmente Inatacável

**Data de execução:** 2026-04-09
**Fase:** 10 — Projeto I.R.O.N.M.A.N.
**Status:** ✅ Implementado

> **I.R.O.N.M.A.N.** = *Integridade, Rastreabilidade, Omissão-Zero, Neutralidade, Metodologia, Auditabilidade e Notificação*

---

## 1. Sumário Executivo

O Projeto I.R.O.N.M.A.N. resolve o maior risco estratégico do A.S.M.O.D.E.U.S.: **ser desacreditado por viés político ou atacado juridicamente antes de atingir escala**. Um sistema que audita o poder público precisa ser mais rigoroso do que o poder que audita.

Esta fase entrega quatro pilares:

1. **LGPD Shield** (`22_lgpd_shield.py`) — Scanner automático de conformidade com a Lei Geral de Proteção de Dados, detectando e redigindo PII indevido em todo o pipeline
2. **Neutrality Check** (`23_neutrality_check.py`) — Motor estatístico que monitora distribuição de alertas por partido/ideologia, detectando desvios sistemáticos de cobertura
3. **Compliance Panel** (`CompliancePanel.jsx`) — Painel administrativo em tempo real com status jurídico, métricas de neutralidade e trilha de auditoria
4. **Blindagem de Disclaimers** — Geração automática de avisos legais calibrados por nível de risco em dossiês e PDFs

---

## 2. Arquitetura

```
PROJETO I.R.O.N.M.A.N. — Camada de Blindagem
═══════════════════════════════════════════════════════════════════

  [Todo dado ingerido pelos engines 01–21]
          ↓
  engines/22_lgpd_shield.py
    → escaneia Firestore[alertas_bodes] + BQ[contratos_publicos]
    → detecta PII ilegal: CPF pessoal, telefone, endereço privado
    → gera relatório LGPD com classificação por risco
    → aplica redação automática (hash SHA-256 + mask)
    → salva: Firestore[compliance_log] + BQ[lgpd_audit]
          ↓
  engines/23_neutrality_check.py
    → lê: Firestore[alertas_bodes] (últimos 90 dias)
    → mapeia alertas × partido do parlamentar envolvido
    → calcula índice de Gini por partido (0 = perfeito, 1 = totalmenete enviesado)
    → detecta anomalia: partido com taxa > 2σ da média
    → salva: Firestore[neutrality_reports] + BQ[neutrality_audit]
          ↓
  frontend: CompliancePanel.jsx (rota /admin/compliance)
    ← lê: Firestore[compliance_log] + Firestore[neutrality_reports]
    → Status LGPD (semáforo), Índice de Gini, Cobertura por Partido
    → Trilha de Auditoria: quem acessou qual dossiê, quando
    → Download de Relatório de Conformidade (PDF)
          ↓
  DossiePage.jsx (atualizado)
    → Disclaimer dinâmico calibrado pelo nível de criticidade do dossiê
    → Aviso LGPD embutido no rodapé de cada PDF exportado
    → Referências às fontes primárias linkadas por claim
```

---

## 3. Arquivos Criados / Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `engines/22_lgpd_shield.py` | **NOVO** | Scanner LGPD + redação automática de PII |
| `engines/23_neutrality_check.py` | **NOVO** | Motor estatístico de neutralidade por partido |
| `frontend/src/components/CompliancePanel.jsx` | **NOVO** | Painel admin de compliance em tempo real |
| `frontend/src/pages/AdminDashboard.jsx` | **ATUALIZADO** | + aba "Compliance" com CompliancePanel |
| `frontend/src/pages/DossiePage.jsx` | **ATUALIZADO** | Disclaimer dinâmico + rodapé LGPD no PDF |
| `frontend/src/App.jsx` | **ATUALIZADO** | Rota `/admin/compliance` adicionada |

> **Nota de numeração:** engines 19–21 já ocupados por `19_api_sentinel.py`, `20_logistics_auditor.py` e `21_ghost_hunter.py`. Este protocolo usa 22 e 23.

---

## 4. Detalhamento por Parte

### PARTE 1 — `engines/22_lgpd_shield.py` (LGPD Shield)

**Categorias de PII monitoradas:**

| Categoria | Padrão Regex | Risco LGPD | Ação |
|-----------|-------------|------------|------|
| CPF pessoal (não público) | `\d{3}\.\d{3}\.\d{3}-\d{2}` | ALTO | Hash SHA-256 + log |
| Telefone pessoal | `\(?\d{2}\)?\s?\d{4,5}-\d{4}` | MÉDIO | Máscara `(**) *****-XXXX` |
| E-mail pessoal | `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` | MÉDIO | Máscara `u****@domínio` |
| Endereço residencial | keywords: `rua`, `av.`, `cep` + número | ALTO | Redação completa |
| Dado de saúde inferido | keywords: `diagnóstico`, `CID`, `hospital` em contexto pessoal | CRÍTICO | Bloqueio total |

**Exceções (dados publicados voluntariamente pelo político):**
- CNPJ de empresa declarada ao TSE → **não redige**
- Endereço de escritório político (gabinete) → **não redige**
- CPF em publicação oficial (Diário Oficial) → **não redige**

**Algoritmo de classificação:**
```python
def classify_pii_risk(field_name, value, context):
    # Dados de políticos em atos oficiais → PÚBLICO
    if context.source in ("diario_oficial", "tse_candidatura", "camara_api"):
        return PII_RISK.PUBLIC  # sem ação
    
    # CPF em campo de texto livre de contrato → verificar se é beneficiário público
    if re.match(CPF_PATTERN, value):
        if context.document_type == "contrato_publico":
            return PII_RISK.REVIEW  # marcar para revisão humana
        return PII_RISK.HIGH  # redigir automaticamente
    
    return PII_RISK.NONE
```

**Schema BigQuery: `fiscalizapa.lgpd_audit`**
```sql
scan_id          STRING       -- UUID da varredura
timestamp_scan   TIMESTAMP    -- Quando foi escaneado
engine_source    STRING       -- "22_lgpd_shield"
collection       STRING       -- Coleção Firestore ou tabela BQ scaneada
doc_id           STRING       -- ID do documento analisado
pii_type         STRING       -- "CPF", "PHONE", "EMAIL", "ADDRESS", "HEALTH"
risk_level       STRING       -- "CRITICO", "ALTO", "MEDIO", "BAIXO", "PUBLICO"
action_taken     STRING       -- "HASH", "MASK", "BLOCK", "NONE", "REVIEW"
field_path       STRING       -- Caminho do campo (ex: "alertas_bodes/X/descricao")
redacted         BOOL         -- True se valor foi modificado
```

**Modo de execução:**
```bash
# Varredura completa (todas as coleções)
python engines/22_lgpd_shield.py

# Varredura de coleção específica
python engines/22_lgpd_shield.py --collection alertas_bodes

# Modo dry-run (detecta, não corrige)
python engines/22_lgpd_shield.py --dry-run

# Relatório sem correção + export CSV
python engines/22_lgpd_shield.py --dry-run --report lgpd_report.csv
```

---

### PARTE 2 — `engines/23_neutrality_check.py` (Monitor de Neutralidade)

**Metodologia estatística:**

O motor calcula a distribuição de alertas críticos (NIVEL_4 + NIVEL_5) por partido político e verifica se algum partido está sendo sistematicamente **sobre ou sub-representado** nos alertas gerados.

**Índice de Cobertura Proporcional (ICP):**
```
ICP(partido) = (alertas_partido / total_alertas) / (parlamentares_partido / total_parlamentares)

ICP ≈ 1.0 → Cobertura proporcional (neutro)
ICP > 2.0 → Sobre-representado (possível viés contra o partido)
ICP < 0.5 → Sub-representado (possível proteção ao partido)
```

**Threshold de alerta de viés:**
- ICP > 2.5 por 30+ dias consecutivos → Alerta `VIES_COBERTURA_ALTO`
- ICP < 0.3 por 30+ dias consecutivos → Alerta `VIÉS_SUBCOBERTURA_ALTO`
- Desvio padrão do ICP entre partidos > 1.8 → Alerta `DISTRIBUICAO_ASSIMETRICA`

**Controle: por que isso não é censura**

O monitor não bloqueia alertas. Ele sinaliza padrões para revisão humana. A causa pode ser legítima (um partido controlando mais ministérios e portanto tendo mais contratos auditados). O relatório apresenta **hipóteses de explicação** antes de qualquer conclusão de viés.

**Schema Firestore: `neutrality_reports/{report_id}`**
```json
{
  "report_id":       "neut_20260409_060000",
  "periodo":         { "inicio": "2026-01-09", "fim": "2026-04-09" },
  "total_alertas":   847,
  "por_partido": [
    {
      "partido":             "PL",
      "parlamentares":       99,
      "alertas_criticos":    142,
      "icp":                 1.43,
      "status":              "PROPORCIONAL"
    },
    {
      "partido":             "PT",
      "parlamentares":       68,
      "alertas_criticos":    91,
      "icp":                 1.34,
      "status":              "PROPORCIONAL"
    }
  ],
  "indice_gini":     0.12,
  "status_geral":    "NEUTRO",
  "alertas_vies":    [],
  "geradoEm":        "Timestamp"
}
```

**Uso CLI:**
```bash
# Relatório dos últimos 90 dias
python engines/23_neutrality_check.py

# Período customizado
python engines/23_neutrality_check.py --days 180

# Incluir análise por UF além de partido
python engines/23_neutrality_check.py --by-uf

# Salvar relatório em JSON
python engines/23_neutrality_check.py --output neutrality_report.json
```

---

### PARTE 3 — `CompliancePanel.jsx` (Painel Admin)

**3 abas principais:**

**Aba 1 — Status LGPD**
```
┌─────────────────────────────────────────────────────────┐
│  STATUS LGPD                              [● CONFORME]  │
│                                                         │
│  Última varredura: 09/04/2026 06:00                     │
│  Documentos escaneados:  12.847                         │
│  PII detectados:              3  →  [2 redidos, 1 rev.] │
│  Nível de risco geral:     BAIXO                        │
│                                                         │
│  [📋 Baixar Relatório LGPD Completo]                    │
└─────────────────────────────────────────────────────────┘
```

**Aba 2 — Neutralidade**
```
┌─────────────────────────────────────────────────────────┐
│  ÍNDICE DE NEUTRALIDADE                  [● 0.12 GINI]  │
│                                                         │
│  Distribuição por partido (90 dias):                    │
│  PL  ████████████░░░  ICP 1.43  PROPORCIONAL            │
│  PT  █████████░░░░░░  ICP 1.34  PROPORCIONAL            │
│  PP  ███████░░░░░░░░  ICP 1.21  PROPORCIONAL            │
│  ...                                                    │
│                                                         │
│  Alertas de viés: NENHUM nos últimos 30 dias            │
└─────────────────────────────────────────────────────────┘
```

**Aba 3 — Trilha de Auditoria**
```
┌─────────────────────────────────────────────────────────┐
│  TRILHA DE AUDITORIA                                    │
│  ─────────────────────────────────────────────────────  │
│  09/04 14:23  [user:abc123]  ACESSOU  dossiê #204521    │
│  09/04 14:20  [user:xyz789]  EXPORTOU PDF  #201234      │
│  09/04 13:10  [ENGINE-22]    SCAN LGPD  12.847 docs     │
│  09/04 06:00  [ENGINE-23]    RELATÓRIO NEUTRALIDADE     │
│                                    [Carregar mais...]   │
└─────────────────────────────────────────────────────────┘
```

**Fonte de dados (Firestore em tempo real):**
```js
// Compliance log
onSnapshot(
  query(collection(db, "compliance_log"), orderBy("timestamp", "desc"), limit(50)),
  (snap) => setAuditTrail(snap.docs.map(d => d.data()))
);

// Neutrality report mais recente
onSnapshot(
  query(collection(db, "neutrality_reports"), orderBy("geradoEm", "desc"), limit(1)),
  (snap) => setNeutralityReport(snap.docs[0]?.data())
);
```

---

### PARTE 4 — Disclaimer Dinâmico (DossiePage.jsx)

**Níveis de disclaimer por criticidade do dossiê:**

| Criticidade máx. do dossiê | Disclaimer gerado |
|---------------------------|-------------------|
| Sem alertas | "Dados extraídos de fontes públicas oficiais. Nenhuma irregularidade detectada automaticamente." |
| BAIXA / MÉDIA | "Sistema detectou indícios que merecem atenção. Conteúdo informativo. Não constitui acusação formal." |
| ALTA | "Sistema detectou padrões compatíveis com irregularidades. Recomenda-se verificação jornalística antes de publicação." |
| NIVEL_5 | "⚠️ ALERTA CRÍTICO — Sistema detectou indícios fortes de irregularidade grave. Este dossiê requer confirmação por fontes primárias adicionais e consulta jurídica antes de qualquer divulgação pública." |

**Rodapé obrigatório em todo PDF exportado:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A.S.M.O.D.E.U.S. — Sistema Automatizado de Monitoramento
e Detecção de Desvios no Uso de Verbas Públicas

✔ Dados 100% de fontes públicas oficiais (TSE, CGU, Câmara, Senado, DOU)
✔ Nenhum CPF de terceiros armazenado (LGPD art. 7º, inc. IX)
✔ Score de suspeição é indicador probabilístico, não prova
✔ Metodologia completa disponível em /metodologia

Gerado em: {data} | Relatório #{uuid} | Política de privacidade: {url}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 5. Regras de Blindagem Processual

### 5.1 — O que o A.S.M.O.D.E.U.S. É

| ✅ É | ❌ Não é |
|-----|---------|
| Ferramenta de apoio à transparência pública | Sistema de acusação criminal |
| Detector probabilístico de padrões | Juiz ou tribunal |
| Agregador de dados públicos | Fonte de dados sigilosos ou privados |
| Sistema jornalístico auxiliar | Substituto de investigação humana |
| Conforme LGPD (Lei 13.709/2018) | Sistema de vigilância de cidadãos |

### 5.2 — Fontes de dados e seus respaldos legais

| Fonte | Base legal |
|-------|-----------|
| Portal da Transparência (CGU) | Lei 12.527/2011 (LAI) |
| TSE — declarações de candidatura | Resolução TSE 23.607/2019 |
| Câmara dos Deputados API | Ato da Mesa 45/2012 |
| Diário Oficial da União | CF/88 art. 37 — publicidade obrigatória |
| PNCP — contratos e licitações | Lei 14.133/2021 art. 174 |
| Diários Oficiais Municipais (Querido Diário) | LAI + dados já publicados |

### 5.3 — Proteções contra uso indevido

- **Rate limiting por usuário:** máximo 50 dossiês/hora (previne scraping massivo)
- **Watermark no PDF:** UUID único por exportação rastreado no Firestore
- **Termos de uso aceite obrigatório** antes do primeiro dossiê premium
- **Logs de acesso imutáveis** (Firestore com regra `allow write: if false` na raiz de `compliance_log`)

---

## 6. Integração no CI/CD (`asmodeus_cron.yml`)

```yaml
# ENGINE 22 — LGPD Shield (diário, 05h)
- name: "🛡️ ENGINE 22 — LGPD Shield (Varredura Diária)"
  run: |
    python ${{ env.ENGINES_DIR }}/22_lgpd_shield.py \
      --collection alertas_bodes \
      --collection contratos_publicos \
      ${{ env.DRY_RUN_FLAG }}
  continue-on-error: false   # falha aqui deve parar o pipeline

# ENGINE 23 — Neutrality Check (semanal, domingo 06h)
- name: "⚖️ ENGINE 23 — Neutrality Check (Relatório Semanal)"
  run: |
    python ${{ env.ENGINES_DIR }}/23_neutrality_check.py \
      --days 90 \
      --output neutrality_latest.json
  continue-on-error: true
```

---

## 7. Dependências

```bash
# Python
pip install firebase-admin google-cloud-bigquery hashlib

# JavaScript
# Nenhuma nova dependência
# CompliancePanel usa apenas firebase/firestore + react hooks (já instalados)
```

---

## 8. Métricas de Sucesso do Projeto Ironman

| Métrica | Meta | Frequência |
|---------|------|-----------|
| PII detectado não-redigido | 0 documentos | Diária |
| Índice de Gini de cobertura | < 0.25 | Semanal |
| ICP de qualquer partido | Entre 0.5 e 2.5 | Semanal |
| Dossiês sem disclaimer | 0 | Sempre |
| PDFs sem rodapé LGPD | 0 | Sempre |
| Alertas NIVEL_5 sem revisão humana | 0 publicados | Sempre |

---

## 9. Próximas Integrações

| Tarefa | Prioridade | Benefício |
|--------|-----------|-----------|
| Certificação ISO 27001 (roadmap) | Alta | Credibilidade internacional |
| Política de retenção de dados (TTL automático BQ) | Alta | LGPD art. 15 |
| Canal de contestação para políticos | Alta | Devido processo + credibilidade |
| Auditoria externa independente do Neutrality Check | Média | Prova de neutralidade a terceiros |
| Integração com advogados parceiros para revisão N5 | Média | Blindagem jurídica ativa |

---

## 10. Verificação

```bash
# Testar LGPD Shield em modo dry-run
python engines/22_lgpd_shield.py --dry-run --report /tmp/lgpd_test.csv

# Testar Neutrality Check com dados mock
python engines/23_neutrality_check.py --days 30 --mock

# Build do frontend
cd frontend && npm run build
# Navegar para: http://localhost:5173/admin/compliance
```

---

*Gerado por A.S.M.O.D.E.U.S. — Projeto I.R.O.N.M.A.N. (Fase 10)*
*"Um sistema que não se auto-audita não merece auditar ninguém."*
