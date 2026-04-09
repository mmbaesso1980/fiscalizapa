# Relatório — Operação Ressurreição (concluída)

**Data:** 9 de abril de 2026  
**Status:** Operação finalizada conforme as 10 tarefas solicitadas.

## Resumo executivo

Foram corrigidos bugs críticos de parsing e exibição de valores CEAP (incluindo o total inflado por concatenação string+número), alinhamento UF (Mato Grosso / Maranhão / MS), sincronização entre mapa de calor e lista de alertas em modo demonstração, ajustes visuais claros no dossiê e na home, texto neutro para IDH, fallback legível para fornecedores ausentes nas notas, deploy de Cloud Functions, build do frontend, deploy de hosting e registro em Git.

## Itens entregues

1. **CEAP / “16 trilhões”** — `parseCamaraValorReais` em `frontend/src/utils/moneyCamara.js`; uso em `DossiePage.jsx` (`fmtBRL`, `buildCeapData`), `PoliticoPage.jsx` (soma e normalização de despesas) e normalização server-side em `getAuditoriaPolitico` (`functions/index.js`).
2. **Siglas MT / MA / MS** — Dicionário forçado por texto em `EmendasAba.jsx` e reforço em `SocialContext.jsx` (`normalizeUF` + `ufFromNomeCompleto`).
3. **Mapa** — `BRAZIL_HEATMAP_MOCK_COUNTS` exportado; `onMockModeChange`; `MapaPage.jsx` preenche lista ilustrativa quando o heatmap está em mock e o Firestore não retorna documentos, alinhando contagem ao tooltip.
4. **Dossiê (layout claro)** — Fundo `#f8fafc`, cards brancos com borda slate e sombra leve; aba gabinete e botões sem blocos pretos; gradientes escuros substituídos por slate.
5. **Home** — Bloco “O que você pode comprar” reposicionado acima do footer; hero seguido direto do Top/Bottom 10; grid de estatísticas após o ranking.
6. **Fornecedor nas notas** — `PoliticoPage.jsx` e `AlertasFretamento.jsx`: mensagem *Fornecedor não informado (Dados da Câmara)* com estilo solicitado onde aplicável.
7. **IDH** — `SocialContext.jsx`: título “Contexto Social Local”; paleta azul/cinza sem vermelho de “alerta”.
8. **Deploy functions** — `npm install` + `npx firebase deploy --only functions` concluído com sucesso (incluindo `getAuditoriaPolitico`).
9. **Build frontend** — `npm run build` (Vite) concluído sem erros.
10. **Git + hosting** — Commit e push na branch `main`; `npx firebase deploy --only hosting` executado após o commit (artefatos em `frontend/dist`).

## Observação

Em modo demonstração do mapa, os cartões da lista são explicitamente marcados como ilustrativos na `explicacao_oraculo`, para não confundir com alertas reais da coleção `alertas_bodes`.
