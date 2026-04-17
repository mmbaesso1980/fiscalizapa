import { Coins } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * CreditBadge — saldo de créditos exibido no header/navbar.
 * Clicável: redireciona para /usuario.
 *
 * Props:
 *   credits: number (saldo total)
 *   compact?: boolean (versão menor para mobile)
 */
export default function CreditBadge({ credits, compact = false }) {
  const saldo = typeof credits === "number" ? credits : 0;

  return (
    <Link
      to="/usuario"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 4 : 6,
        background: "rgba(1,105,111,0.1)",
        color: "#01696f",
        borderRadius: 20,
        padding: compact ? "4px 10px" : "5px 14px",
        fontWeight: 700,
        fontSize: compact ? 12 : 14,
        textDecoration: "none",
        transition: "background 0.15s",
        whiteSpace: "nowrap",
      }}
      title={`${saldo} créditos disponíveis`}
    >
      <Coins size={compact ? 14 : 16} />
      {saldo.toLocaleString("pt-BR")}
    </Link>
  );
}
