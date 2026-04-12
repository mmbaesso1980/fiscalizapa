import { SearchX } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * EmptyState — estado vazio com ícone, mensagem e CTA opcional.
 *
 * Props:
 *   titulo: string
 *   descricao?: string
 *   ctaLabel?: string
 *   ctaTo?: string (rota React Router)
 *   ctaOnClick?: () => void
 *   icon?: React component
 */
export default function EmptyState({
  titulo = "Nenhum resultado",
  descricao,
  ctaLabel,
  ctaTo,
  ctaOnClick,
  icon: Icon = SearchX,
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <Icon size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#334155", margin: "0 0 6px" }}>
        {titulo}
      </h3>
      {descricao && (
        <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 20px", maxWidth: 360 }}>
          {descricao}
        </p>
      )}
      {ctaLabel && ctaTo && (
        <Link
          to={ctaTo}
          style={{
            background: "#01696f",
            color: "#fff",
            padding: "10px 24px",
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          {ctaLabel}
        </Link>
      )}
      {ctaLabel && ctaOnClick && !ctaTo && (
        <button
          onClick={ctaOnClick}
          style={{
            background: "#01696f",
            color: "#fff",
            padding: "10px 24px",
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
