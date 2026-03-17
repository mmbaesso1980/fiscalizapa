#!/usr/bin/env node
/**
 * run-ingest-all-v2.js
 *
 * Script de ingestão completa de deputados federais e seus gastos.
 * Busca todos os 513 deputados da Câmara API, suas despesas (paginadas),
 * salva no Firestore e calcula um score de risco (0-100).
 *
 * Uso: cd functions && node run-ingest-all-v2.js [startYear] [endYear] [startPage]
 * Exemplo: node run-ingest-all-v2.js 2024 2025 1
 */

const admin = require("firebase-admin");
const axios = require("axios");

// Inicializar Firebase Admin
admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2";
const DELAY_MS = 200;
const ITEMS_PER_PAGE = 100;
const MAX_EXPENSE_PAGES = 20;

// Parse command line args
const args = process.argv.slice(2);
const START_YEAR = parseInt(args[0]) || 2024;
const END_YEAR = parseInt(args[1]) || 2025;
const START_PAGE = parseInt(args[2]) || 1;

console.log(`=== Ingestão v2 ===`);
console.log(`Anos: ${START_YEAR} a ${END_YEAR}`);
console.log(`Página inicial de deputados: ${START_PAGE}`);
console.log(`Projeto: fiscallizapa`);
console.log(`---`);

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Busca todos os deputados (paginado, 100 por página)
 */
async function fetchAllDeputados() {
  const all = [];
  let page = START_PAGE;
  while (true) {
    console.log(`Buscando deputados página ${page}...`);
    try {
      const resp = await axios.get(`${CAMARA_API}/deputados`, {
        params: { pagina: page, itens: ITEMS_PER_PAGE, ordem: "ASC", ordenarPor: "nome" },
        timeout: 30000,
      });
      const dados = resp.data.dados;
      if (!dados || dados.length === 0) break;
      all.push(...dados);
      console.log(`  -> ${dados.length} deputados (total: ${all.length})`);
      if (dados.length < ITEMS_PER_PAGE) break;
      page++;
      await delay(DELAY_MS);
    } catch (err) {
      console.error(`Erro ao buscar deputados página ${page}: ${err.message}`);
      break;
    }
  }
  return all;
}

/**
 * Busca todas as despesas de um deputado para um ano (paginado)
 */
async function fetchExpenses(deputadoId, year) {
  const expenses = [];
  for (let page = 1; page <= MAX_EXPENSE_PAGES; page++) {
    try {
      const resp = await axios.get(`${CAMARA_API}/deputados/${deputadoId}/despesas`, {
        params: { ano: year, pagina: page, itens: ITEMS_PER_PAGE, ordem: "DESC", ordenarPor: "dataDocumento" },
        timeout: 30000,
      });
      const dados = resp.data.dados;
      if (!dados || dados.length === 0) break;
      expenses.push(...dados);
      if (dados.length < ITEMS_PER_PAGE) break;
      await delay(DELAY_MS);
    } catch (err) {
      console.error(`  Erro despesas dep=${deputadoId} ano=${year} pag=${page}: ${err.message}`);
      break;
    }
  }
  return expenses;
}

/**
 * Calcula score de risco (0-100) baseado nas despesas
 */
function calculateRiskScore(expenses, avgSpendingSoFar) {
  if (!expenses || expenses.length === 0) return 0;

  let score = 0;

  // Total de gastos
  const totalSpending = expenses.reduce((sum, e) => sum + (parseFloat(e.valorDocumento) || 0), 0);

  // 1. Concentração de fornecedores (top 3 como % do total)
  const supplierTotals = {};
  for (const e of expenses) {
    const supplier = e.nomeFornecedor || "Desconhecido";
    supplierTotals[supplier] = (supplierTotals[supplier] || 0) + (parseFloat(e.valorDocumento) || 0);
  }
  const sortedSuppliers = Object.values(supplierTotals).sort((a, b) => b - a);
  const top3Total = sortedSuppliers.slice(0, 3).reduce((s, v) => s + v, 0);
  const concentrationPct = totalSpending > 0 ? (top3Total / totalSpending) * 100 : 0;

  if (concentrationPct > 70) score += 30;
  else if (concentrationPct > 50) score += 20;
  else if (concentrationPct > 30) score += 10;

  // 2. Gasto total comparado à média
  if (avgSpendingSoFar > 0) {
    const ratio = totalSpending / avgSpendingSoFar;
    if (ratio > 2) score += 20;
    else if (ratio > 1.5) score += 10;
  }

  // 3. Transações de alto valor (>R$50k) — cada uma adiciona 5 pts, max 20
  const highValueCount = expenses.filter(e => (parseFloat(e.valorDocumento) || 0) > 50000).length;
  score += Math.min(highValueCount * 5, 20);

  // 4. Número de fornecedores distintos (menos = maior risco)
  const distinctSuppliers = Object.keys(supplierTotals).length;
  if (distinctSuppliers < 5) score += 15;
  else if (distinctSuppliers < 10) score += 10;

  return Math.min(score, 100);
}

/**
 * Salva despesas como subcollection
 */
async function saveExpenses(deputadoId, expenses) {
  const collRef = db.collection("deputados_federais").doc(String(deputadoId)).collection("gastos");

  // Batch write in chunks of 500 (Firestore limit)
  const BATCH_LIMIT = 500;
  for (let i = 0; i < expenses.length; i += BATCH_LIMIT) {
    const chunk = expenses.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const expense of chunk) {
      const docId = String(expense.codDocumento || `${expense.ano}_${expense.mes}_${i}`);
      const docRef = collRef.doc(docId);
      batch.set(docRef, {
        ano: expense.ano || null,
        mes: expense.mes || null,
        tipoDespesa: expense.tipoDespesa || "",
        codDocumento: expense.codDocumento || null,
        tipoDocumento: expense.tipoDocumento || "",
        codTipoDocumento: expense.codTipoDocumento || null,
        dataDocumento: expense.dataDocumento || null,
        numDocumento: expense.numDocumento || "",
        valorDocumento: parseFloat(expense.valorDocumento) || 0,
        urlDocumento: expense.urlDocumento || "",
        fornecedorNome: expense.nomeFornecedor || "",
        cnpjCpf: expense.cnpjCpfFornecedor || "",
        valorLiquido: parseFloat(expense.valorLiquido) || 0,
        valorGlosa: parseFloat(expense.valorGlosa) || 0,
        numRessarcimento: expense.numRessarcimento || "",
        codLote: expense.codLote || null,
        parcela: expense.parcela || null,
      }, { merge: true });
    }
    await batch.commit();
  }
}

/**
 * Main
 */
async function main() {
  const startTime = Date.now();

  // 1. Buscar todos os deputados
  const deputados = await fetchAllDeputados();
  console.log(`\nTotal de deputados encontrados: ${deputados.length}\n`);

  if (deputados.length === 0) {
    console.log("Nenhum deputado encontrado. Encerrando.");
    process.exit(0);
  }

  // Track totals for average calculation
  const processedTotals = [];
  let successCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < deputados.length; idx++) {
    const dep = deputados[idx];
    const depId = String(dep.id);
    console.log(`[${idx + 1}/${deputados.length}] ${dep.nome} (${dep.siglaPartido}-${dep.siglaUf}) ID=${depId}`);

    try {
      // 2. Buscar despesas para cada ano
      let allExpenses = [];
      for (let year = START_YEAR; year <= END_YEAR; year++) {
        const yearExpenses = await fetchExpenses(dep.id, year);
        console.log(`  ${year}: ${yearExpenses.length} despesas`);
        allExpenses.push(...yearExpenses);
      }

      // 3. Salvar deputado no Firestore
      const depDocRef = db.collection("deputados_federais").doc(depId);
      await depDocRef.set({
        nome: dep.nome || "",
        partido: dep.siglaPartido || "",
        uf: dep.siglaUf || "",
        cargo: "Deputado Federal",
        fotoUrl: dep.urlFoto || "",
        idCamara: dep.id,
        email: dep.email || "",
        legislatura: dep.idLegislatura || null,
        updated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 4. Salvar despesas como subcollection
      if (allExpenses.length > 0) {
        await saveExpenses(depId, allExpenses);
        console.log(`  Salvas ${allExpenses.length} despesas no Firestore`);
      }

      // 5. Calcular score de risco
      const totalSpending = allExpenses.reduce((sum, e) => sum + (parseFloat(e.valorDocumento) || 0), 0);
      processedTotals.push(totalSpending);
      const avgSoFar = processedTotals.length > 1
        ? processedTotals.slice(0, -1).reduce((s, v) => s + v, 0) / (processedTotals.length - 1)
        : 0;

      const riskScore = calculateRiskScore(allExpenses, avgSoFar);

      // 6. Salvar score no documento do deputado
      await depDocRef.update({
        score: riskScore,
        riskScore,
        totalGastos: totalSpending,
        totalDespesas: allExpenses.length,
      });

      console.log(`  Score de risco: ${riskScore} | Total gastos: R$${totalSpending.toFixed(2)}`);
      successCount++;
    } catch (err) {
      console.error(`  ERRO processando ${dep.nome}: ${err.message}`);
      errorCount++;
    }

    // Delay entre deputados
    await delay(DELAY_MS);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== Ingestão Completa ===`);
  console.log(`Sucesso: ${successCount} | Erros: ${errorCount}`);
  console.log(`Tempo total: ${elapsed} minutos`);
  process.exit(0);
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
