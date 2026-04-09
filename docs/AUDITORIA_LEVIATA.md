# AUDITORIA — Protocolo Leviatã (Cognição e Monetização)
> A.S.M.O.D.E.U.S. · Fase 2 · Sessão executada em: **08/04/2026**
> Arquiteto responsável: Claude (Cursor Agent)

---

## Resumo Executivo

O **Protocolo Leviatã** implementou os 3 pilares de **Cognição** (OCR inteligente de documentos) e **Monetização** (economia interna de créditos e paywall premium). O motor agora lê notas fiscais com IA, garante que novos usuários recebam créditos iniciais, e a tela `DossiePage` implementa o primeiro bloqueio real de conteúdo premium do ecossistema.

---

## PARTE 1 — Máquina de OCR (Document AI)

### Arquivos modificados:
- `engines/requirements.txt` — adicionado `google-cloud-documentai>=2.24.0`

### Arquivo criado: `engines/06_ocr_notas.py`

**Responsabilidade:** Processar lotes de PDFs/imagens de notas CEAP com o **Document AI Invoice Parser** e salvar metadados estruturados no BigQuery.

**Campos extraídos por documento:**

| Campo BQ | Entity Document AI | Descrição |
|----------|--------------------|-----------|
| `supplier_tax_id` | `supplier_tax_id` | CNPJ do fornecedor (apenas dígitos) |
| `total_amount` | `total_amount` | Valor total em FLOAT64 |
| `line_items_json` | `line_item.*` | Descrições dos itens (JSON array) |
| `purchase_date` | `purchase_date` | Data da nota |
| `invoice_id` | `invoice_id` | Número da nota |
| `confidence` | média das entidades | Score médio de confiança do OCR |
| `erro` | — | Mensagem de erro (NULL se sucesso) |

**Destino BigQuery:** `fiscalizapa.ceap_ocr_extractions`

**Circuit Breakers implementados:**

| Mecanismo | Configuração | Comportamento |
|-----------|-------------|---------------|
| Tamanho do lote | `BATCH_SIZE = 50` | Máximo de docs por chamada à API |
| Pausa entre lotes | `BATCH_PAUSE_SEC = 3.0s` | Evita quota burst no Document AI |
| Timeout por doc | `REQUEST_TIMEOUT_SEC = 120s` | Evita travamento em PDFs corrompidos |
| Erros consecutivos | `MAX_CONSECUTIVE_ERRORS = 5` | Aborta lote após N falhas seguidas |
| try/except granular | por documento | Uma falha não cancela os demais |
| Salva por lote | após cada lote | Não perde dados de lotes anteriores se falhar |

**Variáveis de ambiente:**

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Sim | Conta de serviço com acesso ao Document AI e BigQuery |
| `DOCUMENT_AI_PROCESSOR_ID` | Sim (ou `--processor`) | Resource name do Invoice Parser |

**Formatos suportados:** `.pdf`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.tiff`, `.bmp`, `.webp`

### Como executar:
```bash
# Configurar credenciais
export GOOGLE_APPLICATION_CREDENTIALS=/caminho/sa-key.json
export DOCUMENT_AI_PROCESSOR_ID="projects/projeto-codex-br/locations/us/processors/XXXX"

# Ativar ambiente virtual
source engines/.venv/bin/activate       # Linux/macOS
.\engines\.venv\Scripts\Activate.ps1   # Windows PowerShell

# Instalar nova dependência
pip install -r engines/requirements.txt

# Dry-run (sem gravar, exibe amostra)
python engines/06_ocr_notas.py \
  --input-dir /caminho/notas_ceap \
  --dry-run

# Produção: processar até 500 documentos
python engines/06_ocr_notas.py \
  --input-dir /caminho/notas_ceap \
  --max-docs 500

# Projeto personalizado
python engines/06_ocr_notas.py \
  --input-dir /tmp/pdfs \
  --gcp-project projeto-codex-br \
  --location us
```

**Como obter o `PROCESSOR_ID` no GCP:**
1. Acesse: [Google Cloud Console > Document AI](https://console.cloud.google.com/ai/document-ai)
2. Crie um processador do tipo **"Invoice Parser"**
3. Copie o resource name completo: `projects/{project}/locations/{location}/processors/{id}`

---

## PARTE 2 — Economia Interna (Firebase Auth + Créditos)

### Arquivos modificados:

#### `frontend/src/hooks/useAuth.js` — Reescrito com Firestore

**Mudanças principais:**

1. **Créditos iniciais para novos usuários:**
   ```js
   // registerWithEmail agora escreve no Firestore:
   await setDoc(doc(db, "usuarios", uid), { creditos: 10, plano: "free", ... })
   ```

2. **`ensureUserDoc(u)`** — função interna chamada a cada login:
   - Se o documento `usuarios/{uid}` não existe → cria com `creditos: 10`
   - Se já existe → atualiza apenas campos de perfil (`email`, `nome`, `photoURL`)
   - Garante que logins via Google/GitHub também recebem créditos iniciais

3. **`onSnapshot` em tempo real:**
   ```js
   onSnapshot(doc(db, "usuarios", user.uid), snap => {
     setCredits(snap.data()?.creditos ?? 0)
   })
   ```
   O saldo reflete alterações instantâneas (compras, deduções).

4. **`deductCredits(amount)` exposta pelo hook:**
   ```js
   const deductCredits = async (amount) => {
     await runTransaction(db, async (tx) => {
       const current = snap.data()?.creditos ?? 0
       if (current < amount) throw new Error("Saldo insuficiente")
       tx.update(ref, { creditos: current - amount })
     })
   }
   ```
   Transação atômica — protege contra race conditions (ex: dois cliques simultâneos).

5. **Compatibilidade mantida:** Cloud Functions legadas (`getUser`, `registerUserSession`, `validateUserSession`) ainda são chamadas em background.

#### `frontend/src/components/CreditWallet.jsx` — Novo

**Badge inteligente de créditos** para a Navbar:

| Saldo | Cor | Glow |
|-------|-----|------|
| ≥ 100 | Dourado | Sim (premium) |
| 20–99 | Verde | Sim (saudável) |
| 1–19  | Laranja | Sim (atenção) |
| 0     | Vermelho | Sim (urgente) |

- Animação de **bump** quando o saldo muda
- Tooltip com texto descritivo do saldo
- Seta `↑` quando saldo zerado (convida a recarregar)
- Click → `/creditos`

#### `frontend/src/components/Navbar.jsx` — Atualizado

O `<span>` inline de créditos foi substituído por `<CreditWallet credits={credits} compact />`.

---

## PARTE 3 — O Dossiê Premium (Paywall)

### Arquivo criado: `frontend/src/pages/DossiePage.jsx`

**Rota:** `/dossie/:id` (protegida — requer login)

**Custo de desbloqueio:** `200 créditos`

**Conteúdo do Dossiê (visível após desbloqueio):**
1. Cabeçalho do político com foto, partido, UF, score de risco e cor HSL dinâmica
2. Grade de métricas: CEAP total, emendas, presença, projetos
3. Lista de alertas forenses (da coleção `alertas_bodes` filtrada por `parlamentar_id`)
4. Seção OCR (aponta para tabela `ceap_ocr_extractions` do Motor)
5. Link para perfil completo (`/politico/deputados_federais/:id`)

**Lógica do Paywall:**

```
usuário logado?
  └─ NÃO → redirect para /
  └─ SIM → verificar sessionStorage[dossie_unlocked_{id}]
      └─ JÁ DESBLOQUEADO → mostrar conteúdo direto (sem gastar créditos novamente)
      └─ NÃO DESBLOQUEADO → verificar credits
          ├─ credits >= 200 → botão "Desbloquear Dossiê — 200 créditos"
          │     └─ onClick: deductCredits(200) + sessionStorage + setUnlocked(true)
          └─ credits < 200  → botão "Comprar Pacote de Auditoria" → /creditos
```

**Design do Paywall:**
- `backdropFilter: blur(18px)` sobre o conteúdo borrado (`filter: blur(6px)`)
- Glassmorphism: `background: rgba(255,255,255,0.55)`
- Card central com ícone de cadeado, saldo atual, botão de ação
- Feedback visual de saldo (verde se suficiente, vermelho se insuficiente)
- Estado de loading durante a transação (`unlocking`)

### Arquivo atualizado: `frontend/src/App.jsx`

```js
const DossiePage = lazy(() => import("./pages/DossiePage"));
// ...
<Route path="/dossie/:id" element={<DossiePage />} />  // dentro do bloco user ?
```

---

## Fluxo Completo de Monetização

```
Novo usuário (Google/GitHub/e-mail)
  └─ ensureUserDoc() → Firestore: usuarios/{uid} { creditos: 10 }
     └─ onSnapshot → CreditWallet exibe "10 cr" na Navbar

Usuário navega para /dossie/:id
  └─ Paywall exibido (10 < 200)
     └─ "Comprar Pacote de Auditoria" → /creditos
        └─ Compra concluída (Cloud Function / Stripe)
           └─ Firestore: creditos += 200
              └─ onSnapshot → CreditWallet atualiza instantaneamente

Usuário retorna para /dossie/:id
  └─ 210 >= 200 → botão "Desbloquear Dossiê"
     └─ deductCredits(200) → Firestore transaction
        └─ creditos: 210 → 10
           └─ sessionStorage salvo → não gasta novamente nesta sessão
              └─ Conteúdo revelado (blur removido)
```

---

## Arquivos Criados/Modificados nesta Fase

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `engines/requirements.txt` | Atualizado | + `google-cloud-documentai>=2.24.0` |
| `engines/06_ocr_notas.py` | **Novo** | OCR Document AI + Circuit Breakers → BQ |
| `frontend/src/hooks/useAuth.js` | **Reescrito** | Firestore credits, `deductCredits`, `ensureUserDoc` |
| `frontend/src/components/CreditWallet.jsx` | **Novo** | Badge de créditos com cores dinâmicas + bump animation |
| `frontend/src/components/Navbar.jsx` | Atualizado | Usa `<CreditWallet>` no lugar do span inline |
| `frontend/src/pages/DossiePage.jsx` | **Novo** | Auditoria Profunda + Paywall glassmorphism |
| `frontend/src/App.jsx` | Atualizado | + rota `/dossie/:id` (lazy) |

---

## Índice Firestore — Ação Necessária

Para que `DossiePage` filtre alertas por `parlamentar_id` com `orderBy("criadoEm")`, crie o índice composto no Console Firebase:

**Coleção:** `alertas_bodes`
**Campos:** `parlamentar_id ASC`, `criadoEm DESC`

Ou clique no link de erro que aparecerá no console do browser na primeira consulta.

---

## Próximos Passos Sugeridos

1. **Criar processador Document AI** no projeto `projeto-codex-br` (tipo: Invoice Parser)
2. **Adicionar link "Dossiê"** nos cards da `RankingPage` e `PoliticoPage`
3. **Integrar Stripe / Gateway de pagamento** para processar compras em `/creditos`
4. **Agendar `06_ocr_notas.py`** via Cloud Scheduler após download das notas CEAP
5. **Criar índice Firestore** `alertas_bodes`: `parlamentar_id ASC` + `criadoEm DESC`

---

*Gerado automaticamente pelo Cursor Agent — Protocolo Leviatã · 08/04/2026*
