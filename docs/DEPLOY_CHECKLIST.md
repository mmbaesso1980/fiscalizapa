# DEPLOY CHECKLIST — Sequência de Bugs B1-B7
**Data:** 09/04/2026  
**Deploy:** https://fiscallizapa.web.app / https://transparenciabr.com.br  
**Commit:** `4d09c11`

---

## ✅ B3 — DashboardPage: campo `idx` vs `score`
- **Problema:** `normalizarScoresPorKim` recomputava scores localmente usando `p.score` como `riskScore` (conflito de campos). Deputados com `score=88` no Firestore recebiam `processosScore = 100 - 88*1.8 = -58 → 0`, zerando o índice.
- **Correção:** `indiceTransparenciaBR.js` atualizado para:
  - Usar `p.score` do Firestore diretamente como `idx` quando >50% dos deputados têm score
  - Corrigir `calcProcessosScore` e `calcularScoreBrutoTransparenciaBR` para usar apenas `p.riskScore` (nunca `p.score`)
- **Arquivo:** `frontend/src/utils/indiceTransparenciaBR.js`
- **Status:** ✅ Deployado

---

## ✅ B4/B5 — NotFoundPage não roteada (404)
- **Problema:** `NotFoundPage.jsx` existia mas não estava importada nem roteada em `App.jsx`. Rotas desconhecidas redirecionavam para `/` ou `/dashboard`.
- **Correção:** `NotFoundPage` adicionada como lazy import e rota catch-all `path="*"` para usuários autenticados e não autenticados.
- **Arquivo:** `frontend/src/App.jsx`
- **Status:** ✅ Deployado

---

## ✅ B6 — SocialContext não integrado em EmendaPage
- **Problema:** Componente `SocialContext.jsx` criado mas não utilizado na `EmendaPage`. IDH da emenda era exibido como texto simples na tabela de detalhes.
- **Correção:** `SocialContext` importado e renderizado antes da seção "Detalhes" quando `emenda.idhLocal` ou `emenda.localidade` estiverem disponíveis. Campo `IDH Local` removido da tabela (agora exibido pelo componente visual).
- **Arquivo:** `frontend/src/pages/EmendaPage.jsx`
- **Status:** ✅ Deployado

---

## ✅ B1 — CF `getAuditoriaPolitico` inexistente (CEAP = R$0)
- **Problema:** `PoliticoPage.jsx` chamava `httpsCallable(functions, "getAuditoriaPolitico")` mas a função não existia nas Cloud Functions, causando erro silencioso e `gastos = []`.
- **Correção:** Criada `getAuditoriaPolitico` em `functions/index.js`:
  - Aceita `{ nome, idCamara, ano }`
  - Busca deputado por `idCamara` ou pelo nome via API da Câmara
  - Fetcha até 300 despesas CEAP (3 páginas × 100 itens) da API aberta
  - Retorna `{ despesas, total, deputadoId, ano, fonte }`
- **Frontend:** `PoliticoPage` atualizado para passar `idCamara` na chamada CF
- **Arquivos:** `functions/index.js`, `frontend/src/pages/PoliticoPage.jsx`
- **Status:** ✅ Deployado (CF criada em `southamerica-east1`)

---

## ✅ B7 — Revisão AlertasPage, BancoEmendasPage, MapaPage, ComparadorPage
- **AlertasPage:** OK — wrapper limpo para `AlertDashboard`
- **BancoEmendasPage:** OK — filtros, paginação e `fmt()` robustos
- **MapaPage:** OK — fallback para query sem `orderBy` quando índice ausente
- **ComparadorPage:** OK — usa `normalizarScoresPorKim` (agora corrigido)
- **Bug extra encontrado e corrigido:** `DashboardPage` passava `onSelectState` para `MapaBrasil` que espera `onEstadoSelect` — mapa de filtro não funcionava
- **Arquivo:** `frontend/src/pages/DashboardPage.jsx`
- **Status:** ✅ Corrigido e deployado

---

## Resumo do Deploy

| Item | Arquivo | Status |
|------|---------|--------|
| B3 score/idx | `indiceTransparenciaBR.js` | ✅ |
| B4 DeputadoPage rota | `App.jsx` | ✅ |
| B5 NotFoundPage 404 | `App.jsx` | ✅ |
| B6 SocialContext Emenda | `EmendaPage.jsx` | ✅ |
| B1 CF CEAP criada | `functions/index.js` | ✅ |
| B7 MapaBrasil prop | `DashboardPage.jsx` | ✅ |

**Build:** ✅ `1323 modules transformed` — 0 erros  
**Functions deploy:** ✅ `getAuditoriaPolitico` criada + 10 funções atualizadas  
**Hosting deploy:** ✅ 39 arquivos · `fiscallizapa.web.app`  
**Git push:** ✅ `main` → `a1ae048..4d09c11`

---

## Pendências Conhecidas

| ID | Descrição | Causa |
|----|-----------|-------|
| B7-data | 115 deputados faltando no ranking | Engine `05_sync_bodes.py` precisa ser executado |
| B7-total | Total pago emendas Kim = R$4.5B | Verificar dados na coleção `emendas` |
| CF-BQ | `getAuditoriaPolitico` usa API Câmara (não BigQuery) | Tabela BigQuery de despesas individuais não mapeada |
