/**
 * Normaliza valores monetários da Câmara / CEAP para número em reais (float).
 * Evita soma por concatenação (number + string) e interpreta formato pt-BR.
 * Valores inteiros gigantes (ex.: totais errados em centavos) → divide por 100.
 */
export function parseCamaraValorReais(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return 0;
    let n = raw;
    if (Number.isInteger(n) && n >= 1_000_000_000) n /= 100;
    return n;
  }
  let s = String(raw).trim().replace(/\s/g, "").replace(/R\$\s?/gi, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const dotCount = (s.match(/\./g) || []).length;
  if (hasComma && dotCount > 0) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) s = s.replace(",", ".");
  else if (dotCount > 1) s = s.replace(/\./g, "");
  let n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  if (Number.isInteger(n) && n >= 1_000_000_000) n /= 100;
  return n;
}

export function sumValoresLiquidos(itens, pick) {
  const list = Array.isArray(itens) ? itens : [];
  return list.reduce((acc, item) => {
    const v = pick(item);
    return acc + parseCamaraValorReais(v ?? 0);
  }, 0);
}
