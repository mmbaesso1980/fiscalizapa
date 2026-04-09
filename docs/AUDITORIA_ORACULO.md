# AUDITORIA — Protocolo Oráculo (Tradução Cognitiva, Exportação e Geografia)
> A.S.M.O.D.E.U.S. · Fase 4 · Sessão executada em: **08/04/2026**
> Arquiteto responsável: Claude (Cursor Agent)

---

## Resumo Executivo

O **Protocolo Oráculo** transformou dados forenses brutos em comunicação humana (Gemini), materializou a distribuição geográfica das fraudes (BrazilHeatmap) e entregou ao usuário premium uma prova documental de investigação (PDF). O sistema agora fala, mostra e exporta.

---

## PARTE 1 — O Tradutor Forense (Gemini)

### Arquivos modificados:
- `engines/requirements.txt` — adicionado `google-generativeai>=0.8.0`

### Arquivo criado: `engines/07_gemini_translator.py`

**Responsabilidade:** Percorrer a coleção `alertas_bodes` do Firestore e enriquecer cada documento com o campo `explicacao_oraculo` — uma explicação em linguagem natural gerada pelo Gemini.

**Modelo padrão:** `gemini-1.5-flash` (rápido, econômico, preciso para análise forense)

**Prompt do Oráculo:**
> "Você é o A.S.M.O.D.E.U.S. Analise o alerta forense abaixo e gere uma explicação em português do Brasil, clara e direta, como se estivesse explicando para um cidadão comum ou jornalista. Máximo 3 frases curtas. Comece com 'Este alerta foi gerado porque' ou 'Foi detectado que'."

**Circuit Breakers:**

| Mecanismo | Configuração | Comportamento |
|-----------|-------------|---------------|
| Tamanho do lote | `BATCH_SIZE = 10` | Máximo de docs por ciclo |
| Pausa entre docs | `RATE_SLEEP_SEC = 1.5s` | Evita quota burst da API |
| Pausa entre lotes | `BATCH_SLEEP_SEC = 5.0s` | Respeita limites de RPM |
| Retry com backoff | `MAX_RETRIES = 3`, base `4s` | 4s → 8s → 16s em erros 429 |
| Deduplicação | Pula se `explicacao_oraculo` já existe | Evita reprocessamento |

**Variáveis de ambiente:**

| Variável | Descrição |
|----------|-----------|
| `GEMINI_API_KEY` | Chave do Google AI Studio |
| `FIRESTORE_SA_KEY` | JSON da conta de serviço Firestore (opcional) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Fallback ADC |

**Opções CLI:**
```bash
# Processar até 100 alertas (padrão)
python engines/07_gemini_translator.py

# Processar até 500 alertas
python engines/07_gemini_translator.py --limit 500

# Forçar regeneração de todos (mesmo os que já têm explicação)
python engines/07_gemini_translator.py --force

# Dry-run (imprime sem chamar Gemini nem salvar)
python engines/07_gemini_translator.py --dry-run

# Usar modelo mais capaz (melhor qualidade, mais caro)
python engines/07_gemini_translator.py --model gemini-1.5-pro
```

**Como obter a GEMINI_API_KEY:**
1. Acesse [Google AI Studio](https://aistudio.google.com/apikey)
2. Crie uma chave de API gratuita
3. `export GEMINI_API_KEY='AIzaSy...'`

**Integração no frontend:**
- `DossiePage.jsx` → `AlertRow` agora exibe `alerta.explicacao_oraculo` com o badge `✦ ORÁCULO` em itálico e borda colorida por severidade
- `MapaPage.jsx` → `AlertCard` também exibe a explicação do Oráculo quando disponível

---

## PARTE 2 — O Mapa da Fraude (BrazilHeatmap)

### Arquivos criados:
- `frontend/src/components/BrazilHeatmap.jsx`
- `frontend/src/pages/MapaPage.jsx`

### Arquivo atualizado: `frontend/src/App.jsx`
- Nova rota pública `/mapa` → `MapaPage` (lazy)

### Arquivo atualizado: `frontend/src/components/Navbar.jsx`
- Link "Mapa" adicionado entre "Alertas" e "Metodologia"

#### `BrazilHeatmap.jsx` — Tile Grid Map

**Técnica:** Tile grid map (cartograma) — 27 estados em posições geográficas aproximadas numa grade de 9×8 células de 58px cada.

**Vantagens sobre SVG geográfico:**
- Zero dependências externas (funciona sem `react-simple-maps`)
- Todas as células têm o mesmo tamanho (legível)
- Totalmente responsivo e interativo

**Estrutura de dados:**
```js
const CELLS = [
  { uf: "SP", name: "São Paulo", row: 5, col: 3, region: "SE" },
  { uf: "RJ", name: "Rio de Janeiro", row: 5, col: 5, region: "SE" },
  // ... todos os 27 estados
]
```

**Escala de cores (idêntica ao RankingPage — HSL verde→vermelho):**

| Alertas | Cor HSL | Significado |
|---------|---------|-------------|
| 0 | `#EDEBE8` (cinza) | Sem dados |
| 1–20% do máximo | `hsl(120, 80%, 42%)` | Baixo risco |
| 20–70% do máximo | `hsl(60-80, 85%, 44%)` | Risco moderado |
| 70–100% do máximo | `hsl(0-30, 90%, 46%)` pulsante | Risco crítico |

**Fonte de dados:**
- Primário: `getDocs(collection(db, "alertas_bodes"))` agrupado por campo `uf`
- Fallback: dados mock com distribuição realista se Firestore vazio

**Interatividade:**
- Hover → tooltip glassmorphism com nome do estado, contagem e região
- Click → seleciona estado + emite `onStateSelect(uf)` para componente pai
- Click no estado selecionado → deseleciona (toggle)

#### `MapaPage.jsx` — Rota `/mapa` (pública)

- Header "Mapa da Fraude" com subtítulo
- `BrazilHeatmap` em card glassmorphism
- Ao selecionar um estado → carrega alertas daquele UF via Firestore query
  - Com `orderBy("criadoEm", "desc")` + `limit(20)`
  - Fallback sem `orderBy` se índice não existir
- Cada alerta exibido com explicação do Oráculo (se disponível)

**Integração futura com `react-simple-maps`:**
A estrutura `{ uf, count, totalRisco }` que o `BrazilHeatmap` usa é compatível com qualquer renderer — basta substituir o tile grid por `<ComposableMap>` sem mudar a lógica de dados.

---

## PARTE 3 — O Gerador de Dossiê Oficial (PDF)

### Arquivos modificados:

#### `frontend/package.json`
```json
"html2pdf.js": "^0.10.2"
```

**Instalação:**
```bash
cd C:\Users\M.Baesso\fiscalizapa\frontend
npm install
```

#### `frontend/src/pages/DossiePage.jsx`

**Novas adições:**

1. **`DossiePDFContent`** — componente de conteúdo otimizado para PDF:
   - Renderizado em `position: absolute, left: -9999px` (fora da tela, no DOM)
   - `ref={pdfRef}` capturado pelo `html2pdf.js`
   - Sem efeitos visuais (sem blur, sem gradientes, sem canvas)
   - Inclui:
     - Cabeçalho com logo SVG do A.S.M.O.D.E.U.S.
     - Data de geração + nível de risco
     - Ficha do político (nome, partido, UF, score)
     - Grade de métricas (CEAP, emendas, presença)
     - Lista de alertas com badges de severidade
     - Explicações do Oráculo Gemini por alerta
     - Resumo textual da Rede de Conexões (Módulo 4)
     - Disclaimer legal completo

2. **`handleDownloadPDF`** — geração do PDF:
   ```js
   const { default: html2pdf } = await import("html2pdf.js"); // dynamic import
   await html2pdf().set(opts).from(pdfRef.current).save();
   ```
   - Dynamic import (evita incluir html2pdf no bundle principal)
   - `scale: 2` no html2canvas → PDF nítido em impressão A4
   - Nome do arquivo: `Dossie_{NomePolitico}_ASMODEUS.pdf`
   - Estado de loading: spinner animado durante geração

3. **Botão "📄 Baixar Dossiê Forense (PDF)":**
   - Visível **apenas** quando `unlocked === true` (dossiê desbloqueado e pago)
   - Design: fundo escuro `#1A1A2E` + texto dourado `#FBD87F`
   - Desabilitado durante geração com spinner inline
   - Proteção: o botão não aparece antes do pagamento dos 200 créditos ✓

4. **`AlertRow`** atualizado:
   - Exibe `alerta.explicacao_oraculo` com badge `✦ ORÁCULO` quando disponível
   - Borda lateral colorida por severidade na seção do Oráculo

---

## Todos os Arquivos Modificados/Criados

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `engines/requirements.txt` | Atualizado | + `google-generativeai>=0.8.0` |
| `engines/07_gemini_translator.py` | **Novo** | Tradutor Gemini com circuit breakers |
| `frontend/package.json` | Atualizado | + `html2pdf.js: ^0.10.2` |
| `frontend/src/components/BrazilHeatmap.jsx` | **Novo** | Tile grid map 27 estados + heatmap |
| `frontend/src/pages/MapaPage.jsx` | **Novo** | Página /mapa com filtro por estado |
| `frontend/src/pages/DossiePage.jsx` | Atualizado | + PDF export + Oráculo em AlertRow |
| `frontend/src/App.jsx` | Atualizado | + rota /mapa (lazy) |
| `frontend/src/components/Navbar.jsx` | Atualizado | + link "Mapa" na barra de navegação |

---

## Ações Obrigatórias Pós-Deploy

```bash
# 1. Instalar novas dependências (frontend)
cd C:\Users\M.Baesso\fiscalizapa\frontend
npm install

# 2. Instalar Gemini SDK (backend)
cd C:\Users\M.Baesso\fiscalizapa
.\engines\.venv\Scripts\Activate.ps1
pip install -r engines/requirements.txt

# 3. Configurar GEMINI_API_KEY (obter em aistudio.google.com)
export GEMINI_API_KEY='AIzaSy...'

# 4. Executar tradutor (after syncing bodes via 05_sync_bodes.py)
python engines/07_gemini_translator.py --dry-run   # testar
python engines/07_gemini_translator.py             # produção

# 5. Criar índice Firestore para MapaPage
#    alertas_bodes → uf ASC + criadoEm DESC
```

---

## Rotas Públicas (sem login)

| Rota | Novo? | Descrição |
|------|-------|-----------|
| `/` | — | Home |
| `/ranking` | — | Ranking HSL verde→vermelho |
| `/alertas` | — | Painel de alertas recentes |
| `/mapa` | ★ **NOVO** | Mapa da fraude por UF |
| `/metodologia` | — | Metodologia |

---

*Gerado automaticamente pelo Cursor Agent — Protocolo Oráculo · 08/04/2026*
