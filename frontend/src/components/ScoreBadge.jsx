/**
 * ScoreBadge — badge colorido com score numérico de transparência (0-100).
 *
 * Score < 30 → RISCO ALTO (vermelho)
 * Score 30-60 → ATENÇÃO (amarelo)
 * Score > 60 → REGULAR (verde)
 * Score > 85 → EXEMPLAR (azul)
 */
export default function ScoreBadge({ score, size = "md" }) {
  const s = typeof score === "number" ? score : null;

  let bg, color, label;
  if (s === null || isNaN(s)) {
    bg = "#e2e8f0"; color = "#64748b"; label = "N/D";
  } else if (s > 85) {
    bg = "#dbeafe"; color = "#1d4ed8"; label = "Exemplar";
  } else if (s > 60) {
    bg = "#dcfce7"; color = "#16a34a"; label = "Regular";
  } else if (s >= 30) {
    bg = "#fef9c3"; color = "#d97706"; label = "Atenção";
  } else {
    bg = "#fee2e2"; color = "#dc2626"; label = "Risco Alto";
  }

  const sizes = {
    sm: { fontSize: 13, padding: "3px 10px", gap: 4 },
    md: { fontSize: 15, padding: "5px 14px", gap: 6 },
    lg: { fontSize: 20, padding: "8px 20px", gap: 8 },
  };
  const sz = sizes[size] || sizes.md;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sz.gap,
        background: bg,
        color,
        fontWeight: 700,
        borderRadius: 8,
        padding: sz.padding,
        fontSize: sz.fontSize,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
      title={`Score de transparência: ${s ?? "indisponível"} — ${label}`}
    >
      {s !== null ? s.toFixed(0) : "–"}
      <span style={{ fontWeight: 500, fontSize: sz.fontSize * 0.75, opacity: 0.85 }}>
        {label}
      </span>
    </span>
  );
}
