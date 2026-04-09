# FiscalizaPA (Protocolo A.S.M.O.D.E.U.S.)

Sistema de fiscalização e monitoramento de políticas públicas. O repositório separa de forma explícita a **vitrine** (Firebase / front-end) do **motor de dados** (BigQuery / Python).

## Arquitetura

### `/frontend` — Vitrine comercial

- **Stack:** Vite, React, React Router, **Tailwind CSS v4** (`@tailwindcss/vite`), Firebase (client SDK).
- **Papel:** interface leve; consome alertas e dados já preparados (ex.: Firestore / funções).

Comandos úteis (a partir de `frontend/`):

```bash
npm install
npm run dev
npm run build
```

O build de produção é publicado pelo Firebase Hosting (`firebase.json` → `frontend/dist`).

### `/engines` — Motor de inteligência

- **Stack:** Python, **Google Cloud BigQuery** (projeto GCP `projeto-codex-br`), pandas, pyarrow.
- **Papel:** ingestões, saneamento de tipos e cargas pesadas; não misturar com a lógica da vitrine.

#### Ambiente virtual e dependências

Na raiz do repositório (Linux / macOS):

```bash
cd engines
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

No Windows (PowerShell):

```powershell
cd engines
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Credenciais GCP: defina `GOOGLE_APPLICATION_CREDENTIALS` apontando para o JSON da service account com permissão no BigQuery do projeto `projeto-codex-br`. Opcionalmente use `GCP_PROJECT_ID` para sobrescrever o projeto padrão do cliente.

### Outros diretórios

- **`/functions`** — Cloud Functions (Node.js / Firebase).
- **`/engines/scripts`** — scripts Node legados de ingestão (ex.: emendas) que reutilizam dependências instaladas em `functions/`.
- **`/engines/sql`** — artefatos SQL (ex.: schema Cloud SQL).
- **`/engines/legacy`** — scripts de deploy legados.

## Documentação adicional

- `frontend/README.md` — detalhes do app Vite/React.
- `COMET_MISSAO.md` — contexto ampliado do projeto (quando aplicável).
