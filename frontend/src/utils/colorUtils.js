/**
 * colorUtils.js — Motor de Cores do Ranking A.S.M.O.D.E.U.S.
 *
 * Transição suave verde → amarelo → vermelho em HSL puro,
 * baseada na posição do parlamentar no ranking de risco.
 *
 *   rank 1   → hsl(120, 90%, 38%)  Verde
 *   rank 257  → hsl(60,  95%, 42%)  Âmbar / Amarelo
 *   rank 513  → hsl(0,   90%, 48%)  Vermelho
 */

/**
 * Retorna uma cor HSL sólida proporcional ao rank no ranking de risco.
 * @param {number} rankIndex  Posição no ranking (1-based).
 * @param {number} total      Total de itens no ranking (padrão 513).
 * @returns {string}  Cor no formato `hsl(H, S%, L%)`.
 */
export function getRiskColor(rankIndex, total = 513) {
  const pct = Math.min(Math.max((rankIndex - 1) / (total - 1), 0), 1);

  // Hue: 120 (verde) → 0 (vermelho) passando por 60 (âmbar)
  const hue = Math.round(120 * (1 - pct));

  // Saturação ligeiramente maior no âmbar para não parecer apagado
  const sat = pct < 0.5
    ? Math.round(88 + pct * 14)   // 88% → 95%
    : Math.round(95 - (pct - 0.5) * 10); // 95% → 90%

  // Luminosidade: meio-termo é um pouco mais escuro para legibilidade
  const lig = pct < 0.3
    ? 38
    : pct < 0.7
      ? Math.round(38 + (pct - 0.3) / 0.4 * 6)  // 38% → 44%
      : Math.round(44 + (pct - 0.7) / 0.3 * 4); // 44% → 48%

  return `hsl(${hue}, ${sat}%, ${lig}%)`;
}

/**
 * Versão semi-transparente — ideal para fundos de card.
 * @param {number} rankIndex
 * @param {number} total
 * @param {number} alpha  Opacidade (padrão 0.10).
 * @returns {string}  Cor no formato `hsla(H, S%, L%, alpha)`.
 */
export function getRiskColorAlpha(rankIndex, total = 513, alpha = 0.10) {
  const pct = Math.min(Math.max((rankIndex - 1) / (total - 1), 0), 1);
  const hue = Math.round(120 * (1 - pct));
  return `hsla(${hue}, 90%, 44%, ${alpha})`;
}

/**
 * Versão mais escura (ex.: bordas, texto de badge).
 * @param {number} rankIndex
 * @param {number} total
 * @returns {string}  Cor no formato `hsl(H, S%, L%)` com luminosidade reduzida.
 */
export function getRiskColorDark(rankIndex, total = 513) {
  const pct = Math.min(Math.max((rankIndex - 1) / (total - 1), 0), 1);
  const hue = Math.round(120 * (1 - pct));
  return `hsl(${hue}, 85%, 30%)`;
}

/**
 * Rótulo e nível textual para o rank.
 * @param {number} rankIndex
 * @param {number} total
 * @returns {{ label: string, level: 'low'|'mid'|'high'|'critical' }}
 */
export function getRiskLabel(rankIndex, total = 513) {
  const pct = (rankIndex - 1) / (total - 1);
  if (pct <= 0.20) return { label: 'Baixo risco',     level: 'low'      };
  if (pct <= 0.50) return { label: 'Risco moderado',  level: 'mid'      };
  if (pct <= 0.80) return { label: 'Risco alto',      level: 'high'     };
  return               { label: 'Risco crítico',   level: 'critical' };
}
