/**
 * Legislatura federal atual (57ª): 2023-02-01 — 2027-01-31
 * CEAP na API da Câmara é consultado por ano civil.
 */
export const LEGISLATURA_ATUAL_INICIO_ANO = 2023;

/** Ano inicial para histórico completo de CEAP (API Câmara por ano civil) */
export const CEAP_HISTORICO_ANO_INICIO = 2019;

/** Anos civis para agregar CEAP da legislatura até o ano corrente */
export function anosCeapLegislaturaAtual() {
  const y = new Date().getFullYear();
  const out = [];
  for (let a = y; a >= LEGISLATURA_ATUAL_INICIO_ANO; a--) out.push(a);
  return out;
}

/** Todos os anos desde 2019 até o ano atual (inclusivo) — soma CEAP multi-mandato */
export function anosCeapHistoricoCompleto() {
  const y = new Date().getFullYear();
  const out = [];
  for (let a = y; a >= CEAP_HISTORICO_ANO_INICIO; a--) out.push(a);
  return out;
}
