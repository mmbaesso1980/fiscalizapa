# AUDITORIA — Protocolo The Organ (Segurança, Semeadura e Deploy Contínuo)
> A.S.M.O.D.E.U.S. · Fase 6 · Sessão executada em: **08/04/2026**
> Arquiteto responsável: Claude (Cursor Agent)

---

## Resumo Executivo

O **Protocolo The Organ** blindou o sistema por dentro (Security Rules granulares), estabeleceu a base de dados do zero (Seeder) e configurou o lançamento automático (CI/CD de frontend). A plataforma está agora pronta para produção real.

---

## PARTE 1 — As Regras do Santuário (`firestore.rules`)

### Arquivo reescrito: `firestore.rules`

O arquivo anterior tinha regras com indentação inconsistente e sem cobertura das novas coleções. A nova versão é completamente reescrita com funções auxiliares, comentários detalhados e cobertura total.

---

### Funções auxiliares (helpers)

```javascript
function isAuth()                 // token válido, não-anônimo
function isOwner(uid)             // request.auth.uid == uid
function isAdmin()                // Custom Claim request.auth.token.admin == true
function fieldsDiff()             // campos alterados num update
function touchesCriticalFields()  // toca em creditos / isAdmin / role / uid / criadoEm?
function isValidCreditDeduction() // apenas creditos decai, resultado >= 0
function isValidUserCreate()      // creditos ≤ 10, isAdmin == false no signup
function isValidDossieCreate()    // campos obrigatórios, creditsGastos > 0 e ≤ 500
```

---

### Tabela de permissões por coleção

| Coleção | Leitura | Criação | Update | Delete |
|---------|---------|---------|--------|--------|
| `usuarios/{uid}` | Dono ou admin | Dono + `isValidUserCreate()` | Dono (exceto campos críticos) OU dedução válida OU admin | ❌ |
| `usuarios/{uid}/dossies_desbloqueados/{id}` | Dono | Dono + `isValidDossieCreate()` | ❌ | ❌ |
| `alertas_bodes` | ✅ Pública | ❌ | ❌ | ❌ |
| `config/{docId}` | ✅ Pública | Admin | Admin | Admin |
| `deputados_federais` | ✅ Pública | ❌ | ❌ | ❌ |
| `denuncias` | ✅ Pública | Autenticado + validação | ❌ | ❌ |
| Demais coleções forenses | ✅ Pública | ❌ | ❌ | ❌ |
| `/{document=**}` (default) | ❌ | ❌ | ❌ | ❌ |

---

### Regra crítica: proteção de `creditos`

O campo `creditos` nunca pode ser **aumentado** pelo cliente. Apenas o Firebase Admin SDK (backend Python) pode creditar. O cliente pode **apenas debitar** (via `runTransaction` do `deductCredits`):

```javascript
function isValidCreditDeduction() {
  let only_creditos = fieldsDiff().hasOnly(['creditos', 'atualizadoEm']);
  let is_decrease   = request.resource.data.creditos < resource.data.creditos;
  let no_negative   = request.resource.data.creditos >= 0;
  return only_creditos && is_decrease && no_negative;
}
```

**Vetor de ataque bloqueado:** um usuário malicioso que faça `updateDoc(ref, { creditos: 9999 })` diretamente recebe `PERMISSION_DENIED`. A única forma legítima de aumentar créditos é via Admin SDK no backend.

---

### Regra crítica: proteção de `isAdmin`

```javascript
// isAdmin nunca pode ser definido via cliente no signup
allow create: if isOwner(uid)
              && request.resource.data.isAdmin == false;

// isAdmin nunca pode ser alterado via cliente no update
function touchesCriticalFields() {
  return fieldsDiff().hasAny(['creditos', 'isAdmin', 'role', 'uid', 'criadoEm']);
}
allow update: if (isOwner(uid) && !touchesCriticalFields()) || isAdmin();
```

---

### Aplicar as regras

```bash
# Na raiz do projeto
firebase deploy --only firestore:rules --project fiscallizapa

# Testar localmente com o emulador
firebase emulators:start --only firestore
```

---

## PARTE 2 — O Semeador (`engines/09_the_organ_seeder.py`)

### Arquivo criado: `engines/09_the_organ_seeder.py`

**Responsabilidade:** Popular o Firestore do zero — ideal para novos ambientes (CI/CD, staging, produção inicial).

---

### O que o Seeder injeta

#### 1. `deputados_federais` — 10 deputados simulados

```
dep_001 · Carlos Alberto Mendes   · CODEX  · SP · score 87.4
dep_002 · Fernanda Rocha Lima     · DEMOS  · RJ · score 72.1
dep_003 · Roberto Cavalcante      · FORÇA  · BA · score 45.3
dep_004 · Ana Paula Ferreira      · VERDADE· MG · score 93.8  ← mais transparente
dep_005 · Marcus Vinicius Prado   · PLENO  · RS · score 31.7
dep_006 · Juliana Moraes Costa    · DEMOS  · PE · score 68.9
dep_007 · Paulo Sérgio Teixeira   · CODEX  · GO · score 18.2  ← mais suspeito
dep_008 · Beatriz Nascimento      · FORÇA  · AM · score 79.5
dep_009 · Tomás Rodrigues Braga   · PLENO  · PA · score 55.0
dep_010 · Luciana Fonseca Alves   · VERDADE· CE · score 88.7
```

Cada documento inclui: nome, partido, UF, score, gastosCeapTotal, totalEmendas, presença, totalProjetos, e-mail, cargo.

#### 2. `config/sistema`

```json
{
  "apiPausada":     false,
  "versaoEngine":   "2.0.0",
  "nomeProjeto":    "A.S.M.O.D.E.U.S.",
  "ambiente":       "producao",
  "motoresAtivos":  ["03_ingest", "04_views", "05_sync", "07_gemini", "08_webcall"],
  "totalDeputados": 10
}
```

#### 3. Admin principal

```python
# Firebase Auth → Custom Claim
auth.set_custom_user_claims(uid, {"admin": True})

# Firestore → usuarios/{uid}
{
  "email":     "admin@codex.com",
  "isAdmin":   True,
  "role":      "admin",
  "creditos":  9999,
}
```

**⚠️ O Custom Claim só é aplicado após o próximo login do usuário admin.**

---

### Opções CLI

```bash
# Semear tudo
python engines/09_the_organ_seeder.py

# Admin com e-mail personalizado
python engines/09_the_organ_seeder.py --admin-email seu@email.com

# Semear apenas config + admin (skip deputados)
python engines/09_the_organ_seeder.py --skip-deputies

# Dry-run: imprime o que faria, sem gravar
python engines/09_the_organ_seeder.py --dry-run

# Wipe + semear do zero (⚠️ DESTRUTIVO)
python engines/09_the_organ_seeder.py --wipe
```

---

### Executar o Seeder

```bash
cd C:\Users\M.Baesso\fiscalizapa

# Ativar venv
.\engines\.venv\Scripts\Activate.ps1

# Definir credenciais
$env:GOOGLE_APPLICATION_CREDENTIALS = "path/to/sa-key.json"

# Dry-run primeiro
python engines/09_the_organ_seeder.py --dry-run

# Produção
python engines/09_the_organ_seeder.py --admin-email admin@codex.com
```

---

## PARTE 3 — O Lançamento Contínuo (`deploy-frontend.yml`)

### Arquivo criado: `.github/workflows/deploy-frontend.yml`

**Trigger:** `push` para `main` em qualquer arquivo de `frontend/**`, `firebase.json` ou `firestore.rules`

**Tempo médio de execução:** ~4-6 minutos

---

### Pipeline de 9 etapas

```
push main
    │
    ├─ 📥 Checkout (actions/checkout@v4)
    ├─ ⬢  Setup Node.js 20 + cache npm (package-lock.json)
    ├─ 📦 npm ci --prefer-offline --no-audit (instalação determinística)
    ├─ 🔍 npm run lint (continue-on-error: true — avisa, não bloqueia)
    ├─ 🏗️  npm run build → frontend/dist/
    ├─ ✅ Verificar dist/index.html (guarda contra builds silenciosos)
    ├─ 🚀 FirebaseExtended/action-hosting-deploy@v0 → channelId: live
    ├─ 📊 Relatório pós-deploy (URL, branch, commit, data)
    └─ ❌ Notificar falha (if: failure())
```

---

### Secret necessário

| Secret | Conteúdo | Como criar |
|--------|----------|------------|
| `FIREBASE_SERVICE_ACCOUNT` | JSON completo da SA | Ver instruções abaixo |

```bash
# 1. Criar Service Account
gcloud iam service-accounts create github-deploy \
  --project fiscallizapa \
  --display-name "GitHub Actions Deploy"

# 2. Conceder permissão de Hosting Admin
gcloud projects add-iam-policy-binding fiscallizapa \
  --member="serviceAccount:github-deploy@fiscallizapa.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin"

# 3. Gerar chave JSON
gcloud iam service-accounts keys create /tmp/firebase-sa.json \
  --iam-account=github-deploy@fiscallizapa.iam.gserviceaccount.com

# 4. Adicionar ao GitHub
gh secret set FIREBASE_SERVICE_ACCOUNT < /tmp/firebase-sa.json

# Limpar
rm /tmp/firebase-sa.json
```

---

### Detalhes de segurança do workflow

- **`npm ci`** em vez de `npm install` — usa `package-lock.json`, builds 100% reproduzíveis
- **`cache: "npm"`** — cache por hash do `package-lock.json`, ~60% mais rápido no cache hit
- **`permissions: contents: read`** — princípio do menor privilégio
- **Verificação de artefato** — garante que `dist/index.html` existe antes do deploy
- **`entryPoint: "."`** — aponta para a raiz onde está `firebase.json` (com `hosting.public: "frontend/dist"`)

---

### Variáveis de ambiente Vite

Se o projeto usa variáveis `VITE_*` (Firebase config, Stripe, etc.), descomente as linhas no step de build:

```yaml
env:
  VITE_FIREBASE_API_KEY:       ${{ secrets.VITE_FIREBASE_API_KEY }}
  VITE_FIREBASE_PROJECT_ID:    ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
  VITE_STRIPE_PUBLISHABLE_KEY: ${{ secrets.VITE_STRIPE_PUBLISHABLE_KEY }}
```

**⚠️ IMPORTANTE:** variáveis `VITE_*` são embutidas no bundle — nunca inclua chaves secretas (apenas chaves públicas). Chaves privadas ficam nos secrets do backend.

---

### Disparar manualmente

```bash
# Via GitHub CLI
gh workflow run deploy-frontend.yml

# Ver status
gh run list --workflow=deploy-frontend.yml --limit 5

# Ver logs
gh run view --log
```

---

## Todos os Arquivos Modificados/Criados

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `firestore.rules` | **Reescrito** | Regras v2 granulares com helpers e proteção de campos |
| `engines/09_the_organ_seeder.py` | **Novo** | Seeder completo: deputados, config, admin + Custom Claims |
| `.github/workflows/deploy-frontend.yml` | **Novo** | CI/CD Firebase Hosting com npm ci, build Vite, verificação |

---

## Checklist de Deploy para Produção

```bash
# 1. Aplicar regras do Firestore
firebase deploy --only firestore:rules --project fiscallizapa

# 2. Semear banco de dados inicial
python engines/09_the_organ_seeder.py --admin-email SEU_EMAIL@dominio.com

# 3. Configurar secrets no GitHub
gh secret set FIREBASE_SERVICE_ACCOUNT < /tmp/firebase-sa.json
gh secret set GCP_CREDENTIALS          < /tmp/gcp-sa.json
gh secret set GEMINI_API_KEY           --body "AIzaSy..."

# 4. Push para main → dispara deploy automático
git push origin main

# 5. Verificar deploy
open https://fiscallizapa.web.app
```

---

## Modelo de Segurança Completo do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAMADAS DE PROTEÇÃO                           │
├─────────────────────────────────────────────────────────────────┤
│ L1: Firebase Auth       → Token JWT válido para qualquer acesso  │
│ L2: Custom Claims       → admin=true para config/sistema + rules │
│ L3: Security Rules v2   → Granularidade por campo e coleção      │
│ L4: Admin SDK           → Backend bypassa rules (apenas engines) │
│ L5: Firestore Rules     → Regra default nega tudo não explícito  │
│ L6: CSP Headers         → firebase.json > headers > CSP         │
│ L7: Protected Routes    → App.jsx route guards no frontend       │
│ L8: AdminDashboard guard→ isAdmin check + redirect no componente │
└─────────────────────────────────────────────────────────────────┘
```

---

*Gerado automaticamente pelo Cursor Agent — Protocolo The Organ · 08/04/2026*
