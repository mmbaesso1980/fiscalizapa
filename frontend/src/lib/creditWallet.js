/**
 * Leitura de flags de carteira em usuarios/{uid} (Firestore).
 * creditos_ilimitados e role admin no documento — definidos só via Console/Admin SDK.
 */

export function usuarioCreditosIlimitados(data) {
  if (!data || typeof data !== "object") return false;
  if (data.creditos_ilimitados === true) return true;
  if (data.role === "admin") return true;
  if (data.isAdmin === true) return true;
  return false;
}

export function usuarioSaldoTotal(data) {
  if (!data) return 0;
  return Number(data.creditos ?? 0) + Number(data.creditos_bonus ?? 0);
}
