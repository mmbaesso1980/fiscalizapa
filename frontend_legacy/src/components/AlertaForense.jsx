import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";

/**
 * AlertaForense — card de alerta com severidade (red/yellow/green).
 *
 * Props:
 *   severidade: "red" | "yellow" | "green"
 *   titulo: string
 *   descricao: string
 *   detalhes?: string (texto expandido)
 */
const CONFIG = {
  red: {
    bg: "#fef2f2",
    border: "#fca5a5",
    color: "#dc2626",
    icon: ShieldAlert,
    label: "Alerta Crítico",
  },
  yellow: {
    bg: "#fffbeb",
    border: "#fcd34d",
    color: "#d97706",
    icon: AlertTriangle,
    label: "Atenção",
  },
  green: {
    bg: "#f0fdf4",
    border: "#86efac",
    color: "#16a34a",
    icon: ShieldCheck,
    label: "Boa governança",
  },
};

export default function AlertaForense({ severidade = "yellow", titulo, descricao, detalhes }) {
  const cfg = CONFIG[severidade] || CONFIG.yellow;
  const Icon = cfg.icon;

  return (
    <div
      style={{
        background: cfg.bg,
        border: `1.5px solid ${cfg.border}`,
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <Icon size={22} color={cfg.color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: cfg.color,
            margin: "0 0 4px",
          }}
        >
          {cfg.label}
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: "0 0 4px" }}>
          {titulo}
        </p>
        <p style={{ fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.5 }}>
          {descricao}
        </p>
        {detalhes && (
          <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 0", lineHeight: 1.5 }}>
            {detalhes}
          </p>
        )}
      </div>
    </div>
  );
}
