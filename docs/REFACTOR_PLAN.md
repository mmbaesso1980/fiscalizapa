# REFACTOR_PLAN.md
## Plano de Refatoração — `DossiePage.jsx` (73 KB → ~8 KB + sub-componentes)

**Arquivo alvo:** `frontend/src/pages/DossiePage.jsx`
**Tamanho atual:** ~1.618 linhas / ~73 KB
**Objetivo:** Dividir em componentes focados, mantendo comportamento idêntico e zero regressões.

---

## 1. Diagnóstico Atual

O `DossiePage.jsx` é monolítico por acumulação histórica de fases. Ele contém:

| Bloco | Linhas (aprox.) | Natureza |
|-------|----------------|---------|
| Imports + constantes globais | 1–56 | Configuração |
| Micro-componentes utilitários (`SevBadge`, `SectionHeader`, `Card`, `AlertRow`) | 57–141 | UI atômica |
| `IdentitySection` (Seção 1 — free) | 142–350 | Seção de página |
| `GastosCeapSection` (Seção 2 — free) | 351–500 | Seção de página |
| `DiarioOficialSection` + `DossiePDFContent` | 501–760 | Seção + exportação PDF |
| `UnlockGate` (paywall overlay) | 761–880 | Controle de acesso |
| `OracleLaboratory` (Seção 4 — gated) | 881–1150 | Seção gated complexa |
| `useOracleData` e helpers de negócio | 1151–1300 | Lógica de dados |
| `DossiePage` (componente raiz) — estado + render | 1300–1618 | Orquestrador da página |

**Problemas concretos:**
- Build lento: Vite recompila o arquivo inteiro a cada edição mínima
- Difícil localizar seção para editar; grep por nome de componente retorna falsos positivos
- `useEffect` com 6 dependências dificulta rastreamento de side-effects
- `DossiePDFContent` (gerador de PDF) tem ~200 linhas que nunca precisam re-renderizar

---

## 2. Estrutura Proposta

```
frontend/src/
├── pages/
│   └── DossiePage.jsx          ← orquestrador puro (~120 linhas após split)
│
├── components/dossie/          ← nova pasta
│   ├── index.js                ← re-exports opcionais
│   ├── DossieHeader.jsx        ← cabeçalho + StickyHeader (já externo)
│   ├── IdentitySection.jsx     ← Seção 1: foto, bio, votos, redes sociais
│   ├── GastosCeapSection.jsx   ← Seção 2: gráfico CEAP + tabela
│   ├── DiarioSection.jsx       ← Seção 3: Diários Oficiais + botão "Resumir"
│   ├── TimelineSection.jsx     ← Seção 3B: PoliticalTimeline wrapper
│   ├── OracleLaboratory.jsx    ← Seção 4: alertas + NetworkGraph + PDF btn
│   ├── UnlockGate.jsx          ← overlay de paywall (3 tiers)
│   ├── DossiePDFContent.jsx    ← conteúdo invisível para exportação PDF
│   ├── AlertRow.jsx            ← linha de alerta com Oráculo Gemini
│   └── DossieShared.jsx        ← SevBadge, SectionHeader, Card (UI atômica)
│
└── hooks/
    └── useDossieData.js        ← todos os useEffect/useState de dados do dossiê
```

---

## 3. Plano de Extração — Arquivo por Arquivo

### 3.1 — `DossieShared.jsx` (UI atômica, sem estado)

**Extrair de:** linhas 51–103
**Contém:** `SEV`, `SevBadge`, `SectionHeader`, `Card`
**Por que primeiro:** zero dependências internas; outros componentes precisam destes.

```jsx
// components/dossie/DossieShared.jsx
export const SEV = { ALTA: {...}, MEDIA: {...}, BAIXA: {...} };
export function SevBadge({ v }) { ... }
export function SectionHeader({ icon, title, badge, ... }) { ... }
export function Card({ children, style }) { ... }
```

---

### 3.2 — `AlertRow.jsx`

**Extrair de:** linhas 105–141
**Dependências:** `SevBadge` de `DossieShared`
**Props:** `{ alerta }`

---

### 3.3 — `UnlockGate.jsx`

**Extrair de:** linhas 626–880
**Dependências:** `useNavigate` (react-router), constante `CUSTO_FULL`
**Props:**
```ts
{
  dailyQuota: number | null,
  credits: number | null,
  onUseQuota: () => void,
  onPayFull: () => void,
  unlocking: boolean,
  error: string | null,
  politicoNome: string,
}
```
**Nota:** mover a constante `CUSTO_FULL = 200` para `constants/dossie.js`.

---

### 3.4 — `DossiePDFContent.jsx`

**Extrair de:** ~linhas 760–880 (bloco `DossiePDFContent`)
**Motivo principal:** nunca precisa re-renderizar junto com o estado da página. Extrair + `React.memo` elimina re-renders desnecessários na geração de PDF.
**Props:** `{ pdfRef, politico, alertas, rank, nivel5Alertas }`

---

### 3.5 — `IdentitySection.jsx`

**Extrair de:** linhas 153–350
**Props:** `{ politico }`
**Dependências:** `getRiskColor`, `SectionHeader`, `Card`, `MOCK_VOTES`, `SOCIAL_ICONS`
**Nota:** mover `MOCK_VOTES` e `SOCIAL_ICONS` para `constants/dossie.js`.

---

### 3.6 — `GastosCeapSection.jsx`

**Extrair de:** ~linhas 351–500
**Props:** `{ politico, gastos, loading }`
**Dependências:** `GastosChart` (componente já externo), `SectionHeader`, `Card`

---

### 3.7 — `DiarioSection.jsx`

**Extrair de:** ~linhas 501–625
**Props:** `{ politico, onResumirDiario, resumindo, custo }`
**Dependências:** `SectionHeader`, `Card`
**Contém:** botão "Resumir" com lógica de custo `CUSTO_RESUMO = 10`

---

### 3.8 — `OracleLaboratory.jsx`

**Extrair de:** linhas 881–1150
**Props:**
```ts
{
  politico: object,
  alertas: object[],
  rank: number | null,
  fullUnlocked: boolean,
  pdfRef: React.RefObject,
  onDownloadPDF: () => void,
  generatingPDF: boolean,
}
```
**Dependências:** `AlertRow`, `NetworkGraph` (já externo), `SankeyChart` (já externo), `CabinetAudit` (já externo), `PerformanceTab` (já externo)

---

### 3.9 — `useDossieData.js` (custom hook)

**Extrair de:** lógica de `useEffect` / `useState` dentro de `DossiePage`
**Retorna:**
```ts
{
  politico, setPolitico,
  alertas, rank,
  gastos,
  nivel5Alertas,
  loading, error,
  basicUnlocked, fullUnlocked, oracleGated,
  unlocking, unlockError,
  generatingPDF,
  handleUseQuota,
  handlePayFull,
  handleDownloadPDF,
}
```
**Benefício:** `DossiePage.jsx` vira um componente de layout puro (~120 linhas) que apenas distribui props.

---

### 3.10 — `DossiePage.jsx` após refatoração (~120 linhas)

```jsx
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useDossieData } from "../hooks/useDossieData";
import StickyHeader from "../components/StickyHeader";
import DossieHeader from "../components/dossie/DossieHeader";
import IdentitySection from "../components/dossie/IdentitySection";
import GastosCeapSection from "../components/dossie/GastosCeapSection";
import DiarioSection from "../components/dossie/DiarioSection";
import TimelineSection from "../components/dossie/TimelineSection";
import OracleLaboratory from "../components/dossie/OracleLaboratory";
import UnlockGate from "../components/dossie/UnlockGate";
import DossiePDFContent from "../components/dossie/DossiePDFContent";

export default function DossiePage() {
  const { id } = useParams();
  const data = useDossieData(id);

  return (
    <>
      <Helmet>...</Helmet>
      <StickyHeader politico={data.politico} rank={data.rank} />
      <main>
        <DossieHeader politico={data.politico} rank={data.rank} nivel5Alertas={data.nivel5Alertas} />
        <IdentitySection politico={data.politico} />
        <GastosCeapSection politico={data.politico} gastos={data.gastos} />
        <DiarioSection politico={data.politico} onResumirDiario={data.handleResumirDiario} />
        <TimelineSection politicoId={id} politicoNome={data.politico?.nome} />
        <div style={{ position: "relative" }}>
          <OracleLaboratory {...oracleProps(data)} />
          {data.oracleGated && <UnlockGate {...unlockProps(data)} />}
        </div>
        <DossiePDFContent ref={data.pdfRef} politico={data.politico} alertas={data.alertas} rank={data.rank} nivel5Alertas={data.nivel5Alertas} />
      </main>
    </>
  );
}
```

---

## 4. Ordem de Execução Recomendada

Extrações **de baixo para cima** — sempre os filhos antes dos pais:

```
Passo 1  →  constants/dossie.js         (SEV, CUSTO_FULL, CUSTO_RESUMO, MOCK_VOTES, SOCIAL_ICONS)
Passo 2  →  DossieShared.jsx            (SevBadge, SectionHeader, Card)
Passo 3  →  AlertRow.jsx
Passo 4  →  DossiePDFContent.jsx        (+ React.memo)
Passo 5  →  UnlockGate.jsx
Passo 6  →  IdentitySection.jsx
Passo 7  →  GastosCeapSection.jsx
Passo 8  →  DiarioSection.jsx
Passo 9  →  OracleLaboratory.jsx
Passo 10 →  useDossieData.js            (extrair toda a lógica de dados)
Passo 11 →  DossieHeader.jsx            (N5 banner + foto + score header)
Passo 12 →  DossiePage.jsx             (limpar para ~120 linhas)
```

**Regra de ouro para cada passo:**
1. Extrair o bloco para o novo arquivo
2. Importar no `DossiePage.jsx` no lugar original
3. Rodar `npm run dev` e verificar visualmente que a seção não mudou
4. Só então avançar para o próximo passo

---

## 5. Resultado Esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Tamanho `DossiePage.jsx` | 73 KB / 1.618 linhas | ~6 KB / ~120 linhas |
| Arquivos de componente | 1 | 11 arquivos focados |
| Re-renders desnecessários do PDF | Sempre | Nunca (React.memo) |
| Tempo de hot-reload ao editar uma seção | ~800ms (recompila tudo) | ~120ms (arquivo pequeno) |
| Testabilidade de `UnlockGate` em isolamento | Impossível | `<UnlockGate dailyQuota={1} credits={0} ... />` |

---

## 6. Arquivos que NÃO devem ser movidos

Estes já são componentes externos importados no `DossiePage` e **não precisam de refatoração**:

- `NetworkGraph.jsx` ✅
- `StickyHeader.jsx` ✅
- `PerformanceTab.jsx` ✅
- `PoliticalTimeline.jsx` ✅
- `CabinetAudit.jsx` ✅
- `SankeyChart.jsx` ✅

---

*Criado em 2026-04-09 | A.S.M.O.D.E.U.S. — Projeto Limpeza Estrutural*
