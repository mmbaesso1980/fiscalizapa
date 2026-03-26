#!/usr/bin/env node
/**
 * run-ingest-presenca-real.js
 * Multi-year presence ingest: 2023-2026 consolidated + per-year breakdown.
 * Uses events API (codTipoEvento=110) for deliberative sessions.
 *
 * Stores in Firestore:
 *   politicos/{id}.presencaPct (consolidated %)
 *   politicos/{id}.sessoesTotal (consolidated total)
 *   politicos/{id}.sessoesPresente (consolidated present)
 *   politicos/{id}.presencaAnual (object with per-year data)
 *   politicos/{id}.presencaClassificacao
 *
 * Usage: node run-ingest-presenca-real.js
 */
const admin = require("firebase-admin");
const axios = require("axios");
if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();
const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2";
const DELAY_MS = 500;
const COD_SESSAO_DELIBERATIVA = 110;
const YEARS = [2023, 2024, 2025, 2026];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchSessoesTotais(year) {
  const sessoes = [];
  let page = 1;
  const hoje = new Date();
  const dataFim = year < hoje.getFullYear() ? `${year}-12-31` : hoje.toISOString().split('T')[0];
  while (page <= 10) {
    try {
      const resp = await axios.get(`${CAMARA_API}/eventos`, {
        params: {
          dataInicio: `${year}-02-01`,
          dataFim,
          codTipoEvento: COD_SESSAO_DELIBERATIVA,
          itens: 100,
          pagina: page,
          ordem: "ASC",
          ordenarPor: "dataHoraInicio"
        },
        headers: { Accept: "application/json" },
        timeout: 30000,
      });
      const dados = resp.data.dados;
      if (!dados || dados.length === 0) break;
      sessoes.push(...dados);
      if (dados.length < 100) break;
      page++;
      await delay(DELAY_MS);
    } catch (err) {
      console.error(`Erro sessoes totais ${year} pag ${page}: ${err.message}`);
      break;
    }
  }
  const realizadas = sessoes.filter(s => s.situacao === "Encerrada" || s.situacao === "Finalizada");
  console.log(`  Sessoes deliberativas ${year}: ${realizadas.length}`);
  return realizadas;
}

async function fetchEventosDeputado(deputadoId, year) {
  const eventos = [];
  let page = 1;
  const hoje = new Date();
  const dataFim = year < hoje.getFullYear() ? `${year}-12-31` : hoje.toISOString().split('T')[0];
  while (page <= 20) {
    try {
      const resp = await axios.get(`${CAMARA_API}/deputados/${deputadoId}/eventos`, {
        params: {
          dataInicio: `${year}-02-01`,
          dataFim,
          pagina: page,
          itens: 100,
          ordem: "ASC",
          ordenarPor: "dataHoraInicio"
        },
        headers: { Accept: "application/json" },
        timeout: 30000,
      });
      const dados = resp.data.dados;
      if (!dados || dados.length === 0) break;
      eventos.push(...dados);
      if (dados.length < 100) break;
      page++;
      await delay(DELAY_MS);
    } catch (err) {
      console.error(`  Erro eventos dep=${deputadoId} ${year}: ${err.message}`);
      break;
    }
  }
  return eventos;
}

async function main() {
  console.log(`=== Ingestao Presenca Real Multi-Ano ==`);
  console.log(`Anos: ${YEARS.join(', ')}\n`);

  // 1. Fetch total sessions per year
  const sessoesPorAno = {};
  const sessaoIdsPorAno = {};
  let totalGeralSessoes = 0;
  for (const year of YEARS) {
    const sessoes = await fetchSessoesTotais(year);
    sessoesPorAno[year] = sessoes;
    sessaoIdsPorAno[year] = new Set(sessoes.map(s => s.id));
    totalGeralSessoes += sessoes.length;
    await delay(DELAY_MS);
  }
  console.log(`\nTotal sessoes deliberativas (todos anos): ${totalGeralSessoes}\n`);

  if (totalGeralSessoes === 0) {
    console.log("Nenhuma sessao deliberativa encontrada.");
    process.exit(1);
  }

  // 2. Get all deputados
  const snap = await db.collection("deputados_federais")
    .limit(520).get();
  if (snap.empty) {
    console.log("Nenhum deputado encontrado.");
    process.exit(1);
  }
  console.log(`Deputados: ${snap.docs.length}\n`);

  let processed = 0;
  for (let i = 0; i < snap.docs.length; i++) {
    const doc = snap.docs[i];
    const depId = doc.id;
    const nome = doc.data().nome || depId;
    console.log(`[${i+1}/${snap.docs.length}] ${nome}`);

    let totalPresente = 0;
    let totalSessoes = 0;
    const presencaAnual = {};

    for (const year of YEARS) {
      const sessoesAno = sessoesPorAno[year];
      if (sessoesAno.length === 0) continue;

      const eventos = await fetchEventosDeputado(depId, year);
      const sessaoIds = sessaoIdsPorAno[year];

      const sessoesDeputado = eventos.filter(e =>
        sessaoIds.has(e.id) ||
        (e.descricaoTipo && e.descricaoTipo.includes("Deliberativa"))
      );
      const sessoesUnicas = new Set(sessoesDeputado.map(s => s.id));
      const presentes = sessoesUnicas.size;
      const total = sessoesAno.length;
      const pct = total > 0 ? Number(((presentes / total) * 100).toFixed(1)) : 0;

      presencaAnual[year] = { presentes, total, pct };
      totalPresente += presentes;
      totalSessoes += total;

      console.log(`  ${year}: ${presentes}/${total} (${pct}%)`);
      await delay(DELAY_MS);
    }

    const presencaPct = totalSessoes > 0
      ? Number(((totalPresente / totalSessoes) * 100).toFixed(1))
      : 0;

    let presencaClassificacao;
    if (presencaPct >= 90) presencaClassificacao = "Excelente";
    else if (presencaPct >= 70) presencaClassificacao = "Bom";
    else if (presencaPct >= 50) presencaClassificacao = "Regular";
    else if (presencaPct >= 30) presencaClassificacao = "Ruim";
    else presencaClassificacao = "Pessimo";

    await db.collection("deputados_federais").doc(depId).set({
      sessoesPresente: totalPresente,
      sessoesTotal: totalSessoes,
      presencaPct,
      presencaClassificacao,
      presencaAnual,
      presencaEstimativa: false,
      presencaUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`  CONSOLIDADO: ${totalPresente}/${totalSessoes} (${presencaPct}%) - ${presencaClassificacao}`);
    processed++;
  }

  console.log(`\n=== Presenca Real Concluida: ${processed} deputados ===`);
  process.exit(0);
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
