#!/usr/bin/env node
/**
 * run-ingest-score-transparencia.js
 *
 * Recalcula o Indice TransparenciaBR para todos deputados_federais no Firestore.
 * Le gastos, verba_gabinete, presenca e calcula os 5 pilares.
 * Normaliza por Kim (204536) e grava scoreFinalTransparenciaBR + classificacao.
 *
 * Uso: cd functions && node run-ingest-score-transparencia.js
 */

var admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'fiscallizapa' });
var db = admin.firestore();

var indice = require('./indiceTransparenciaBR');
var pilares = require('./montarPilaresDeputado');

// Teto acumulado legislatura 57 (2023-2026): CEAP + verba gabinete
// CEAP medio nacional ~R$45k/mes x 36 meses = R$1.620.000
// Verba gabinete ~R$111k/mes x 36 meses = R$3.996.000
// Total teto ~R$5.616.000 (ajustar com dados reais)
var TETO_COTA_LEGISLATURA = 5616000;

async function main() {
  console.log('=== Recalculando Indice TransparenciaBR ===');
  var startTime = Date.now();

  // 1. Buscar todos os deputados
  var snapshot = await db.collection('deputados_federais').get();
  console.log('Total deputados: ' + snapshot.size);

  var deputadosRaw = [];

  snapshot.forEach(function(doc) {
    var data = doc.data();
    var idCamara = data.idCamara || parseInt(doc.id) || 0;

    // Gasto total CEAP
    var totalGastosCeap = data.totalGastos || data.totalGasto || 0;

    // Verba gabinete
    var vgTotalGasto = (data.verbaGabinete && data.verbaGabinete.totalGasto) ? data.verbaGabinete.totalGasto : 0;

    var gastoTotal = totalGastosCeap + vgTotalGasto;

    // Presenca
    var sessoesPresente = data.presentSessions || 0;
    var sessoesTotal = data.totalSessions || 0;

    // Processos (dados futuramente ingeridos)
    var totalProcessos = data.totalProcessos || 0;
    var processosGraves = data.processosGraves || 0;

    deputadosRaw.push({
      firestoreId: doc.id,
      idCamara: idCamara,
      nome: data.nome || '',
      partido: data.partido || '',
      uf: data.uf || '',
      gastoTotal: gastoTotal,
      tetoCota: TETO_COTA_LEGISLATURA,
      sessoesPresente: sessoesPresente,
      sessoesTotal: sessoesTotal,
      proposicoes: [],
      discursos: [],
      totalProcessos: totalProcessos,
      processosGraves: processosGraves,
    });
  });

  // 2. Calcular processosScores
  var processosMap = indice.calcularProcessosScores(
    deputadosRaw.map(function(d) {
      return {
        idCamara: d.idCamara,
        totalProcessos: d.totalProcessos,
        processosGraves: d.processosGraves,
      };
    })
  );

  // 3. Montar pilares e score bruto
  var deputadosComScore = deputadosRaw.map(function(dep) {
    var processosScore = processosMap[dep.idCamara];
    if (processosScore === undefined) processosScore = 100;

    var pilaresObj = pilares.montarPilares({
      gastoTotal: dep.gastoTotal,
      tetoCota: dep.tetoCota,
      sessoesPresente: dep.sessoesPresente,
      sessoesTotal: dep.sessoesTotal,
      proposicoes: dep.proposicoes,
      discursos: dep.discursos,
      processosScore: processosScore,
    });

    var scoreBruto = indice.calcularScoreBrutoTransparenciaBR(pilaresObj);

    return Object.assign({}, dep, {
      pilares: pilaresObj,
      processosScore: processosScore,
      scoreBrutoTransparenciaBR: scoreBruto,
    });
  });

  // 4. Normalizar por Kim
  var deputadosNormalizados = indice.normalizarScoresPorKim(deputadosComScore);

  // 5. Gerar rankings
  var rankings = indice.gerarRankings(deputadosNormalizados);

  // 6. Salvar no Firestore
  var BATCH_LIMIT = 490;
  for (var i = 0; i < deputadosNormalizados.length; i += BATCH_LIMIT) {
    var chunk = deputadosNormalizados.slice(i, i + BATCH_LIMIT);
    var batch = db.batch();
    chunk.forEach(function(dep) {
      var ref = db.collection('deputados_federais').doc(dep.firestoreId);
      batch.set(ref, {
        pilares: dep.pilares,
        processosScore: dep.processosScore,
        scoreBrutoTransparenciaBR: dep.scoreBrutoTransparenciaBR,
        scoreFinalTransparenciaBR: dep.scoreFinalTransparenciaBR || null,
        classificacaoTransparenciaBR: dep.classificacaoTransparenciaBR || null,
        indiceAtualizado: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
    console.log('Batch ' + Math.floor(i / BATCH_LIMIT + 1) + ' salvo.');
  }

  // 7. Salvar rankings em doc separado
  await db.collection('system_data').doc('rankings_transparencia').set({
    top10: rankings.top10.map(function(d) {
      return {
        idCamara: d.idCamara,
        nome: d.nome,
        partido: d.partido,
        uf: d.uf,
        scoreFinalTransparenciaBR: d.scoreFinalTransparenciaBR,
        classificacaoTransparenciaBR: d.classificacaoTransparenciaBR,
      };
    }),
    bottom10: rankings.bottom10.map(function(d) {
      return {
        idCamara: d.idCamara,
        nome: d.nome,
        partido: d.partido,
        uf: d.uf,
        scoreFinalTransparenciaBR: d.scoreFinalTransparenciaBR,
        classificacaoTransparenciaBR: d.classificacaoTransparenciaBR,
      };
    }),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 8. Log
  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=== Indice TransparenciaBR Concluido ===');
  console.log('Deputados processados: ' + deputadosNormalizados.length);
  console.log('Tempo: ' + elapsed + 's');
  console.log('\nTOP 10 - Melhor desempenho em economia e transparencia:');
  rankings.top10.forEach(function(d, i) {
    console.log('  ' + (i + 1) + '. ' + d.nome + ' (' + d.partido + '-' + d.uf + ') - Score: ' + (d.scoreFinalTransparenciaBR || 0) + ' - ' + (d.classificacaoTransparenciaBR || 'N/A'));
  });
  console.log('\nBOTTOM 10 - Pior desempenho em economia, processos e transparencia:');
  rankings.bottom10.forEach(function(d, i) {
    console.log('  ' + (i + 1) + '. ' + d.nome + ' (' + d.partido + '-' + d.uf + ') - Score: ' + (d.scoreFinalTransparenciaBR || 0) + ' - ' + (d.classificacaoTransparenciaBR || 'N/A'));
  });

  process.exit(0);
}

main().catch(function(err) {
  console.error('Erro fatal:', err);
  process.exit(1);
});
