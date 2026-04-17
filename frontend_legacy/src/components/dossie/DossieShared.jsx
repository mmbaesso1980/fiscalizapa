/**
 * DossieShared.jsx — UI atômica compartilhada entre sub-componentes do Dossiê.
 * Extraído de DossiePage.jsx conforme docs/REFACTOR_PLAN.md (Passo 2).
 */

// ─── Configuração de Severidade ───────────────────────────────────────────────
export const SEV = {
  ALTA:  { label: "Alto Risco", color: "#C82538", bg: "rgba(200,37,56,0.08)"  },
  MEDIA: { label: "Atenção",    color: "#D97706", bg: "rgba(217,119,6,0.08)"  },
  BAIXA: { label: "Normal",     color: "#2E7F18", bg: "rgba(46,127,24,0.08)"  },
};

// ─── Utilitário: formata moeda com segurança (jamais R$ NaN) ─────────────────
export function formatCurrency(val) {
  const n = parseFloat(String(val ?? "").replace(/\./g, "").replace(",", "."));
  if (isNaN(n) || val === null || val === undefined) return "–";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// ─── Badge de severidade ─────────────────────────────────────────────────────
export function SevBadge({ v }) {
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

// ─── Cabeçalho de seção ──────────────────────────────────────────────────────
export function SectionHeader({ icon, title, badge, badgeColor = "#2E7F18", badgeBg = "rgba(46,127,24,0.10)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <h2 style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 16, fontWeight: 700, color: "#2D2D2D", margin: 0, flex: 1,
      }}>
        {title}
      </h2>
      {badge && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
          color: badgeColor, background: badgeBg, letterSpacing: "0.06em",
          border: `1px solid ${badgeColor}30`,
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Card base (fundo branco, sombra leve) ────────────────────────────────────
export function Card({ children, style }) {
  return (
    <div style={{
      background: "#ffffff",
      borderRadius: 16,
      border: "1px solid #EDEBE8",
      padding: "20px 22px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Disclaimer IA ───────────────────────────────────────────────────────────
export function AIDisclaimer() {
  return (
    <div style={{
      background: "#FBF7E8", border: "1px solid #F0E4A0",
      borderRadius: 8, padding: "10px 14px",
      display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>⚡</span>
      <p style={{ fontSize: 11, color: "#7A6A20", margin: 0, lineHeight: 1.6 }}>
        <strong>Análise probabilística por IA.</strong> Os dados são extraídos de fontes públicas oficiais.
        Scores e alertas são indicadores, não acusações.{" "}
        <a
          href="https://portaldatransparencia.gov.br"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#7A6A20", fontWeight: 600, textDecoration: "underline" }}
        >
          Verificar na Fonte Oficial →
        </a>
      </p>
    </div>
  );
}
