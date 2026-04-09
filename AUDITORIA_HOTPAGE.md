# AUDITORIA_HOTPAGE.md
## Protocolo Hotpage Elite — Organização Suprema e Funil de IA
**Data de execução:** 08/04/2026  
**Status:** ✅ Concluído

---

## Sumário Executivo

O Protocolo Hotpage Elite reestruturou completamente a página do político (`DossiePage.jsx`) em uma arquitetura de **4 seções com funnel freemium**. O objetivo é tornar cristalina a diferença entre **dado manual (grátis)** e **inteligência processada (IA/Pago)**, ao mesmo tempo que melhora a UX com navegação paralaxe e header fixo contextual.

---

## Arquitetura das 4 Seções

### SEÇÃO 1 — Identidade e Atividade 🆓 GRÁTIS
**Componente:** `IdentitySection`

- Avatar do político com borda colorida (HSL de risco)
- Nome, partido, UF e percentual de presença
- Biografia (campo `bio` do Firestore, ou gerada se ausente)
- Links sociais simulados (Twitter/X, Instagram, site oficial)
- Lista das **4 votações recentes** com badge colorido (SIM/NÃO/ABS)

**Dados:** Públicos, extraídos da API da Câmara e do Firestore (`deputados_federais`).

---

### SEÇÃO 2 — Monitor de Gastos CEAP 🆓 GRÁTIS
**Componente:** `CeapMonitorSection`

- KPIs: Total 6 meses, Média mensal, Presença na Câmara
- **Gráfico de barras CSS puro** (sem bibliotecas externas) mostrando CEAP mês a mês (Out→Mar)
  - Barra vermelha = mês de maior gasto
  - Linha de referência da média
- Top 4 fornecedores com barras de progresso percentual
- Dados distribuídos deterministicamente a partir de `gastosCeapTotal`

**Pipeline:** `engines/06_ocr_notas.py` + BigQuery `fiscalizapa.ceap_ocr_extractions` (integração pendente de execução).

---

### SEÇÃO 3 — Diários Oficiais 🆓 GRÁTIS + 10cr para resumo
**Componente:** `DiariosMencoesSection`

- Consulta Firestore `diarios_atos` (output do `10_universal_crawler.py`)
- Exibe as 5 menções mais recentes com: título, fonte (DOU/DOE/DOM), data
- Para textos longos (> 300 chars): exibe trecho + botão **"✦ Resumir com IA — 10 créditos"**
  - Debita 10 créditos via `deductCredits(10)` (transação atômica)
  - Exibe resumo com visual de "Síntese A.S.M.O.D.E.U.S." (borda azul clara)
- Fallback: 3 entradas mock se a coleção estiver vazia (DOU, DOE, contratos emergenciais)

---

### SEÇÃO 4 — Laboratório Oráculo 🔒 GATED
**Componentes:** `OracleLaboratory` + `UnlockGate`

| Nível | Condição | Conteúdo liberado |
|-------|----------|-------------------|
| 🔴 Bloqueado | Sem cota E sem créditos | Nada — Paywall completo |
| 🟡 Básico | `dailyQuota > 0` | Alertas forenses + textos Gemini Oráculo |
| 🟠 Pré-completo | `credits >= 200` (sem cota) | Botão de unlock completo |
| 🟢 Completo | Pagou 200 créditos | Alertas + Grafo de Influência + PDF export |

**Efeito visual:** conteúdo da seção é renderizado mas `.blur(6px)` + `pointer-events: none` quando bloqueado.

---

## Lógica de Cotas Diárias Freemium

### `dossies_gratuitos_restantes` — Novo campo Firestore

| Campo | Tipo | Default | Controlado por |
|-------|------|---------|---------------|
| `dossies_gratuitos_restantes` | `number` | `2` | Admin SDK (reset) / cliente (decremento) |

### Fluxo de verificação na DossiePage

```
1. sessionStorage("dossie_full_{id}") → fullUnlocked
2. sessionStorage("dossie_basic_{id}") → basicUnlocked
3. Firestore usuarios/{uid}/dossies_desbloqueados/{id}
   → tipo: "full"  → fullUnlocked + basicUnlocked
   → tipo: "basic" → basicUnlocked apenas
4. Se nenhum → mostra UnlockGate
```

### UnlockGate — 3 Tiers

**Tier 1 — Cota Diária Disponível** (`dailyQuota > 0`):
- Botão verde: "🎟️ Usar 1 Cota Diária — Acesso Básico"
- Salva `tipo: "basic"` em `dossies_desbloqueados`
- Custo: 0 créditos (1 cota)

**Tier 2 — Sem Cota, Com Créditos** (`credits >= 200`):
- Botão âmbar: "🔓 Desbloquear Completo — 200 créditos"
- Salva `tipo: "full"` em `dossies_desbloqueados`
- Custo: 200 créditos

**Tier 3 — Sem Cota, Sem Créditos**:
- Botão escuro: "💳 Comprar Créditos ou Acesso Ilimitado"
- Navega para `/creditos`
- Informa que cotas renovam às 00:00 BRT

### Upgrade Básico → Completo

Se o usuário está no nível básico E tem ≥ 200 créditos, um banner aparece embaixo do Laboratório Oráculo oferecendo upgrade imediato.

---

## engine: `engines/12_reset_quotes.py`

Script Python para reset diário das cotas gratuitas via Firebase Admin SDK.

```bash
# Uso básico (produção)
python engines/12_reset_quotes.py --quota 2

# Dry-run (sem gravar)
python engines/12_reset_quotes.py --dry-run

# Resetar apenas 1 usuário
python engines/12_reset_quotes.py --uid UID_AQUI

# Promoção: aumentar para 3 cotas
python engines/12_reset_quotes.py --quota 3
```

**Destaques técnicos:**
- Processa usuários em lotes de 500 (limite do Firestore batch write)
- Pula usuários com `isAdmin: true` (quota ilimitada)
- Pula usuários que já estão no valor alvo (economiza writes)
- Atualiza campo `quotaResetEm` com timestamp ISO
- Suporte a `--uid` para reset individual

### Integração no CI/CD (GitHub Actions)

Adicionado como **ENGINE 12** no `asmodeus_cron.yml`, executado todo dia às 03:00 UTC (meia-noite BRT), após o ENGINE 08 (Web Call):

```yaml
- name: "🔄 ENGINE 12 — Reset de Cotas Gratuitas (Firestore)"
  run: python engines/12_reset_quotes.py --quota 2 ${{ env.DRY_RUN_FLAG }}
  continue-on-error: true
```

---

## Componente: `StickyHeader.jsx`

Header fixo que aparece ao scrollar > 120px na página do político.

**Conteúdo:**
- Avatar circular com borda colorida pelo HSL de risco
- Nome do político (truncado com `text-overflow: ellipsis`)
- Badge partido · UF
- Barra de temperatura de risco (gradiente verde → vermelho)
- Badge emoji + label do nível de risco (MONITORADO/BAIXO/MÉDIO/ALTO/CRÍTICO)
- Número do ranking (`#1 de 513`)

**Animação:** `transform: translateY(-110%)` → `translateY(0)` com `transition: 0.35s cubic-bezier(0.4, 0, 0.2, 1)`.

**Glassmorphism:** `backdrop-filter: blur(18px) saturate(160%)` + fundo `rgba(255,255,255,0.82)`.

---

## Componente: `Layout.jsx` — Parallax nas Orbs

Adicionado efeito de parallax de profundidade nas 4 orbs decorativas.

**Taxas por camada:**
| Orb | Cor | Taxa |
|-----|-----|------|
| Orb 1 (Dourado · top-left) | `#FBD87F` | `+0.07` (move para baixo) |
| Orb 2 (Azul · top-right)   | `#9ECFE8` | `-0.05` (move para cima)  |
| Orb 3 (Verde · mid-left)   | `#A8D8B0` | `+0.10` (move para baixo) |
| Orb 4 (Laranja · bottom-right) | `#F7B98B` | `-0.04` (move para cima) |

**Separação de responsabilidades:**
- `outerDiv` (ref) → controla `translateY` do parallax (JavaScript)
- `innerDiv` (CSS `orb-drift-N`) → controla a animação de drift (CSS keyframes)

Sem conflito entre transform do JS e transform do CSS porque operam em elementos diferentes.

**Performance:** `requestAnimationFrame` + `passive: true` no scroll event listener. Nenhum re-render React.

---

## Atualização: `useAuth.js`

### Novos exports

| Export | Tipo | Descrição |
|--------|------|-----------|
| `dailyQuota` | `number \| null` | `dossies_gratuitos_restantes` em tempo real via onSnapshot |
| `useQuota()` | `async () => void` | Transação atômica: decrementa 1 cota diária |

### `useQuota()` — Detalhes

```js
const useQuota = async () => {
  // runTransaction Firestore:
  // current = dossies_gratuitos_restantes
  // if (current <= 0) → lança "Cota diária esgotada."
  // tx.update(ref, { dossies_gratuitos_restantes: current - 1 })
};
```

### Provisão inicial

Campos adicionados ao signup (`ensureUserDoc` + `registerWithEmail`):
```js
{
  dossies_gratuitos_restantes: 2,
  isAdmin: false,  // agora explícito no signup
}
```

---

## Atualização: `firestore.rules` (v2.1)

### Nova função: `isValidQuotaDeduction()`

```javascript
function isValidQuotaDeduction() {
  let only_quota  = fieldsDiff().hasOnly(['dossies_gratuitos_restantes', 'atualizadoEm']);
  let is_decrease = request.resource.data.dossies_gratuitos_restantes
                    < resource.data.dossies_gratuitos_restantes;
  let no_negative = request.resource.data.dossies_gratuitos_restantes >= 0;
  return only_quota && is_decrease && no_negative;
}
```

### `touchesCriticalFields()` atualizado

Inclui agora `dossies_gratuitos_restantes` como campo crítico (clientes não podem aumentar o valor).

### `usuarios/{uid}` allow update

```javascript
allow update: if isAdmin()
              || (isOwner(uid) && !touchesCriticalFields())
              || (isOwner(uid) && isValidCreditDeduction())
              || (isOwner(uid) && isValidQuotaDeduction());  // NOVO
```

### `isValidDossieCreate()` atualizado

`creditsGastos >= 0` (era `> 0`) para permitir desbloqueios básicos via cota (0 créditos gastos).

### Novas coleções adicionadas

| Coleção | Leitura | Escrita |
|---------|---------|---------|
| `diarios_atos` | Pública | Admin SDK |
| `crawler_activity` | Admin/Auth | Admin SDK |

---

## Arquivos Modificados

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `engines/12_reset_quotes.py` | NOVO | Script de reset de cotas com argparse, batch writes, dry-run |
| `frontend/src/components/StickyHeader.jsx` | NOVO | Header fixo com risco HSL, ranking e slide-in animation |
| `frontend/src/components/Layout.jsx` | ATUALIZADO | Parallax nas orbs via rAF + refs separados da animação |
| `frontend/src/hooks/useAuth.js` | ATUALIZADO | `dailyQuota`, `useQuota()`, provisão inicial atualizada |
| `frontend/src/pages/DossiePage.jsx` | REFATORADO | 4 seções, 3-tier freemium, StickyHeader, Diários, upgrade flow |
| `firestore.rules` | ATUALIZADO | v2.1: `isValidQuotaDeduction`, novas coleções, `creditsGastos >= 0` |
| `.github/workflows/asmodeus_cron.yml` | ATUALIZADO | ENGINE 12 adicionado ao pipeline noturno |

---

## Fluxo de Dados Completo

```
USUÁRIO ACESSA /dossie/:id
         │
         ├─ SEÇÃO 1: Firestore deputados_federais/{id}      → LIVRE
         ├─ SEÇÃO 2: campo gastosCeapTotal                  → LIVRE
         ├─ SEÇÃO 3: Firestore diarios_atos (crawler)       → LIVRE
         │           └─ "Resumir" → deductCredits(10) → Gemini
         │
         └─ SEÇÃO 4: LABORATÓRIO ORÁCULO
                  │
                  ├─ basicUnlocked OU fullUnlocked?
                  │   └─ SIM → renderiza OracleLaboratory
                  │         ├─ fullUnlocked: + NetworkGraph + PDF
                  │         └─ basicUnlocked apenas: alertas + Gemini textos
                  │
                  └─ NÃO → UnlockGate (3 tiers)
                        ├─ dailyQuota > 0 → handleUseQuota() → tipo: "basic"
                        ├─ credits >= 200 → handlePayFull()  → tipo: "full"
                        └─ nenhum        → navegar para /creditos

CRON DIÁRIO (03:00 UTC via GitHub Actions):
  engines/12_reset_quotes.py --quota 2
  → todos os usuários voltam para dossies_gratuitos_restantes: 2
```

---

## Próximas Integrações Sugeridas

1. **Stripe Checkout** — substituir o `/creditos` por um fluxo de pagamento real com preços configuráveis
2. **API da Câmara** — popular as votações reais no `IdentitySection` via `getDocs(proposicoes)`
3. **BigQuery → Firestore** — `05_sync_bodes.py` já sincroniza alertas; adicionar CEAP real ao pipeline
4. **Gemini no cliente** — substituir o resumo mock de Diários por uma Cloud Function que chama a API sem expor a chave

---

*Protocolo Hotpage Elite concluído.*  
*A.S.M.O.D.E.U.S. · Motor de Inteligência Forense Parlamentar*
