# ASMODEUS — Ingestão de Ranking Externo

Script: `ingest-ranking-org.mjs`  
Fonte: [ranking.org.br/ranking/politicos](https://ranking.org.br/ranking/politicos)  
Destino: Firestore → coleção `ranking_externo`

## Setup (uma vez só)

```bash
cd fiscalizapa
npm install playwright firebase-admin
npx playwright install chromium
```

## Variáveis de ambiente

Exporte ou crie `.env`:

```bash
export FIREBASE_PROJECT_ID="seu-project-id"
export FIREBASE_CLIENT_EMAIL="firebase-adminsdk@projeto.iam.gserviceaccount.com"
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

A chave privada vem do arquivo JSON do Service Account do Firebase Console  
(`Configurações do projeto → Contas de serviço → Gerar nova chave privada`).

## Rodar

```bash
node scripts/ingest-ranking-org.mjs
```

## O que acontece

1. Playwright abre ranking.org.br no Chromium headless
2. Aplica filtro "Deputado Federal" automaticamente
3. Pagina todos os resultados com delay gentil (1.2s/página)
4. Salva backup JSON em `scripts/ranking-backup-YYYY-MM-DD.json`
5. Limpa `ranking_externo` no Firestore
6. Ingere todos os deputados com: rank, nome, partido, uf, nota, fonte, timestamp

## Estrutura do documento gravado

```json
{
  "rank_externo": 1,
  "nome": "TABATA AMARAL",
  "nome_normalizado": "TABATA AMARAL",
  "partido": "PSB",
  "uf": "SP",
  "nota_ranking_org": 9.2,
  "slug_ranking_org": "tabata-amaral",
  "cargo": "Deputado Federal",
  "fonte": "ranking.org.br",
  "atualizado_em": "<server timestamp>"
}
```

## Próximo passo

Atualizar `HomePage.jsx` para ler de `ranking_externo`  
ao invés de `deputados_federais` enquanto o índice ASMODEUS não está pronto.
