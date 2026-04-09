# AUDITORIA — Protocolo Night Shift
> A.S.M.O.D.E.U.S. · Sessão executada em: **08/04/2026**
> Arquiteto responsável: Claude (Cursor Agent)

---

## Resumo Executivo

O **Night Shift** foi uma operação de 4 partes que completou a integração entre o Motor de Inteligência (BigQuery / GCP) e a Vitrine Comercial (React / Firebase), além de implementar o sistema visual de ranking por cores dinâmicas (HSL) e o efeito "orbs" da identidade visual.

---

## PARTE 1 — Ponte de Dados (Backend)

### Arquivo criado: `engines/05_sync_bodes.py`

**Responsabilidade:** Sincronizar alertas do BigQuery para a coleção `alertas_bodes` do Firestore.

**Fluxo:**
1. Garante a existência da view `vw_alertas_bodes` no BigQuery (cria se não existir)
2. Consulta os alertas mais recentes via SQL
3. Faz upsert em lote (max 499 docs/batch, limite Firestore) com `merge=True`

**View `vw_alertas_bodes` unifica sinais de:**
| Módulo | View fonte | Tipo de alerta |
|--------|-----------|----------------|
| 10 | `forense_elegibilidade_parlamentar` | `FICHA_LIMPA_INELEGIVEL` |
| 11 | `forense_inelegibilidade_reflexa` | `INELEGIBILIDADE_REFLEXA` |
| 1  | `forense_cnae_incompativel` | `CNAE_INCOMPATIVEL` |
| 9  | `forense_doador_vencedor` | `DOADOR_VENCEDOR` |
| 20 | `forense_enriquecimento` | `ENRIQUECIMENTO_ILICITO` |

**Variáveis de ambiente:**
| Variável | Descrição |
|---------|-----------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Chave SA com acesso ao BigQuery |
| `FIRESTORE_SA_KEY` | Chave SA com acesso ao Firestore de `fiscallizapa` (opcional; usa ADC se ausente) |

### Como executar:
```bash
# Ativar ambiente virtual (Linux/macOS)
source engines/.venv/bin/activate

# Ativar ambiente virtual (Windows PowerShell)
.\engines\.venv\Scripts\Activate.ps1

# Instalar dependências (primeira vez)
pip install -r engines/requirements.txt

# Rodar em modo simulação (sem gravar no Firestore)
python engines/05_sync_bodes.py --dry-run

# Rodar em produção (sincroniza até 1000 alertas)
python engines/05_sync_bodes.py

# Sincronizar apenas os 200 alertas mais críticos
python engines/05_sync_bodes.py --limit 200

# Usar projetos alternativos
python engines/05_sync_bodes.py \
  --project-bq projeto-codex-br \
  --project-firestore fiscallizapa
```

---

## PARTE 2 — Motor de Cores (Frontend)

### Arquivo criado: `frontend/src/utils/colorUtils.js`

**Responsabilidade:** Converter posição no ranking (1-513) em cor HSL.

**Funções exportadas:**

| Função | Retorno | Uso |
|--------|---------|-----|
| `getRiskColor(rank, total=513)` | `hsl(H, S%, L%)` | Cor sólida para texto, bordas, orbs |
| `getRiskColorAlpha(rank, total, alpha=0.10)` | `hsla(...)` | Fundo semitransparente de cards |
| `getRiskColorDark(rank, total)` | `hsl(H, 85%, 30%)` | Bordas escuras, texto de badge |
| `getRiskLabel(rank, total)` | `{ label, level }` | Rótulo textual do nível de risco |

**Transição de cores:**
```
rank  1  →  hsl(120, 88%, 38%)  ●  Verde (Baixo risco)
rank 128  →  hsl(90,  94%, 40%)  ●  Verde-âmbar
rank 257  →  hsl(60,  95%, 42%)  ●  Âmbar (Risco moderado)
rank 385  →  hsl(30,  93%, 45%)  ●  Laranja (Risco alto)
rank 513  →  hsl(0,   90%, 48%)  ●  Vermelho (Risco crítico)
```

---

## PARTE 3 — Identidade Visual e Layout Global

### Arquivo criado: `frontend/src/components/Layout.jsx`

**Efeito Data.gov.uk:** 4 esferas difusas (`blur-3xl`) fixadas no fundo da aplicação:

| Orb | Cor | Posição | Animação |
|-----|-----|---------|----------|
| 1 | Dourado `#FBD87F` | Superior esquerdo | `orbDrift` 28s |
| 2 | Azul `#9ECFE8` | Superior direito | `orbDrift2` 34s |
| 3 | Verde `#A8D8B0` | Meio-baixo esquerda | `orbDrift` 40s reverso |
| 4 | Laranja `#F7B98B` | Rodapé direito | `orbDrift2` 22s |

**Propriedades CSS:** `fixed`, `z-index: -10`, `mix-blend-multiply`, `opacity: 15-25%`.
Não-interativas (`pointer-events: none`) e não-acessíveis (`aria-hidden`).

### Arquivo atualizado: `frontend/src/index.css`

Adições:
- `@keyframes orbDrift` e `orbDrift2` — movimento suave e não-linear das orbs
- Classes utilitárias: `.orb-drift-1/2/3/4`
- `.glass` — glassmorphism para cards sobre o fundo com orbs (`backdrop-filter: blur(12px)`)
- `.glass-dark` — variante escura
- Refinamentos tipográficos: `font-variant-numeric: tabular-nums`, `::selection` dourada
- Fonte Inter com variante itálica incluída no import Google Fonts

---

## PARTE 4 — Página de Ranking

### Arquivo reescrito: `frontend/src/pages/RankingPage.jsx`

**Melhorias:**
- Importa `getRiskColor`, `getRiskColorAlpha`, `getRiskColorDark`, `getRiskLabel` de `colorUtils.js` (HSL puro, substituindo `rankColor.js`)
- Skeleton loading com 12 `RowSkeleton` durante fetch do Firestore
- Orb de rank: esfera com gradiente radial + `box-shadow` colorido, baseado em `getRiskColor`
- Fundo de card em `getRiskColorAlpha(rank, total, 0.08)` — cada linha tem cor própria
- Filtros com `backdrop-filter: blur(8px)` (glassmorphism)
- Barra de gradiente decorativa verde→âmbar→vermelho no cabeçalho
- Suporte a `useMemo` nos filtros para performance com 513 itens
- Cleanup (`cancelled = true`) no `useEffect` para evitar setState em componente desmontado

### Arquivo atualizado: `frontend/src/App.jsx`

Mudanças:
- Import de `Layout from "./components/Layout"`
- `<Layout>` envolve `<Navbar>` + `<Suspense><Routes>` dentro de `<BrowserRouter>`
- As orbs ficam visíveis em **todas** as páginas da aplicação

---

## Rotas do Frontend

| Rota | Página | Acesso |
|------|--------|--------|
| `/` | `HomePage` | Público |
| `/ranking` | `RankingPage` | Público |
| `/alertas` | `AlertasPage` → `AlertDashboard` | Público |
| `/metodologia` | `MetodologiaPage` | Público |
| `/dashboard` | `DashboardPage` | Requer login |
| `/creditos` | `CreditosPage` | Requer login |
| `/politico/:colecao/:id` | `PoliticoPage` | Requer login |
| `/emenda/:id` | `EmendaPage` | Requer login |
| `/emendas` | `BancoEmendasPage` | Requer login |
| `/comparador` | `ComparadorPage` | Requer login |

---

## Arquitetura Completa do Repositório (pós Night Shift)

```
fiscalizapa/
├── engines/                       # Motor de Inteligência (Python / GCP)
│   ├── 01_bq_setup.py             # Cliente BigQuery + sanitize_and_load
│   ├── 02_ingest_ibge.py          # Ingestão IBGE → BQ fiscalizapa.ibge_municipios
│   ├── 03_ingest_emendas.py       # Ingestão Portal da Transparência → BQ
│   ├── 04_apply_views.py          # DDLs das 26 views forenses (Módulos 1-20 + 10-15)
│   ├── 05_sync_bodes.py           # ★ NOVO · Ponte BQ → Firestore (alertas_bodes)
│   ├── requirements.txt           # google-cloud-bigquery, firebase-admin, pandas, pyarrow
│   ├── legacy/                    # Scripts legados preservados
│   ├── scripts/                   # Scripts Node.js de ingestão legada
│   └── sql/                       # Schemas SQL Cloud SQL
│
├── frontend/                      # Vitrine Comercial (Vite + React + Tailwind v4)
│   └── src/
│       ├── App.jsx                # ★ ATUALIZADO · Layout global adicionado
│       ├── components/
│       │   ├── Layout.jsx         # ★ NOVO · Orbs data.gov.uk + wrapper global
│       │   ├── AlertDashboard.jsx # Painel Firestore alertas_bodes
│       │   └── PageSkeleton.jsx   # Skeleton para React.lazy
│       ├── pages/
│       │   ├── RankingPage.jsx    # ★ REESCRITO · HSL + glassmorphism
│       │   └── AlertasPage.jsx    # Página /alertas
│       ├── utils/
│       │   └── colorUtils.js      # ★ NOVO · getRiskColor HSL verde→vermelho
│       ├── lib/
│       │   ├── firebase.js        # Inicialização Firebase (fiscallizapa)
│       │   └── rankColor.js       # Legado (mantido por compatibilidade)
│       ├── styles/
│       │   └── tokens.css         # Design tokens CSS
│       └── index.css              # ★ ATUALIZADO · Orb animations + glass utils
│
├── .github/workflows/             # CI/CD GitHub Actions
├── firebase.json                  # Hosting → frontend/dist
├── README.md                      # Documentação da arquitetura
└── AUDITORIA_NIGHT_SHIFT.md       # ★ ESTE ARQUIVO
```

---

## Dependências adicionadas (nenhuma nova)

Todas as dependências já estavam instaladas. Os novos arquivos Python
usam apenas o que está em `engines/requirements.txt`:

```
google-cloud-bigquery>=3.25.0
firebase-admin>=6.5.0
pandas>=2.2.0
pyarrow>=15.0.0
```

O frontend usa apenas dependências já presentes em `frontend/package.json`
(`firebase/firestore`, `react-router-dom`).

---

## Próximos passos sugeridos

1. **Agendar `05_sync_bodes.py`** via Cloud Scheduler ou GitHub Actions (ex.: a cada 6h)
2. **Criar índice composto** no Firestore: `alertas_bodes` → `criadoEm DESC` (evita erro `failed-precondition`)
3. **Adicionar link "Alertas"** na `Navbar.jsx` apontando para `/alertas`
4. **Testar o build** localmente: `cd frontend && npm run build`

---

*Gerado automaticamente pelo Cursor Agent — Protocolo Night Shift · 08/04/2026*
