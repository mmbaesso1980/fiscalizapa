#!/usr/bin/env node
/**
 * run-ingest-proposicoes.js
 * Busca proposicoes (PL, PEC, PLP) de cada deputado na Camara API
 * Salva em Firestore: politicos/{id}/proposicoes/{idProposicao}
 * Alimenta: montarPilaresDeputado.calcularProposicoesScore()
 *
 * Uso: node run-ingest-proposicoes.js [startYear] [endYear]
 * Exemplo: node run-ingest-proposicoes.js 2023 2025
 */
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2";
const DELAY_MS = 300;
const TIPOS_RELEVANTES = ["PL", "PEC", "PLP", "PDL", "REQ"];

const args = process.argv.slice(2);
const START_YEAR = parseInt(args[0]) || 2023;
const END_YEAR = parseInt(args[1]) || 2025;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchProposicoes(deputadoId, year) {
  const all = [];
  let page = 1;
  while (page <= 10) {
    try {
      const resp = await axios.get(`${CAMARA_API}/proposicoes`, {
        params: {
          idDeputadoAutor: deputadoId,
          ano: year,
          itens: 100,
          pagina: page,
          ordem: "DESC",
          ordenarPor: "id"
        },
        timeout: 30000,
      });
      const dados = resp.data.dados;
      if (!dados || dados.length === 0) break;
      all.push(...dados);
      if (dados.length < 100) break;
      page++;
      await delay(DELAY_MS);
    } catch (err) {
      console.error(`  Erro prop dep=${deputadoId} ano=${year}: ${err.message}`);
      break;
    }
  }
  return all;
}

async function main() {
  console.log(`=== Ingestao Proposicoes ===");
  console.log(`Anos: ${START_YEAR}-${END_YEAR}`);

  const snap = await db.collection("politicos")
    .where("tipo", "==", "deputados_federais").limit(520).get();

  if (snap.empty) {
    console.log("Nenhum deputado no Firestore.");
    process.exit(1);
  }

  let totalProps = 0;

  for (let i = 0; i < snap.docs.length; i++) {
    const doc = snap.docs[i];
    const depId = doc.id;
    console.log(`[${i+1}/${snap.docs.length}] ${doc.data().nome || depId}`);

    let allProps = [];
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      const props = await fetchProposicoes(depId, year);
      allProps.push(...props);
      console.log(`  ${year}: ${props.length} proposicoes`);
    }

    const relevantes = allProps.filter(p =>
      TIPOS_RELEVANTES.includes(p.siglaTipo)
    );

    if (relevantes.length > 0) {
      const BATCH_LIMIT = 500;
      for (let j = 0; j < relevantes.length; j += BATCH_LIMIT) {
        const chunk = relevantes.slice(j, j + BATCH_LIMIT);
        const batch = db.batch();
        for (const prop of chunk) {
          const ref = db.collection("politicos").doc(depId)
            .collection("proposicoes").doc(String(prop.id));
          batch.set(ref, {
            idProposicao: prop.id,
            siglaTipo: prop.siglaTipo || "",
            numero: prop.numero || 0,
            ano: prop.ano || 0,
            ementa: prop.ementa || "",
            titulo: (prop.siglaTipo || "") + " " + (prop.numero || "") + "/" + (prop.ano || ""),
            dataApresentacao: prop.dataApresentacao || null,
            urlInteiro: prop.urlInteiroTeor || "",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        await batch.commit();
      }
    }

    await db.collection("politicos").doc(depId).set({
      totalProposicoes: allProps.length,
      totalProposicoesRelevantes: relevantes.length,
      proposicoesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    totalProps += relevantes.length;
    console.log(`  Salvas ${relevantes.length} proposicoes relevantes`);
    await delay(DELAY_MS);
  }

  console.log(`\n=== Total: ${totalProps} proposicoes salvas ===");
  process.exit(0);
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
