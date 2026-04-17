/**
 * Indicador visual de risco forense (0–100) — Motor Forense TransparenciaBR.
 */
export default function ScoreForense({ score, alertas = [] }) {
  const n = Number(score);
  const valid = Number.isFinite(n);
  const s = valid ? Math.max(0, Math.min(100, Math.round(n))) : null;
  const labelText = !valid
    ? "—"
    : s <= 30
      ? "Baixo Risco"
      : s <= 60
        ? "Atenção"
        : "Alto Risco";
  const cor = !valid ? "#6b7280" : s >= 61 ? "#C82538" : s >= 31 ? "#D97706" : "#2E7F18";
  const emoji = !valid ? "⚪" : s >= 61 ? "🔴" : s >= 31 ? "🟡" : "🟢";
  const tip =
    "Score calculado com base em gastos CEAP, emendas, alertas e presença parlamentar";

  return (
    <div
      title={tip}
      style={{
        border: `2px solid ${cor}`,
        borderRadius: 12,
        padding: "10px 14px",
        background: "#fff",
        minWidth: 140,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em", marginBottom: 4 }}>
        Score Forense: {valid ? `${s} / 100` : "— / 100"}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: cor, lineHeight: 1.2 }}>
        {emoji}{" "}
        {valid ? s : "—"}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: cor, marginTop: 4 }}>
        {labelText}
      </div>
      {valid && (
        <div
          style={{
            marginTop: 8,
            height: 6,
            borderRadius: 99,
            background: "#e5e7eb",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${s}%`,
              borderRadius: 99,
              background: cor,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}
      {alertas.length > 0 && (
        <div style={{ fontSize: 10, color: "#92400e", marginTop: 6 }}>
          ⚠️ {alertas.length} alerta{alertas.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
