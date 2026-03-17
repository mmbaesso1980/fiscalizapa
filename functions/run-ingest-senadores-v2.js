#!/usr/bin/env node
/**
 * run-ingest-senadores-v2.js
 *
 * Script de ingestao completa de senadores e seus gastos (CEAPS).
 * Busca todos os 81 senadores da API do Senado, suas despesas,
 * salva no Firestore e calcula um score de risco (0-100).
 *
 * Uso: cd functions && node run-ingest-senadores-v2.js [startYear] [endYear]
 * Exemplo: node run-ingest-senadores-v2.js 2024 2025
 *
 * Resolve Issue #3
 */
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

const SENADO_API = "https://legis.senado.leg.br/dadosabertos";
const DELAY_MS = 500;

const args = process.argv.slice(2);
const START_YEAR = parseInt(args[0]) || 2024;
const END_YEAR = parseInt(args[1]) || 2025;

console.log(`=== Ingestao Senadores v2 ===`);
console.log(`Anos: ${START_YEAR} a ${END_YEAR}`);
console.log(`Projeto: fiscallizapa`);
console.log(`---`);

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Busca todos os senadores em exercicio
 */
async function fetchAllSenadores() {
  console.log("Buscando lista de senadores...");
  try {
    const resp = await axios.get(`${SENADO_API}/senador/lista/atual`, {
      headers: { Accept: "application/json" },
      timeout: 30000,
    });
    const parlamentares = resp.data?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
    console.log(`  -> ${parlamentares.length} senadores encontrados`);
    return parlamentares;
  } catch (err) {
    console.error(`Erro ao buscar senadores: ${err.message}`);
    return [];
  }
}

/**
 * Busca despesas (CEAPS) de um senador para um ano
 */
async function fetchExpenses(senadorId, year) {
  const expenses = [];
  try {
    const resp = await axios.get(
      `${SENADO_API}/senador/${senadorId}/despesas`,
      {
        params: { ano: year },
        headers: { Accept: "application/json" },
        timeout: 30000,
      }
    );
    const despesas = resp.data?.DespesasParlamentar?.Parlamentar?.Despesas?.Despesa || [];
    if (Array.isArray(despesas)) {
      expenses.push(...despesas);
    } else if (despesas) {
      expenses.push(despesas);
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error(`  Erro despesas sen=${senadorId} ano=${year}: ${err.message}`);
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

  const totalSpending = expenses.reduce((sum, e) => {
    return sum + (parseFloat(e.VALOR_REEMBOLSADO || e.valorDocumento || 0));
  }, 0);

  // 1. Concentracao de fornecedores
  const supplierTotals = {};
  for (const e of expenses) {
    const supplier = e.FORNECEDOR || e.nomeFornecedor || "Desconhecido";
    supplierTotals[supplier] = (supplierTotals[supplier] || 0) +
      (parseFloat(e.VALOR_REEMBOLSADO || e.valorDocumento || 0));
  }
  const sortedSuppliers = Object.values(supplierTotals).sort((a, b) => b - a);
  const top3Total = sortedSuppliers.slice(0, 3).reduce((s, v) => s + v, 0);
  const concentrationPct = totalSpending > 0 ? (top3Total / totalSpending) * 100 : 0;
  if (concentrationPct > 70) score += 30;
  else if (concentrationPct > 50) score += 20;
  else if (concentrationPct > 30) score += 10;

  // 2. Gasto total comparado a media
  if (avgSpendingSoFar > 0) {
    const ratio = totalSpending / avgSpendingSoFar;
    if (ratio > 2) score += 20;
    else if (ratio > 1.5) score += 10;
  }

  // 3. Transacoes de alto valor (>R$50k)
  const highValueCount = expenses.filter(e =>
    (parseFloat(e.VALOR_REEMBOLSADO || e.valorDocumento || 0)) > 50000
  ).length;
  score += Math.min(highValueCount * 5, 20);

  // 4. Poucos fornecedores distintos = maior risco
  const distinctSuppliers = Object.keys(supplierTotals).length;
  if (distinctSuppliers < 5) score += 15;
  else if (distinctSuppliers < 10) score += 10;

  return Math.min(score, 100);
}

/**
 * Salva despesas como subcollection
 */
async function saveExpenses(senadorId, expenses) {
  const collRef = db.collection("senadores").doc(String(senadorId)).collection("gastos");
  const BATCH_LIMIT = 500;
  for (let i = 0; i < expenses.length; i += BATCH_LIMIT) {
    const chunk = expenses.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const expense of chunk) {
      const docId = `${expense.ANO || "na"}_${expense.MES || "na"}_${expense.TIPO_DESPESA || "na"}_${i}`;
      const docRef = collRef.doc(docId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100));
      batch.set(docRef, {
        ano: expense.ANO || expense.ano || null,
        mes: expense.MES || expense.mes || null,
        tipoDespesa: expense.TIPO_DESPESA || expense.tipoDespesa || "",
        dataDocumento: expense.DATA || expense.dataDocumento || null,
        valorDocumento: parseFloat(expense.VALOR_REEMBOLSADO || expense.valorDocumento || 0),
        nomeFornecedor: expense.FORNECEDOR || expense.nomeFornecedor || "",
        cnpjCpfFornecedor: expense.CNPJ_CPF || expense.cnpjCpfFornecedor || "",
        detalhamento: expense.DETALHAMENTO || "",
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

  const senadores = await fetchAllSenadores();
  console.log(`\nTotal de senadores: ${senadores.length}\n`);

  if (senadores.length === 0) {
    console.log("Nenhum senador encontrado. Encerrando.");
    process.exit(0);
  }

  const processedTotals = [];
  let successCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < senadores.length; idx++) {
    const sen = senadores[idx];
    const id = sen.IdentificacaoParlamentar?.CodigoParlamentar;
    const nome = sen.IdentificacaoParlamentar?.NomeParlamentar;
    const partido = sen.IdentificacaoParlamentar?.SiglaPartidoParlamentar || "";
    const estado = sen.IdentificacaoParlamentar?.UfParlamentar || "";
    const foto = sen.IdentificacaoParlamentar?.UrlFotoParlamentar || "";
    const email = sen.IdentificacaoParlamentar?.EmailParlamentar || "";

    if (!id || !nome) {
      console.log(`[${idx + 1}] Senador sem ID/nome, pulando...`);
      continue;
    }

    const senId = String(id);
    console.log(`[${idx + 1}/${senadores.length}] ${nome} (${partido}-${estado}) ID=${senId}`);

    try {
      let allExpenses = [];
      for (let year = START_YEAR; year <= END_YEAR; year++) {
        const yearExpenses = await fetchExpenses(id, year);
        console.log(`  ${year}: ${yearExpenses.length} despesas`);
        allExpenses.push(...yearExpenses);
        await delay(DELAY_MS);
      }

      // Salvar senador no Firestore
      const senDocRef = db.collection("senadores").doc(senId);
      await senDocRef.set({
        nome,
        partido,
        uf: estado,
        cargo: "Senador",
        fotoUrl: foto,
        idSenado: id,
        email,
        updated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Salvar despesas
      if (allExpenses.length > 0) {
        await saveExpenses(senId, allExpenses);
        console.log(`  Salvas ${allExpenses.length} despesas no Firestore`);
      }

      // Calcular score de risco
      const totalSpending = allExpenses.reduce((sum, e) =>
        sum + (parseFloat(e.VALOR_REEMBOLSADO || e.valorDocumento || 0)), 0
      );
      processedTotals.push(totalSpending);
      const avgSoFar = processedTotals.length > 1
        ? processedTotals.slice(0, -1).reduce((s, v) => s + v, 0) / (processedTotals.length - 1)
        : 0;
      const riskScore = calculateRiskScore(allExpenses, avgSoFar);

      await senDocRef.update({
        score: riskScore,
        riskScore,
        totalGastos: totalSpending,
        totalDespesas: allExpenses.length,
      });

      console.log(`  Score: ${riskScore} | Total: R$${totalSpending.toFixed(2)}`);
      successCount++;
    } catch (err) {
      console.error(`  ERRO processando ${nome}: ${err.message}`);
      errorCount++;
    }

    await delay(DELAY_MS);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== Ingestao Senadores Completa ===`);
  console.log(`Sucesso: ${successCount} | Erros: ${errorCount}`);
  console.log(`Tempo total: ${elapsed} minutos`);
  process.exit(0);
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
