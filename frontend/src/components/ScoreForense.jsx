/**
 * Indicador visual de risco forense (0–100) — Motor Forense TransparenciaBR.
 */
export default function ScoreForense({ score, alertas = [] }) {
  const n = Number(score);
  const valid = Number.isFinite(n);
  const s = valid ? Math.max(0, Math.min(100, Math.round(n))) : null;
  const nivel = !valid ? "—" : s >= 70 ? "CRÍTICO" : s >= 40 ? "ELEVADO" : "BAIXO";
  const cor = !valid ? "#6b7280" : s >= 70 ? "#dc2626" : s >= 40 ? "#f59e0b" : "#16a34a";
  const emoji = !valid ? "⚪" : s >= 70 ? "🔴" : s >= 40 ? "🟡" : "🟢";

  return (
    <div
      style={{
        border: `2px solid ${cor}`,
        borderRadius: 12,
        padding: "10px 14px",
        background: "#fff",
        minWidth: 120,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color: cor, lineHeight: 1.2 }}>
        {emoji}{" "}
        {valid ? s : "—"}
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>/100</span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: cor, letterSpacing: "0.06em", marginTop: 2 }}>
        RISCO {nivel}
      </div>
      {alertas.length > 0 && (
        <div style={{ fontSize: 10, color: "#92400e", marginTop: 6 }}>
          ⚠️ {alertas.length} alerta{alertas.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
