/**
 * AlertRow.jsx — Linha de alerta forense com Oráculo Gemini.
 * Extraído de DossiePage.jsx conforme docs/REFACTOR_PLAN.md (Passo 3).
 */

const SEV = {
  ALTA:  { label: "Alto Risco", color: "#C82538", bg: "rgba(200,37,56,0.08)"  },
  MEDIA: { label: "Atenção",    color: "#D97706", bg: "rgba(217,119,6,0.08)"  },
  BAIXA: { label: "Normal",     color: "#2E7F18", bg: "rgba(46,127,24,0.08)"  },
};

function SevBadge({ v }) {
  const cfg = SEV[(v || "BAIXA").toUpperCase()] ?? SEV.BAIXA;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      color: cfg.color, background: cfg.bg, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

export default function AlertRow({ alerta }) {
  const sev = alerta.criticidade ?? alerta.severidade ?? "BAIXA";
  const cfg = SEV[sev.toUpperCase()] ?? SEV.BAIXA;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "10px 14px",
      background: "#ffffff", borderRadius: 10,
      border: "1px solid #EDEBE8",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#2D2D2D", marginBottom: 2 }}>
            {alerta.tipoAlerta ?? alerta.tipo ?? "Alerta"}
          </p>
          <p style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
            {alerta.descricao ?? "–"}
          </p>
        </div>
        <SevBadge v={sev} />
      </div>
      {alerta.explicacao_oraculo && (
        <div style={{
          borderLeft: `3px solid ${cfg.color}50`, paddingLeft: 10,
          background: cfg.bg, borderRadius: "0 8px 8px 0", padding: "6px 10px",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: "0.06em" }}>
            ✦ ORÁCULO
          </span>
          <p style={{ fontSize: 11, color: "#555", lineHeight: 1.5, margin: "2px 0 0", fontStyle: "italic" }}>
            {alerta.explicacao_oraculo}
          </p>
        </div>
      )}
      {alerta.fonte_url && (
        <a href={alerta.fonte_url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: "#9ca3af", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          🔗 Ver fonte oficial ↗
        </a>
      )}
    </div>
  );
}
