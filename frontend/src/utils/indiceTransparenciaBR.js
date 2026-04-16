/**
 * indiceTransparenciaBR.js
 * Score de Eficiência Parlamentar (SEP) - Protocolo Asmodeus v2
 *
 * Fórmula estrita, matemática e apartidária:
 * SEP = (((Produção * 0.4) + (Fiscalização * 0.4)) / ((Gastos / Média) * 1.2)) * 100
 *
 * Regra de Ouro: O deflator de 1.2 é punitivo para gastos acima da média.
 */

const KIM_ID = 204536;
const ERIKA_ID = 220645;

/**
 * Calcula o Score SEP com base nos dados do frontend se o backend não forneceu ainda.
 * Assume dados extraídos de fontes públicas.
 *
 * @param {Object} p - objeto do politico com dados
 * @param {number} mediaGastosGlobal - Média de gastos da Câmara para o período
 * @returns {number} score SEP normalizado (0-100)
 */
export function calcularScoreBrutoTransparenciaBR(p, mediaGastosGlobal = 50000) {
  // 1. Produção (0.4)
  // Assume que p.proposicoes / p.projetos representam produção legislativa (0 a 100)
  const producao = Math.min(100, (p.proposicoes || p.totalProposicoes || 10) * 2);

  // 2. Fiscalização (0.4)
  // Assume que emendas executadas ou presença representam fiscalização
  const fiscalizacao = Math.min(100, (p.emendasExecutadas || p.presenca || 50));

  // 3. Gastos e Deflator (1.2)
  const gastos = p.totalGastos || p.gastos || mediaGastosGlobal; // Evita zero

  // Gastos / Média
  let razaoGastos = gastos / mediaGastosGlobal;

  // Evita divisão por zero ou deflatores irreais caso a pessoa não gaste absolutamente nada
  if (razaoGastos < 0.1) razaoGastos = 0.1;

  // Deflator punitivo para quem gasta muito
  const deflator = razaoGastos * 1.2;

  // 4. Cálculo SEP final
  const numerador = (producao * 0.4) + (fiscalizacao * 0.4);
  const sepScore = (numerador / deflator) * 100;

  // Normaliza o resultado de 0 a 100
  return Math.round(Math.max(0, Math.min(100, sepScore)));
}

/**
 * Normaliza scores da lista. Quando o backend já fornece `score_sep` no Firestore, usa diretamente.
 * @param {Array} deputados - lista de objetos de deputados
 * @returns {Array} lista com campo `idx` normalizado para exibição
 */
export function normalizarScoresPorKim(deputados) {
  // Calcula a média real de gastos do array atual
  const gastosValidos = deputados.map(d => d.totalGastos || d.gastos || 0).filter(g => g > 0);
  const mediaGastosGlobal = gastosValidos.length > 0
    ? gastosValidos.reduce((a,b) => a+b, 0) / gastosValidos.length
    : 50000;

  return deputados.map(p => {
    // Se o backend/Chronos já entregou o score Asmodeus
    if (p.score_sep != null) {
      return { ...p, idx: Math.round(p.score_sep) };
    }
    if (p.score != null && p.score > 0) {
      return { ...p, idx: Math.round(p.score) };
    }

    // Fallback: Calcula o SEP localmente
    const raw = calcularScoreBrutoTransparenciaBR(p, mediaGastosGlobal);
    return { ...p, idx: raw };
  });
}

/**
 * Classifica score final em categoria visual (Gov.UK Colors)
 * @param {number} scoreFinal - score normalizado 0-100
 * @returns {{ label: string, className: string }}
 */
export function classificarScoreTransparenciaBR(scoreFinal) {
  if (scoreFinal >= 75) return { label: "Alto", className: "risk-badge-low" };
  if (scoreFinal >= 40) return { label: "Médio", className: "risk-badge-medium" };
  return { label: "Baixo", className: "risk-badge-high" };
}

// Exporta constantes
export { KIM_ID, ERIKA_ID };
