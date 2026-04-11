/**
 * Legislatura federal atual (57ª): 2023-02-01 — 2027-01-31
 * CEAP na API da Câmara é consultado por ano civil.
 */
export const LEGISLATURA_ATUAL_INICIO_ANO = 2023;

/** Anos civis para agregar CEAP da legislatura até o ano corrente */
export function anosCeapLegislaturaAtual() {
  const y = new Date().getFullYear();
  const out = [];
  for (let a = y; a >= LEGISLATURA_ATUAL_INICIO_ANO; a--) out.push(a);
  return out;
}
