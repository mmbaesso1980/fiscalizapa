/**
 * indiceTransparenciaBR.js
 * Indice de Transparencia Parlamentar - TransparenciaBR
 *
 * Pilares:
 *   economia (40%) - gastos de cota parlamentar
 *   processos (25%) - processos judiciais/risco
 *   presenca (20%) - presenca em sessoes
 *   proposicoes (10%) - producao legislativa
 *   defesas (5%) - defesas em plenario
 *
 * Normalizacao: Kim Kataguiri = 100 (referencia maxima)
 *
 * IMPORTANTE: Deputados sem dados de gastos (totalGastos=0)
 * recebem score de economia BAIXO (penalizado), nao alto.
 * Isso evita que parlamentares com dados incompletos
 * aparecam no Top 10 indevidamente.
 */

const KIM_ID = 204536;
const ERIKA_ID = 220645;

// --- Pesos dos pilares ---
const PESOS = {
  economia: 0.40,
  processos: 0.25,
  presenca: 0.20,
  proposicoes: 0.10,
  defesas: 0.05
};

/**
 * Calcula o score bruto de economia (0-100)
 * Quanto menos gasta da cota, melhor o score.
 * SEM DADOS = penalizado (score baixo), nao beneficiado.
 */
function calcEconomiaScore(p) {
  const g = p.totalGastos || 0;
  // Sem dados de gastos = penalizado (nao sabemos se gasta pouco ou muito)
  if (g === 0) return 30;
  // Escala: g/5000 pontos perdidos. ~500k gastos = score 0
  return Math.max(0, Math.min(100, 100 - (g / 5000) * 1));
}

/**
 * Calcula o score de processos judiciais (0-100)
 * Menos processos/risco = melhor score
 */
function calcProcessosScore(p) {
  const r = p.score || p.riskScore || 0;
  if (r === 0) return 60; // sem processos conhecidos = neutro
  return Math.max(0, Math.min(100, 100 - r * 1.8));
}

/**
 * Calcula score de presenca em sessoes (0-100)
 */
function calcPresencaScore(p) {
  if (p.presencaScore) return Math.min(100, p.presencaScore);
  if (p.presenca) return Math.min(100, p.presenca);
  return 40; // sem dados = penalizado
}

/**
 * Calcula score de proposicoes legislativas (0-100)
 */
function calcProposicoesScore(p) {
  if (p.proposicoesScore) return Math.min(100, p.proposicoesScore);
  const d = p.totalDespesas || p.proposicoes || 0;
  if (d > 20) return 40;
  if (d > 0) return 20;
  return 5;
}

/**
 * Calcula score de defesas em plenario (0-100)
 */
function calcDefesasScore(p) {
  if (p.defesasPlenarioScore) return Math.min(100, p.defesasPlenarioScore);
  return 30; // default sem dados
}

/**
 * Calcula o score bruto composto do indice TransparenciaBR
 * @param {Object} p - objeto do politico com dados
 * @returns {number} score bruto 0-100
 */
export function calcularScoreBrutoTransparenciaBR(p) {
  const g = p.totalGastos || 0;
  const d = p.totalDespesas || 0;
  const r = p.score || p.riskScore || 0;

  // Se nao tem dados nenhum, retorna score baixo
  if (g === 0 && d === 0 && r === 0) return 25;

  const eco = calcEconomiaScore(p);
  const proc = calcProcessosScore(p);
  const pres = calcPresencaScore(p);
  const prop = calcProposicoesScore(p);
  const def = calcDefesasScore(p);

  const bruto = (eco * PESOS.economia) +
    (proc * PESOS.processos) +
    (pres * PESOS.presenca) +
    (prop * PESOS.proposicoes) +
    (def * PESOS.defesas);

  return Math.round(Math.max(0, Math.min(100, bruto)));
}

/**
 * Normaliza scores da lista usando Kim Kataguiri como referencia (=100)
 * @param {Array} deputados - lista de objetos de deputados
 * @returns {Array} lista com campo `idx` normalizado
 */
export function normalizarScoresPorKim(deputados) {
  const kim = deputados.find(p => Number(p.idCamara) === KIM_ID);
  const kimRaw = kim ? calcularScoreBrutoTransparenciaBR(kim) : 70;
  const fator = kimRaw > 0 ? 100 / kimRaw : 1;

  return deputados.map(p => {
    if (Number(p.idCamara) === KIM_ID) return { ...p, idx: 100 };
    const raw = calcularScoreBrutoTransparenciaBR(p);
    return { ...p, idx: Math.min(Math.round(raw * fator), 99) };
  });
}

/**
 * Classifica score final em categoria
 * @param {number} scoreFinal - score normalizado 0-100
 * @returns {{ label: string, className: string }}
 */
export function classificarScoreTransparenciaBR(scoreFinal) {
  if (scoreFinal >= 80) return { label: "Otimo", className: "risk-badge-low" };
  if (scoreFinal >= 50) return { label: "Regular", className: "risk-badge-medium" };
  return { label: "Ruim", className: "risk-badge-high" };
}

// Exporta constantes uteis
export { KIM_ID, ERIKA_ID, PESOS };
