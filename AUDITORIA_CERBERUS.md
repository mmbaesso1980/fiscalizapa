# AUDITORIA — Protocolo Cerberus (Busca, Redes e Controle)
> A.S.M.O.D.E.U.S. · Fase 3 · Sessão executada em: **08/04/2026**
> Arquiteto responsável: Claude (Cursor Agent)

---

## Resumo Executivo

O **Protocolo Cerberus** instalou os 3 pilares de **observabilidade**: um mecanismo de busca global em tempo real, um visualizador de redes de conexões forenses, e uma sala de controle administrativa com Kill Switch operacional. O sistema agora tem olhos, memória de relações e um painel de comando.

---

## PARTE 1 — O Olho Que Tudo Vê (GlobalSearch)

### Arquivo criado: `frontend/src/components/GlobalSearch.jsx`

**Barra de busca global** integrada na Navbar, entre os links de navegação e o menu de usuário.

**Funcionamento:**

| Fase | Detalhe |
|------|---------|
| Cache de módulo | Carrega `deputados_federais` uma vez, cacheia por 5 min na memória do módulo |
| Debounce 500ms | `useEffect` + `setTimeout` — zero chamadas ao Firestore durante a digitação |
| Busca | Filtragem client-side com `normalize()` (remove acentos, lowercase) — tolerante a erros de digitação de acentos |
| Ranking dos resultados | Matches no início do nome têm prioridade; em empate, maior `score` fica primeiro |
| Max resultados | 7 itens por busca |

**Dropdown Glassmorphism:**
- `backdrop-filter: blur(20px) saturate(180%)` com border branco translúcido
- Cada item exibe: foto circular (com fallback SVG), nome, partido/UF/cargo, "Dossiê →"
- Navegação por teclado: ↑↓ para navegar, Enter para selecionar, Escape para fechar
- Click fora fecha o dropdown

**Clique em resultado → navega para `/dossie/:id`**

### Arquivo atualizado: `frontend/src/components/Navbar.jsx`

- Import + renderização do `<GlobalSearch />` entre os links e o menu de usuário
- Adicionado link `Alertas` na barra de navegação
- Link "☠️ Sala do Trono" no dropdown de usuário (visível apenas para `isAdmin === true`)
- Prop `isAdmin` adicionada à assinatura do componente

---

## PARTE 2 — A Teia de Aranha (NetworkGraph)

### Arquivo criado: `frontend/src/components/NetworkGraph.jsx`

**Visualizador interativo de grafos** usando `react-force-graph-2d` com carregamento dinâmico.

**Dependência adicionada:** `frontend/package.json`
```json
"react-force-graph-2d": "^1.25.0"
```

**Instalação obrigatória (rodar no terminal após atualizar o repo):**
```bash
cd C:\Users\M.Baesso\fiscalizapa\frontend
npm install
```

**Estratégia de carregamento:**
O componente usa `import("react-force-graph-2d")` dinâmico dentro de um `useEffect`. Se o pacote não estiver instalado, exibe automaticamente:
1. Um fallback com `StaticGraphPreview` — grafo SVG estático mostrando a estrutura dos dados
2. Instrução de instalação em `code` inline

**Estrutura de dados (pronta para BigQuery Módulo 4):**

```js
// Nós
{ id, name, type, val, color }
// type: 'politician' | 'company' | 'person' | 'municipality' | 'fund'

// Links
{ source, target, label, type, value }
// type: 'contract' | 'kinship' | 'donation' | 'amendment' | 'ownership'
```

**Dados mock incluídos (`buildMockGraph(politicoId)`):**

| Nó | Tipo | Cor |
|----|------|-----|
| Parlamentar | politician | `#C82538` (vermelho) |
| Construtora Alpha S.A. | company | `#D97706` (laranja) |
| TecnoSaúde Ltda. | company | `#D97706` |
| Agro Fértil ME | company | `#D97706` |
| José R. Santos (Sócio) | person | `#3B82F6` (azul) |
| Maria F. Lima (cônjuge) | person | `#8B5CF6` (roxo) |
| Belém/PA | municipality | `#2E7F18` (verde) |
| Fundo Eleitoral XYZ | fund | `#FBD87F` (dourado) |

**Links com cores por tipo:**
- `amendment` (emenda) → vermelho translúcido
- `contract` (contrato) → laranja translúcido
- `kinship` (parentesco) → roxo translúcido, largura 2.5px
- `donation` (doação) → dourado translúcido
- `ownership` (participação) → azul translúcido

**Funcionalidades interativas:**
- `paintNode` customizado — nó selecionado (hovered) exibe halo colorido
- Click no nó → `centerAt()` + `zoom(3)` animado
- Labels visíveis apenas com zoom suficiente (> 0.8)
- `d3-force`: `alphaDecay: 0.02`, `velocityDecay: 0.3` — simulação suave

### Arquivo atualizado: `frontend/src/pages/DossiePage.jsx`

Adicionada seção **"Rede de Conexões — Módulo 4"** abaixo da seção de OCR no `DossieContent`:
```jsx
<NetworkGraph politicoId={politico.id} height={400} />
```
Embrulhada em container com `background: rgba(253,252,251,0.8)` e border sutil.

---

## PARTE 3 — A Sala do Trono (AdminDashboard)

### Arquivo criado: `frontend/src/pages/AdminDashboard.jsx`

**Painel de controle administrativo** com design terminal escuro.

**Paleta de cores:**
| Token | Valor | Uso |
|-------|-------|-----|
| `bg` | `#0D1117` | Fundo da página |
| `surface` | `#161B22` | Cards / painéis |
| `border` | `#30363D` | Bordas |
| `text` | `#E6EDF3` | Texto principal |
| `muted` | `#8B949E` | Labels / subtexto |
| `red` | `#FF4C4C` | Kill Switch / alertas |
| `green` | `#56D364` | Status ativo / métricas OK |
| `yellow` | `#D29922` | Créditos / warnings |
| `mono` | `'Fira Code', 'Courier New'` | Números / terminal |

**Métricas do painel:**

| Métrica | Fonte | Cor |
|---------|-------|-----|
| Bodes Detectados | `getDocs(alertas_bodes, limit 1000)` | `#FF4C4C` |
| Créditos Gastos | Calculado: Σ(10 − creditos_atual) por usuário | `#D29922` |
| Usuários Cadastrados | `getDocs(usuarios, limit 5000)` | `#58A6FF` |
| Engines Ativas | 5 (real) ou 0 se Kill Switch ativo | `#56D364` / `#FF4C4C` |

**Kill Switch:**
- Escreve `config/sistema.apiPausada = true/false` no Firestore
- Listener `onSnapshot` mantém estado em tempo real
- Quando ativo: border vermelho pulsante + `box-shadow` vermelho + mensagem de terminal
- Botão alterna entre "DESLIGAR SISTEMA" e "RELIGAR SISTEMA"
- Todos os engines devem verificar `config/sistema.apiPausada` antes de executar chamadas externas

**Log terminal:**
- Painel de logs estilo macOS terminal (com botões coloridos decorativos)
- Logs gerados pelos eventos do painel: carregamento de métricas, Kill Switch, erros
- Máximo 50 entradas, entrada mais recente no topo
- Botão "limpar" para resetar

**Relógio em tempo real:** atualizado a cada 1s via `setInterval`.

### Proteção da rota `/admin`

**Camada 1 — `useAuth.js`:**
O `onSnapshot` agora lê `usuarios/{uid}.isAdmin`:
```js
setIsAdmin(snap.data()?.isAdmin === true)
```

**Camada 2 — `AdminDashboard.jsx` (componente):**
```js
useEffect(() => {
  if (!user)            navigate("/",         { replace: true });
  if (isAdmin === false) navigate("/dashboard", { replace: true });
}, [user, isAdmin]);
// Não renderiza antes de confirmar admin: if (isAdmin !== true) return null;
```

**Camada 3 — `App.jsx` (roteador):**
```jsx
{isAdmin && <Route path="/admin" element={<AdminDashboard />} />}
```
A rota só existe no DOM de quem é admin. Um não-admin que acessar `/admin` cai no `<Navigate to="/dashboard">`.

**Camada 4 — Navbar:**
Link "☠️ Sala do Trono" visível apenas para `isAdmin === true`.

**Para definir um usuário como admin (manualmente no Console Firebase):**
```
Firestore → usuarios → {uid_do_usuario} → isAdmin: true
```

### Arquivos atualizados:

| Arquivo | Mudanças |
|---------|---------|
| `frontend/src/hooks/useAuth.js` | + `isAdmin` state, lido via `onSnapshot` |
| `frontend/src/App.jsx` | + `isAdmin` da `useAuth`, + rota `/admin` condicional, + `AdminDashboard` lazy |
| `frontend/src/components/Navbar.jsx` | + `GlobalSearch`, + link Alertas, + link Admin (condicional), + prop `isAdmin` |

---

## Mapa de Rotas Completo (Fase 3)

| Rota | Componente | Acesso | Novidade |
|------|-----------|--------|---------|
| `/` | `HomePage` | Público | — |
| `/ranking` | `RankingPage` | Público | — |
| `/alertas` | `AlertasPage` | Público | — |
| `/metodologia` | `MetodologiaPage` | Público | — |
| `/dashboard` | `DashboardPage` | Login | — |
| `/creditos` | `CreditosPage` | Login | — |
| `/politico/:col/:id` | `PoliticoPage` | Login | — |
| `/emenda/:id` | `EmendaPage` | Login | — |
| `/emendas` | `BancoEmendasPage` | Login | — |
| `/comparador` | `ComparadorPage` | Login | — |
| `/dossie/:id` | `DossiePage` | Login + 200cr | + NetworkGraph |
| `/admin` | `AdminDashboard` | Login + isAdmin | **NOVO** |

---

## Ações Necessárias para Ativar Completamente

```bash
# 1. Instalar react-force-graph-2d (grafo interativo)
cd C:\Users\M.Baesso\fiscalizapa\frontend
npm install

# 2. No Console Firebase — para ativar o /admin:
#    Firestore → usuarios → {seu_uid} → isAdmin: true

# 3. No Console Firebase — criar índice composto (GlobalSearch + DossiePage):
#    Coleção: alertas_bodes
#    Campos: parlamentar_id ASC + criadoEm DESC

# 4. No Firestore — criar documento de configuração do sistema:
#    config → sistema → { apiPausada: false }
```

---

*Gerado automaticamente pelo Cursor Agent — Protocolo Cerberus · 08/04/2026*
