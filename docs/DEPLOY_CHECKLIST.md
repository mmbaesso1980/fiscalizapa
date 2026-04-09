# DEPLOY_CHECKLIST.md — Ciclo de Produção April 2026

**Data:** 09/04/2026  
**Commit:** `ce8b617`  
**Hosting URL:** https://fiscallizapa.web.app  
**Build:** ✅ `vite build` — 1322 módulos, 0 erros, 2.02s

---

## ✅ Tarefa 1 — Sincronização Absoluta
- `git pull origin main` executado — Already up to date
- `git push origin main` executado — `36c683d..ce8b617`
- Local e nuvem idênticos

---

## ✅ Tarefa 2 — Refatoração Radical do Dossier
- `fmtBRL()` corrigido: normaliza strings `1.234,56` → não produz mais R$ NaN
- `formatCurrency(val || 0)` alias adicionado em `DossiePage.jsx`
- Chamadas `Number(valor_contrato).toLocaleString(...)` substituídas por `fmtBRL()`
- Extraídos: `components/dossie/DossieShared.jsx`, `components/dossie/AlertRow.jsx`
- **Teste ao vivo:** Abrir `/dossie/[id]` e confirmar que nenhum valor mostra "R$ NaN"

---

## ✅ Tarefa 3 — Home Page (Ranking Preview)
- Seção Top 10 / Bottom 10 já existia e foi confirmada funcional
- **Bug corrigido:** `DeputadoCard` usava slug derivado do nome em vez de `dep.id` (Firestore doc ID)
- Link agora: `/politico/ranking_externo/${dep.id}` — direto para o documento correto
- **Teste ao vivo:** Acessar `/`, clicar em card do Top/Bottom 10, verificar que carrega o político correto

---

## ✅ Tarefa 4 — Reposicionamento do IDH
- Criado: `components/SocialContext.jsx` — medidor visual de IDH com barra de progresso e categorias (Muito Alto / Alto / Médio / Baixo / Muito Baixo)
- Criado: `normalizeUF(uf, estadoNome)` — corrige bug onde MATO GROSSO aparecia com "(MA)" em vez de "(MT)"
- `normalizeUF()` importado e aplicado em `DossiePage.jsx` (linhas 194, 527) e `PoliticoPage.jsx`
- ⚠️ Alerta vermelho "REGIÃO VULNERÁVEL" não encontrado no código — IDH é exibido como campo de dados simples em `EmendaPage.jsx`
- **Teste ao vivo:** Abrir dossiê de deputado do MT, confirmar sigla correta

---

## ✅ Tarefa 5 — Compliance e Transparência (Ironman)
- `AuditSealCompact` já está na Navbar (confirmado em `Navbar.jsx:87`)
- Adicionado footer de compliance em `DossiePage.jsx`: aviso "Análise probabilística por IA — pode cometer erros" com links para Portal da Transparência e Câmara Federal
- Adicionado disclaimer em `PoliticoPage.jsx` no topo do conteúdo
- **Teste ao vivo:** Verificar que o aviso aparece ao rolar para o final de qualquer dossiê

---

## ✅ Tarefa 6 — Conserto da Hotpage e Estilização
- `PoliticoPage.jsx` migrado de dark theme (`bg-[#0B0B0F]`, `bg-[#12121a]`) para tema claro (Transparência Brasil):
  - Fundos: `#FAFAF8` (página), `#ffffff` (cards)
  - Bordas: `#EDEBE8` (leve)
  - Sombras: `shadow-sm` (suave)
  - Tipografia: `text-[#2D2D2D]` (escuro sobre branco)
- `StatCard`, `SectionCard` e cards de notas fiscais todos em branco
- **Teste ao vivo:** Acessar `/politico/deputados_federais/[ID]` e confirmar ausência de caixas pretas

---

## ⚠️ Tarefa 7 — Normalização de Dados (Ranking)
- `engines/05_sync_bodes.py` **não pode ser executado neste ambiente** (requer conexão GCP/BigQuery autenticada)
- **Ação manual necessária:** Execute `python engines/05_sync_bodes.py` no ambiente GCP com credenciais configuradas
- Score 88.3 do Kim Kataguiri: justificativa está documentada em `docs/AUDITORIA_IRONMAN.md`

---

## ✅ Tarefa 8 — Integração de Fontes
- `DossiePage.jsx` — CeapMonitorSection: botão "🔗 FONTE OFICIAL ↗" adicionado (aponta para Câmara `deputados/{idCamara}/despesas` ou Portal da Transparência)
- `PoliticoPage.jsx` — Header do dossiê: link "🔗 Portal da Transparência ↗" para busca por nome
- `PoliticoPage.jsx` — Cada linha de gasto: "🔗 Nota Oficial ↗" quando `urlDocumento` disponível
- `AlertRow.jsx` — Cada alerta: link "🔗 Ver fonte oficial ↗" quando `fonte_url` disponível
- **Teste ao vivo:** Confirmar que links abrem o documento correto em nova aba

---

## ✅ Tarefa 9 — Validação de Roteamento
- Rotas `/politico/:colecao/:id` e `/dossie/:id` confirmadas em `App.jsx`
- Bug corrigido: `DeputadoCard` em `HomePage.jsx` agora usa `dep.id` (ID real do Firestore) em vez de slug derivado do nome
- Rotas protegidas redirecionam para `/` quando não autenticado (comportamento intencional)
- `PoliticoPage.jsx` exibe "Deputado não encontrado" graciosamente quando doc não existe
- **Teste ao vivo:** Login → clicar em deputado no ranking → confirmar que abre o dossiê sem 404

---

## ✅ Tarefa 10 — Build de Produção e Deploy Final
- `npm run build` — ✅ 1322 módulos, 0 erros, 0 warnings
- `npx firebase deploy --only hosting` — ✅ Deploy completo
- URL de produção: **https://fiscallizapa.web.app**
- Console Firebase: https://console.firebase.google.com/project/fiscallizapa/overview

---

## Arquivos Criados/Modificados Neste Ciclo

| Arquivo | Tipo | Mudança |
|---|---|---|
| `frontend/src/hooks/useAuth.js` | Modificado | PR incorporado: onSnapshot, deductCredits, useQuota, dailyQuota, isAdmin |
| `frontend/src/pages/DossiePage.jsx` | Modificado | fmtBRL fix, formatCurrency, NaN, compliance footer, UF normalization |
| `frontend/src/pages/PoliticoPage.jsx` | Modificado | Light theme, fmtMoney fix, AI disclaimer, source links, UF normalization |
| `frontend/src/pages/HomePage.jsx` | Modificado | DeputadoCard routing fix (dep.id) |
| `frontend/src/components/SocialContext.jsx` | Criado | IDH meter + normalizeUF() |
| `frontend/src/components/dossie/DossieShared.jsx` | Criado | SEV, SevBadge, SectionHeader, Card, AIDisclaimer, formatCurrency |
| `frontend/src/components/dossie/AlertRow.jsx` | Criado | AlertRow com fonte_url |
| `docs/DEPLOY_CHECKLIST.md` | Criado | Este arquivo |

---

*Gerado automaticamente pelo Agente A.S.M.O.D.E.U.S. em 09/04/2026*
