/**
 * indiceTransparenciaBR.js — Índice e Motor SEP (Score de Equilíbrio Parlamentar)
 *
 * Motor SEP (Asmodeus): scoreBase = 0,4·produção + 0,4·fiscalização; fatorGastos = gastos/média;
 * se gastos > média, fatorGastos × 1,2; se fatorGastos === 0 → 0,1; SEP = (scoreBase/fatorGastos)·100 (0–100).
 *
 * Parâmetros explícitos em calcScoreSEP: producao, fiscalizacao, gastos, mediaGeral
 */

const KIM_ID = 204536;
const ERIKA_ID = 220645;

/** Pesos do motor SEP (produtividade + fiscalização) */
const SEP_PESO_PRODUCAO = 0.4;
const SEP_PESO_FISCALIZACAO = 0.4;
/** Deflator quando gastos > média geral */
const SEP_DEFLATOR_ACIMA_MEDIA = 1.2;

/**
 * Motor SEP — fórmula oficial.
 * @param {Object} params
 * @param {number} params.producao — score 0–100 (proposições / produção)
 * @param {number} params.fiscalizacao — score 0–100 (risco / processos / fiscalização)
 * @param {number} params.gastos — valor monetário de referência (ex.: total CEAP)
 * @param {number} params.mediaGeral — média dos gastos do universo (≤0 → score 0)
 * @returns {number} score 0–100 (score_sep)
 */
export function calcScoreSEP({ producao, fiscalizacao, gastos, mediaGeral }) {
  const p = Math.max(0, Math.min(100, Number(producao) || 0));
  const f = Math.max(0, Math.min(100, Number(fiscalizacao) || 0));
  const g = Number(gastos) || 0;
  const m = Number(mediaGeral) || 0;

  if (m <= 0) return 0;

  const scoreBase = SEP_PESO_PRODUCAO * p + SEP_PESO_FISCALIZACAO * f;
  let fatorGastos = g / m;
  if (g > m) fatorGastos *= SEP_DEFLATOR_ACIMA_MEDIA;
  if (fatorGastos === 0) fatorGastos = 0.1;

  const sep = (scoreBase / fatorGastos) * 100;
  return Math.round(Math.min(Math.max(sep, 0), 100));
}

function calcFiscalizacaoInterno(p) {
  const r = p.riskScore || 0;
  if (r === 0) return 60;
  return Math.max(0, Math.min(100, 100 - r * 1.8));
}

function calcProducaoInterno(p) {
  if (p.proposicoesScore) return Math.min(100, p.proposicoesScore);
  const d = p.totalDespesas || p.proposicoes || 0;
  if (d > 20) return 40;
  if (d > 0) return 20;
  return 5;
}

/**
 * Score bruto composto (motor SEP + campos do político).
 * @param {Object} p — objeto do político
 * @param {{ mediaGeralGastos?: number }} [opts] — média de gastos do conjunto (denominador SEP)
 */
export function calcularScoreBrutoTransparenciaBR(p, opts = {}) {
  const mediaGeral = opts.mediaGeralGastos ?? 0;
  const gastos = p.totalGastos || 0;
  const producao = calcProducaoInterno(p);
  const fiscalizacao = calcFiscalizacaoInterno(p);

  if (gastos === 0 && (p.totalDespesas || 0) === 0 && (p.riskScore || 0) === 0) {
    return calcScoreSEP({
      producao: 15,
      fiscalizacao: 25,
      gastos: 0,
      mediaGeral,
    });
  }

  return calcScoreSEP({ producao, fiscalizacao, gastos, mediaGeral });
}

/**
 * Normaliza scores; calcula média de gastos no lote para o denominador do SEP.
 */
export function normalizarScoresPorKim(deputados) {
  const comScore = deputados.filter((p) => p.score != null && p.score > 0).length;
  if (comScore > deputados.length * 0.5) {
    return deputados.map((p) => ({
      ...p,
      idx: Math.round(p.score ?? p.indice_transparenciabr ?? 0),
      score_sep: Math.round(
        p.score_sep ??
          calcularScoreBrutoTransparenciaBR(p, { mediaGeralGastos: mediaGastosDe(deputados) }),
      ),
    }));
  }

  const mediaGeral = mediaGastosDe(deputados);
  const kim = deputados.find((p) => Number(p.idCamara) === KIM_ID);
  const kimRaw = kim
    ? calcularScoreBrutoTransparenciaBR(kim, { mediaGeralGastos: mediaGeral })
    : 70;
  const fator = kimRaw > 0 ? 100 / kimRaw : 1;

  return deputados.map((p) => {
    const raw = calcularScoreBrutoTransparenciaBR(p, { mediaGeralGastos: mediaGeral });
    const score_sep = Math.round(raw);
    if (Number(p.idCamara) === KIM_ID) {
      return { ...p, idx: 100, score_sep };
    }
    return {
      ...p,
      idx: Math.min(Math.round(raw * fator), 99),
      score_sep,
    };
  });
}

function mediaGastosDe(list) {
  const vals = list.map((p) => Number(p.totalGastos) || 0).filter((g) => g > 0);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function classificarScoreTransparenciaBR(scoreFinal) {
  if (scoreFinal >= 80) return { label: "Otimo", className: "risk-badge-low" };
  if (scoreFinal >= 50) return { label: "Regular", className: "risk-badge-medium" };
  return { label: "Ruim", className: "risk-badge-high" };
}

export { KIM_ID, ERIKA_ID, SEP_PESO_PRODUCAO, SEP_PESO_FISCALIZACAO, SEP_DEFLATOR_ACIMA_MEDIA };
