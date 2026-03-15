/**
 * weekly-ingest-logic.js
 * Logica de ingestao semanal automatica
 * Chamado pelo onSchedule weeklyIngest no index.js
 * Resolve Issue #5
 */

const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CAMARA_BASE = "https://dadosabertos.camara.leg.br/api/v2";
const SENADO_BASE = "https://legis.senado.leg.br/dadosabertos";
const DELAY_MS = 1000;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Atualizar lista de deputados
async function updateDeputados() {
  console.log("[Weekly] Atualizando deputados...");
  let page = 1, total = 0;
  while (true) {
    const data = await fetchJSON(
      `${CAMARA_BASE}/deputados?pagina=${page}&itens=100&ordem=ASC&ordenarPor=nome`
    );
    const deps = data.dados;
    if (!deps || deps.length === 0) break;
    const batch = db.batch();
    for (const dep of deps) {
      const ref = db.collection("politicos").doc(String(dep.id));
      batch.set(ref, {
        nome: dep.nome,
        siglaPartido: dep.siglaPartido,
        siglaUf: dep.siglaUf,
        urlFoto: dep.urlFoto || "",
        tipo: "deputados_federais",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
    total += deps.length;
    if (deps.length < 100) break;
    page++;
    await delay(DELAY_MS);
  }
  console.log(`[Weekly] ${total} deputados atualizados`);
  return total;
}

// Atualizar lista de senadores
async function updateSenadores() {
  console.log("[Weekly] Atualizando senadores...");
  const data = await fetchJSON(`${SENADO_BASE}/senador/lista/atual`);
  const parlamentares = data?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
  const batch = db.batch();
  let total = 0;
  for (const p of parlamentares) {
    const id = p.IdentificacaoParlamentar?.CodigoParlamentar;
    if (!id) continue;
    const ref = db.collection("politicos").doc(`sen_${id}`);
    batch.set(ref, {
      nome: p.IdentificacaoParlamentar?.NomeParlamentar || "",
      siglaPartido: p.IdentificacaoParlamentar?.SiglaPartidoParlamentar || "",
      siglaUf: p.IdentificacaoParlamentar?.UfParlamentar || "",
      urlFoto: p.IdentificacaoParlamentar?.UrlFotoParlamentar || "",
      tipo: "senadores",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    total++;
  }
  await batch.commit();
  console.log(`[Weekly] ${total} senadores atualizados`);
  return total;
}

// Atualizar despesas recentes (ultimo mes)
async function updateDespesasRecentes() {
  console.log("[Weekly] Atualizando despesas recentes...");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Buscar deputados do Firestore
  const snap = await db.collection("politicos")
    .where("tipo", "==", "deputados_federais")
    .limit(520)
    .get();

  let totalDespesas = 0;
  for (const doc of snap.docs) {
    const depId = doc.id;
    try {
      const url = `${CAMARA_BASE}/deputados/${depId}/despesas?ano=${year}&mes=${month}&itens=100&ordem=DESC&ordenarPor=dataDocumento`;
      const data = await fetchJSON(url);
      const despesas = data.dados || [];
      if (despesas.length > 0) {
        const batch = db.batch();
        for (const d of despesas) {
          const despRef = db.collection("politicos").doc(depId)
            .collection("despesas").doc(`${year}_${month}_${d.codDocumento || Math.random()}`);
          batch.set(despRef, {
            tipoDespesa: d.tipoDespesa || "",
            valor: d.valorDocumento || 0,
            valorLiquido: d.valorLiquido || 0,
            fornecedor: d.nomeFornecedor || "",
            cnpjFornecedor: d.cnpjCpfFornecedor || "",
            mes: month,
            ano: year,
            dataDocumento: d.dataDocumento || null
          }, { merge: true });
        }
        await batch.commit();
        totalDespesas += despesas.length;
      }
    } catch (err) {
      // Skip individual errors
    }
    await delay(500);
  }
  console.log(`[Weekly] ${totalDespesas} despesas atualizadas`);
  return totalDespesas;
}

// Registrar execucao
async function logExecution(results) {
  await db.collection("system_logs").add({
    type: "weekly_ingest",
    results,
    executedAt: admin.firestore.FieldValue.serverTimestamp(),
    success: true
  });
}

// Funcao principal exportada
async function runWeeklyIngest() {
  console.log("=== Weekly Ingest Started ===");
  const startTime = Date.now();
  const results = {};

  try {
    results.deputados = await updateDeputados();
    await delay(2000);
    results.senadores = await updateSenadores();
    await delay(2000);
    results.despesas = await updateDespesasRecentes();
  } catch (err) {
    console.error("Weekly ingest error:", err);
    results.error = err.message;
  }

  results.elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1) + " min";
  await logExecution(results);
  console.log("=== Weekly Ingest Complete ===", results);
  return results;
}

module.exports = { runWeeklyIngest };
