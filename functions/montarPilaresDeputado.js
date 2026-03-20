// functions/montarPilaresDeputado.js
// Monta os 5 pilares a partir dos dados brutos de cada deputado.
// NAO altera JSX, layout ou rotas.

var KEYWORDS_PROPOSICAO_POSITIVA = [
  'reduzir cota', 'cortar privilegio', 'transparencia', 'fim de auxilio',
  'reducao de gastos', 'cartao corporativo', 'economicidade',
  'acabar auxilio-moradia', 'prestacao de contas', 'reduzir verba',
];

var KEYWORDS_DEFESA_POSITIVA = [
  'transparencia', 'responsabilidade fiscal', 'combate a privilegios',
  'economia', 'corte de gastos', 'prestacao de contas', 'auditoria',
  'fiscalizacao', 'austeridade',
];

/**
 * economiaScore (0-100): quanto MENOS gastou da cota + gabinete, MAIOR o score.
 * @param {number} gastoTotal - gasto total (CEAP + verba gabinete) na legislatura
 * @param {number} tetoCota - teto acumulado disponivel no periodo
 */
function calcularEconomiaScore(gastoTotal, tetoCota) {
  if (!tetoCota || tetoCota <= 0) return 0;
  var pctGasto = gastoTotal / tetoCota;
  var score = Math.max(0, Math.min(100, (1 - pctGasto) * 100));
  return Number(score.toFixed(1));
}

/**
 * presencaScore: % de sessoes presentes.
 */
function calcularPresencaScore(sessoesPresente, sessoesTotal) {
  if (!sessoesTotal || sessoesTotal <= 0) return 0;
  var pct = (sessoesPresente / sessoesTotal) * 100;
  return Number(Math.min(100, Math.max(0, pct)).toFixed(1));
}

/**
 * proposicoesScore (0-100): volume + bonificacao por proposicoes de transparencia.
 */
function calcularProposicoesScore(proposicoes) {
  if (!Array.isArray(proposicoes) || !proposicoes.length) return 0;
  var pontos = 0;
  var base = Math.min(proposicoes.length * 2, 50);
  proposicoes.forEach(function(p) {
    var texto = ((p.ementa || '') + ' ' + (p.titulo || '')).toLowerCase();
    KEYWORDS_PROPOSICAO_POSITIVA.forEach(function(kw) {
      if (texto.indexOf(kw) >= 0) pontos += 5;
    });
  });
  return Number(Math.min(100, base + pontos).toFixed(1));
}

/**
 * defesasPlenarioScore (0-100): discursos em defesa de transparencia/fiscalizacao.
 */
function calcularDefesasPlenarioScore(discursos) {
  if (!Array.isArray(discursos) || !discursos.length) return 0;
  var pontos = 0;
  discursos.forEach(function(d) {
    var texto = ((d.sumario || '') + ' ' + (d.titulo || '')).toLowerCase();
    KEYWORDS_DEFESA_POSITIVA.forEach(function(kw) {
      if (texto.indexOf(kw) >= 0) pontos += 3;
    });
  });
  return Number(Math.min(100, pontos).toFixed(1));
}

/**
 * Monta objeto pilares completo para um deputado.
 */
function montarPilares(opts) {
  var gastoTotal = opts.gastoTotal || 0;
  var tetoCota = opts.tetoCota || 0;
  var sessoesPresente = opts.sessoesPresente || 0;
  var sessoesTotal = opts.sessoesTotal || 0;
  var proposicoes = opts.proposicoes || [];
  var discursos = opts.discursos || [];
  var processosScore = opts.processosScore || 0;

  return {
    economiaScore: calcularEconomiaScore(gastoTotal, tetoCota),
    presencaScore: calcularPresencaScore(sessoesPresente, sessoesTotal),
    proposicoesScore: calcularProposicoesScore(proposicoes),
    defesasPlenarioScore: calcularDefesasPlenarioScore(discursos),
    processosScore: processosScore,
  };
}

module.exports = {
  calcularEconomiaScore: calcularEconomiaScore,
  calcularPresencaScore: calcularPresencaScore,
  calcularProposicoesScore: calcularProposicoesScore,
  calcularDefesasPlenarioScore: calcularDefesasPlenarioScore,
  montarPilares: montarPilares,
};
