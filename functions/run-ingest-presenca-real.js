#!/usr/bin/env node
/**
 * run-ingest-presenca-real.js
 * Assiduidade REAL: cruza sessoes do plenario com participacao individual.
 *
 * 1) Busca total sessoes deliberativas (codTipoEvento=110)
 * 2) Para cada deputado, busca seus eventos e filtra deliberativas
 * 3) presencaScore = (presentes / total) * 100
 *
 * Uso: node run-ingest-presenca-real.js [year]
 */
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2";
const DELAY_MS = 400;
const COD_SESSAO_DELIBERATIVA = 110;

const args = process.argv.slice(2);
const YEAR = parseInt(args[0]) || 2024;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchSessoesTotais(year) {
  const sessoes = [];
  let page = 1;
  while (page <= 10) {
    try {
      const resp = await axios.get(`${CAMARA_API}/eventos`, {
        params: {
          dataInicio: `${year}-01-01`,
          dataFim: `${year}-12-31`,
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
      console.error(`Erro sessoes totais pag ${page}: ${err.message}`);
      break;
    }
  }
  const realizadas = sessoes.filter(s => s.situacao === "Encerrada");
  console.log(`Total sessoes deliberativas ${year}: ${realizadas.length}`);
  return realizadas;
}

async function fetchEventosDeputado(deputadoId, year) {
  const eventos = [];
  let page = 1;
  while (page <= 20) {
    try {
      const resp = await axios.get(`${CAMARA_API}/deputados/${deputadoId}/eventos`, {
        params: {
          dataInicio: `${year}-01-01`,
          dataFim: `${year}-12-31`,
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
      console.error(`  Erro eventos dep=${deputadoId}: ${err.message}`);
      break;
    }
  }
  return eventos;
}

async function main() {
  console.log(`=== Ingestao Presenca Real ${YEAR} ===");

  const sessoesTotais = await fetchSessoesTotais(YEAR);
  const totalSessoes = sessoesTotais.length;

  if (totalSessoes === 0) {
    console.log("Nenhuma sessao deliberativa encontrada.");
    process.exit(1);
  }

  const sessaoIds = new Set(sessoesTotais.map(s => s.id));

  await db.collection("system_config").doc("presenca_referencia").set({
    ano: YEAR,
    totalSessoesDeliberativas: totalSessoes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const snap = await db.collection("politicos")
    .where("tipo", "==", "deputados_federais").limit(520).get();

  if (snap.empty) {
    console.log("Nenhum deputado. Execute weekly-ingest primeiro.");
    process.exit(1);
  }

  let processed = 0;
  for (let i = 0; i < snap.docs.length; i++) {
    const doc = snap.docs[i];
    const depId = doc.id;
    const nome = doc.data().nome || depId;

    console.log(`[${i+1}/${snap.docs.length}] ${nome}`);

    const eventos = await fetchEventosDeputado(depId, YEAR);

    const sessoesDeputado = eventos.filter(e =>
      sessaoIds.has(e.id) ||
      (e.descricaoTipo && e.descricaoTipo.includes("Deliberativa"))
    );

    const sessoesUnicas = new Set(sessoesDeputado.map(s => s.id));
    const sessoesPresente = sessoesUnicas.size;

    const presencaPct = totalSessoes > 0
      ? Number(((sessoesPresente / totalSessoes) * 100).toFixed(1))
      : 0;

    let presencaClassificacao;
    if (presencaPct >= 90) presencaClassificacao = "Excelente";
    else if (presencaPct >= 70) presencaClassificacao = "Bom";
    else if (presencaPct >= 50) presencaClassificacao = "Regular";
    else if (presencaPct >= 30) presencaClassificacao = "Ruim";
    else presencaClassificacao = "Pessimo";

    await db.collection("politicos").doc(depId).set({
      sessoesPresente,
      sessoesTotal: totalSessoes,
      presencaPct,
      presencaClassificacao,
      presencaEstimativa: false,
      presencaAno: YEAR,
      totalEventos: eventos.length,
      presencaUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`  ${sessoesPresente}/${totalSessoes} sessoes (${presencaPct}%) - ${presencaClassificacao}`);
    processed++;
    await delay(DELAY_MS);
  }

  console.log(`\n=== Presenca Real Concluida: ${processed} deputados ===");
  process.exit(0);
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
