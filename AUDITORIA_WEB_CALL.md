# AUDITORIA — Protocolo Web Call (Automação, Retenção e Alertas Ativos)
> A.S.M.O.D.E.U.S. · Fase 5 · Sessão executada em: **08/04/2026**
> Arquiteto responsável: Claude (Cursor Agent)

---

## Resumo Executivo

O **Protocolo Web Call** completou o ciclo de vida da plataforma: o sistema agora lembra dos usuários (Cofre), grita quando detecta ameaças (Web Call) e opera de forma totalmente autônoma toda madrugada (CI/CD Cron). A máquina não dorme.

---

## PARTE 1 — O Cofre do Arquiteto (Histórico e Retenção)

### Arquivos criados:
- `frontend/src/pages/PerfilPage.jsx`

### Arquivos atualizados:
- `frontend/src/pages/DossiePage.jsx` — desbloqueio persistente no Firestore
- `frontend/src/App.jsx` — nova rota `/perfil` (lazy, protegida)
- `frontend/src/components/Navbar.jsx` — link "🗄️ Meu Cofre" no dropdown

---

### `PerfilPage.jsx` — Rota `/perfil`

**Design:** glassmorphism cards com backdrop-filter, badge de créditos dinâmico (verde/âmbar/vermelho), foto do usuário (Firebase Auth ou avatar com iniciais).

**Fonte de dados:** subcoleção `usuarios/{uid}/dossies_desbloqueados`

**Cada card de dossiê exibe:**
- Foto do político (ou avatar com inicial)
- Nome, partido, UF
- Data de desbloqueio formatada em pt-BR
- Botão "🔓 Acessar Dossiê" → `/dossie/:id` (sem paywall)

**Estado vazio:** CTA ilustrado com link para o Ranking.

---

### `DossiePage.jsx` — Desbloqueio Persistente

**Antes (apenas sessionStorage):**
```js
sessionStorage.setItem(sessionKey(id), "1");
setUnlocked(true);
```

**Depois (sessionStorage + Firestore):**
```js
// 1. Debita créditos via transação atômica
await deductCredits(CUSTO_DOSSIE);

// 2. Grava na subcoleção (acesso permanente)
await setDoc(
  doc(db, "usuarios", user.uid, "dossies_desbloqueados", id),
  {
    politicoId:     id,
    nomePolitico:   "...",
    partido:        "...",
    uf:             "...",
    urlFoto:        "...",
    desbloqueadoEm: serverTimestamp(),
    creditsGastos:  200,
  },
  { merge: true },
);

// 3. Salva no sessionStorage para esta sessão (cache rápido)
sessionStorage.setItem(sessionKey(id), "1");
```

**Verificação ao carregar a página:**
```js
// Fast path: sessionStorage
if (sessionStorage.getItem(sessionKey(id)) === "1") { setUnlocked(true); return; }

// Persistent path: Firestore
const snap = await getDoc(doc(db, "usuarios", uid, "dossies_desbloqueados", id));
if (snap.exists()) {
  sessionStorage.setItem(sessionKey(id), "1"); // popula o cache
  setUnlocked(true);
}
```

Resultado: **o usuário nunca paga duas vezes pelo mesmo dossiê**, mesmo após fechar o browser.

---

### Estrutura da subcoleção Firestore

```
usuarios/
  {uid}/
    dossies_desbloqueados/        ← nova subcoleção
      {politicoId}/
        politicoId:     string
        nomePolitico:   string
        partido:        string
        uf:             string
        urlFoto:        string | null
        desbloqueadoEm: Timestamp
        creditsGastos:  number
```

---

## PARTE 2 — O Motor de Notificação (08_web_call.py)

### Arquivo criado: `engines/08_web_call.py`

**Responsabilidade:** Vigia ativo que varre `alertas_bodes` nas últimas 24h procurando alertas de criticidade ALTA, cruza com usuários que monitoram aquele parlamentar e dispara notificações estruturadas.

**Fluxo:**
```
Firestore alertas_bodes (últimas 24h, ALTA)
         ↓
Cruzamento com usuarios.watchlist[]
         ↓
Construção do payload (Webhook + Email)
         ↓
Emissão no terminal (produção: SendGrid / n8n / Zapier)
         ↓
Marca alerta como notificado_em
```

**Estrutura do payload:**
```json
{
  "event":     "asmodeus.alerta.alta_severidade",
  "timestamp": "2026-04-08T03:12:00Z",
  "recipient": {
    "uid":   "abc123",
    "email": "usuario@email.com",
    "nome":  "João Silva"
  },
  "alerta": {
    "id":            "alert_abc",
    "tipo":          "CEAP_EMPRESA_NOVA",
    "criticidade":   "ALTA",
    "parlamentar":   "Dep. Fulano de Tal",
    "partido":       "XPTO",
    "uf":            "SP",
    "valor_suspeito": 48500.00,
    "descricao":     "..."
  },
  "oraculo": {
    "explicacao": "Este alerta foi gerado porque o deputado gastou R$ 48.500 em empresa fundada há 12 dias.",
    "gerado_por": "gemini-1.5-flash · A.S.M.O.D.E.U.S. v2"
  },
  "cta": {
    "dossie_url":  "https://transparenciabr.app/dossie/abc",
    "ranking_url": "https://transparenciabr.app/ranking"
  }
}
```

**Circuit Breakers:**

| Mecanismo | Valor | Função |
|-----------|-------|--------|
| `MAX_ALERTS_PER_RUN` | 200 | Limita queries ao Firestore |
| `--hours` | 24 (padrão) | Janela temporal configurável |
| `--min-sev` | ALTA (padrão) | Filtra severidade mínima |
| `notificado_em` field | Automático | Evita duplicidade de notificações |
| `--force` | Flag | Força renotificação |
| `--dry-run` | Flag | Simula sem gravar |

**Para ativar notificações reais em produção:**
```python
# Substituir _emit_notification() por:
import sendgrid
sg = sendgrid.SendGridAPIClient(os.environ["SENDGRID_API_KEY"])
sg.send(Mail(to_emails=payload["recipient"]["email"], ...))

# OU: Webhook (n8n, Zapier, Make)
import requests
requests.post(os.environ["WEBHOOK_URL"], json=payload, timeout=10)
```

**Como executar:**
```bash
python engines/08_web_call.py                      # padrão: 24h, ALTA
python engines/08_web_call.py --hours 48           # janela de 48h
python engines/08_web_call.py --min-sev MEDIA      # inclui alertas MEDIA
python engines/08_web_call.py --dry-run            # simula
python engines/08_web_call.py --force              # renotifica todos
```

---

## PARTE 3 — O Coração Autônomo (asmodeus_cron.yml)

### Arquivo criado: `.github/workflows/asmodeus_cron.yml`

**Schedule:** `cron: "0 3 * * *"` → **03:00 UTC = meia-noite em Brasília (BRT)**

**Trigger manual:** `workflow_dispatch` com inputs:
- `dry_run: true/false` — executa em modo simulação
- `engines_only: "03 04"` — para execução seletiva

**Sequência de jobs:**

```
ubuntu-latest (Python 3.11)
    │
    ├─ 📥 Checkout
    ├─ 🐍 Setup Python 3.11 + cache pip
    ├─ 📦 pip install -r engines/requirements.txt
    ├─ 🔐 Configurar credenciais GCP (JSON raw ou base64)
    ├─ ⚙️  Modo de execução (dry-run ou produção)
    │
    ├─ 🏛️  ENGINE 03 — ingest_emendas.py    [continue-on-error: false] ─ bloqueia se falhar
    ├─ 🔬 ENGINE 04 — apply_views.py       [continue-on-error: false] ─ bloqueia se falhar
    ├─ 🐐 ENGINE 05 — sync_bodes.py        [continue-on-error: false] ─ bloqueia se falhar
    ├─ 🔮 ENGINE 07 — gemini_translator.py [continue-on-error: true]  ─ não bloqueia (quota)
    ├─ 🚨 ENGINE 08 — web_call.py          [continue-on-error: true]  ─ não bloqueia (best-effort)
    │
    ├─ 📊 Relatório de execução (always)
    └─ 🧹 Limpar credenciais (always)
```

**Secrets necessários no GitHub:**

```
Settings → Secrets and variables → Actions → New repository secret

GCP_CREDENTIALS   → JSON da conta de serviço GCP
                    (suporta raw JSON e base64 para evitar limite de 65k chars)

GEMINI_API_KEY    → Chave do Google AI Studio
                    (https://aistudio.google.com/apikey)
```

**Como adicionar os secrets:**
```bash
# Via GitHub CLI
gh secret set GCP_CREDENTIALS < path/to/sa-key.json
gh secret set GEMINI_API_KEY --body "AIzaSy..."

# Via interface web:
# https://github.com/mmbaesso1980/fiscalizapa/settings/secrets/actions
```

**Executar manualmente:**
```bash
# Via GitHub CLI
gh workflow run asmodeus_cron.yml

# Em modo dry-run
gh workflow run asmodeus_cron.yml --field dry_run=true

# Ver execuções
gh run list --workflow=asmodeus_cron.yml
```

---

## Todos os Arquivos Criados/Modificados

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `frontend/src/pages/PerfilPage.jsx` | **Novo** | O Cofre do Arquiteto — dossiês adquiridos |
| `frontend/src/pages/DossiePage.jsx` | Atualizado | Desbloqueio persistente (Firestore) + verificação no load |
| `frontend/src/App.jsx` | Atualizado | + rota `/perfil` (lazy, protegida) |
| `frontend/src/components/Navbar.jsx` | Atualizado | + link "🗄️ Meu Cofre" no dropdown |
| `engines/08_web_call.py` | **Novo** | Motor de notificação com payload Webhook |
| `.github/workflows/asmodeus_cron.yml` | **Novo** | Pipeline autônomo diário às 03:00 UTC |

---

## Watchlist — Como Habilitar Monitoramento Personalizado

Para que `08_web_call.py` notifique usuários específicos por político, adicione o campo `watchlist` ao documento Firestore do usuário:

```json
// usuarios/{uid}
{
  "email": "usuario@email.com",
  "watchlist": ["abc123", "def456"],  ← IDs dos políticos monitorados
  "creditos": 200,
  "isAdmin": false
}
```

Futuramente, adicionar um botão "🔔 Monitorar este político" na `DossiePage` que faz `arrayUnion(id)` neste campo.

---

## Estado Final do Pipeline (Todos os Engines)

```
Portal da Transparência API
        │
        ▼
03_ingest_emendas.py  ──→  BigQuery: fiscalizapa.emendas_parlamentares
                                │
04_apply_views.py  ────────────→  BigQuery: views forenses (Ficha Limpa, Elegibilidade)
                                │
05_sync_bodes.py  ─────────────→  Firestore: alertas_bodes  ←── 06_ocr_notas.py (CEAP)
                                │
07_gemini_translator.py  ──────→  Firestore: alertas_bodes.explicacao_oraculo
                                │
08_web_call.py  ───────────────→  Notificações → usuarios monitorando
```

---

*Gerado automaticamente pelo Cursor Agent — Protocolo Web Call · 08/04/2026*
