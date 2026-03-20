// functions/indiceTransparenciaBR.js
// Motor de calculo do Indice TransparenciaBR
// NAO altera JSX, layout ou rotas.

/**
 * Score bruto ponderado (0-100 teorico).
 * Pesos: Economia 40%, Processos 25%, Presenca 20%, Proposicoes 10%, Defesas 5%
 */
function calcularScoreBrutoTransparenciaBR(pilares) {
  const {
    presencaScore = 0,
    economiaScore = 0,
    proposicoesScore = 0,
    defesasPlenarioScore = 0,
    processosScore = 0,
  } = pilares || {};

  const scoreBruto =
    0.20 * presencaScore +
    0.40 * economiaScore +
    0.10 * proposicoesScore +
    0.05 * defesasPlenarioScore +
    0.25 * processosScore;

  return Number(scoreBruto.toFixed(1));
}

/**
 * processosScore (0-100) para cada deputado.
 * @param {Array} processos - [{ idCamara, totalProcessos, processosGraves }]
 * @returns {Object} { [idCamara]: processosScore }
 */
function calcularProcessosScores(processos) {
  if (!Array.isArray(processos)) return {};
  const scores = {};
  processos.forEach(function(p) {
    var idCamara = Number(p.idCamara);
    var totalProcessos = Number(p.totalProcessos || 0);
    var processosGraves = Number(p.processosGraves || 0);

    var base = 100;
    base -= processosGraves * 20;
    base -= (totalProcessos - processosGraves) * 5;

    var processosScore = Math.max(0, Math.min(100, base));
    processosScore = Number(processosScore.toFixed(1));

    if (!Number.isNaN(idCamara)) {
      scores[idCamara] = processosScore;
    }
  });
  return scores;
}

/**
 * Classificacao textual do score final.
 */
function classificarScoreTransparenciaBR(scoreFinal) {
  if (scoreFinal == null || Number.isNaN(scoreFinal)) return null;
  if (scoreFinal >= 90) return 'Excelente';
  if (scoreFinal >= 70) return 'Bom';
  if (scoreFinal >= 50) return 'Regular';
  if (scoreFinal >= 30) return 'Ruim';
  return 'Pessimo';
}

/**
 * Normaliza usando Kim (idCamara 204536) como referencia = 100.
 * Clamp 0-120. Adiciona scoreFinalTransparenciaBR e classificacaoTransparenciaBR.
 */
function normalizarScoresPorKim(deputados) {
  if (!Array.isArray(deputados)) return deputados;

  var KIM_ID = 204536;
  var kim = deputados.find(function(d) { return Number(d.idCamara) === KIM_ID; });

  if (
    !kim ||
    typeof kim.scoreBrutoTransparenciaBR !== 'number' ||
    kim.scoreBrutoTransparenciaBR <= 0
  ) {
    return deputados;
  }

  var scoreBrutoKim = kim.scoreBrutoTransparenciaBR;

  return deputados.map(function(dep) {
    if (typeof dep.scoreBrutoTransparenciaBR !== 'number') return dep;

    var scoreFinal = (dep.scoreBrutoTransparenciaBR / scoreBrutoKim) * 100;
    if (scoreFinal < 0) scoreFinal = 0;
    if (scoreFinal > 120) scoreFinal = 120;
    scoreFinal = Number(scoreFinal.toFixed(1));

    return Object.assign({}, dep, {
      scoreFinalTransparenciaBR: scoreFinal,
      classificacaoTransparenciaBR: classificarScoreTransparenciaBR(scoreFinal),
    });
  });
}

/**
 * Top 10 e Bottom 10 a partir de lista normalizada.
 */
function gerarRankings(deputados) {
  var validos = deputados.filter(function(d) {
    return typeof d.scoreFinalTransparenciaBR === 'number';
  });
  var top10 = validos.slice().sort(function(a, b) {
    return b.scoreFinalTransparenciaBR - a.scoreFinalTransparenciaBR;
  }).slice(0, 10);
  var bottom10 = validos.slice().sort(function(a, b) {
    return a.scoreFinalTransparenciaBR - b.scoreFinalTransparenciaBR;
  }).slice(0, 10);
  return { top10: top10, bottom10: bottom10 };
}

module.exports = {
  calcularScoreBrutoTransparenciaBR: calcularScoreBrutoTransparenciaBR,
  calcularProcessosScores: calcularProcessosScores,
  classificarScoreTransparenciaBR: classificarScoreTransparenciaBR,
  normalizarScoresPorKim: normalizarScoresPorKim,
  gerarRankings: gerarRankings,
};
