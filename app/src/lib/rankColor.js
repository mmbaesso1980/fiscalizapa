export function getRankColor(rank, total = 513) {
  const pct = Math.min(Math.max((rank - 1) / (total - 1), 0), 1);
  const r = Math.round(46  + pct * (200 - 46));
  const g = Math.round(127 - pct * (127 - 37));
  const b = Math.round(24  + pct * (56  - 24));
  return `rgb(${r},${g},${b})`;
}

export function getRankColorSoft(rank, total = 513) {
  const pct = Math.min(Math.max((rank - 1) / (total - 1), 0), 1);
  const r = Math.round(46  + pct * (200 - 46));
  const g = Math.round(127 - pct * (127 - 37));
  const b = Math.round(24  + pct * (56  - 24));
  return `rgba(${r},${g},${b},0.09)`;
}

export function getRankLabel(rank, total = 513) {
  const pct = (rank - 1) / (total - 1);
  if (pct <= 0.20) return { label: 'Baixo risco',    level: 'low' };
  if (pct <= 0.50) return { label: 'Risco moderado', level: 'mid' };
  if (pct <= 0.80) return { label: 'Risco alto',     level: 'high' };
  return { label: 'Risco critico', level: 'critical' };
}
