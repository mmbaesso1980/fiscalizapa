#!/usr/bin/env node
/**
 * run-calcular-indice.js
 * Le dados do Firestore, monta pilares, calcula score, normaliza por Kim.
 * Atualiza: politicos/{id} -> scoreBrutoTransparenciaBR, scoreFinalTransparenciaBR
 *
 * Uso: node run-calcular-indice.js
 */
const admin = require("firebase-admin");
const { montarPilares } = require("./montarPilaresDeputado");
const {
  calcularScoreBrutoTransparenciaBR,
  normalizarScoresPorKim,
} = require("./indiceTransparenciaBR");

if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

async function main() {
  console.log("=== Calculando Indice TransparenciaBR ===");

  const snap = await db.collection("politicos")
    .where("tipo", "==", "deputados_federais").limit(520).get();

  if (snap.empty) {
    console.log("Nenhum deputado encontrado.");
    process.exit(1);
  }

  const deputados = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const depId = doc.id;

    // Buscar proposicoes para score
    const propSnap = await db.collection("politicos").doc(depId)
      .collection("proposicoes").limit(500).get();
    const proposicoes = propSnap.docs.map(d => d.data());

    // Montar pilares
    const pilares = montarPilares({
      gastoTotal: data.totalGastos || 0,
      tetoCota: 2160000,
      sessoesPresente: data.sessoesPresente || 0,
      sessoesTotal: data.sessoesTotal || 0,
      proposicoes,
      discursos: [],
      processosScore: data.processosScore || 100,
    });

    const scoreBruto = calcularScoreBrutoTransparenciaBR(pilares);

    deputados.push({
      idCamara: Number(depId),
      nome: data.nome,
      ...pilares,
      scoreBrutoTransparenciaBR: scoreBruto,
    });
  }

  // Normalizar por Kim
  const normalizados = normalizarScoresPorKim(deputados);

  // Salvar scores no Firestore
  let count = 0;
  for (const dep of normalizados) {
    await db.collection("politicos").doc(String(dep.idCamara)).set({
      economiaScore: dep.economiaScore,
      presencaScore: dep.presencaScore,
      proposicoesScore: dep.proposicoesScore,
      defesasPlenarioScore: dep.defesasPlenarioScore,
      processosScore: dep.processosScore,
      scoreBrutoTransparenciaBR: dep.scoreBrutoTransparenciaBR,
      scoreFinalTransparenciaBR: dep.scoreFinalTransparenciaBR,
      classificacaoTransparenciaBR: dep.classificacaoTransparenciaBR,
      indiceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    count++;
  }

  console.log(`${count} deputados atualizados com indice.`);
  process.exit(0);
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
