/**
 * CreditWallet.jsx — Badge de saldo de créditos na Navbar.
 *
 * Exibe:
 *  • Saldo numérico de créditos do usuário logado
 *  • Ícone de moeda animado ao atualizar
 *  • Tooltip com nível do plano
 *  • Link para /creditos ao clicar
 *
 * Props:
 *  credits  — número de créditos (null = carregando)
 *  compact  — se true, exibe versão pill menor (padrão: false)
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

// ─── Cor do badge baseada no saldo ────────────────────────────────────────────
function walletStyle(credits) {
  if (credits === null)  return { bg: "#F5F3F0", color: "#AAA",    glow: "none" };
  if (credits >= 100)    return { bg: "#FBF5E6", color: "#7A4F1E", glow: "0 0 8px rgba(251,216,127,0.5)" };
  if (credits >= 20)     return { bg: "#EDF7EF", color: "#1E5C2E", glow: "0 0 6px rgba(168,216,176,0.4)" };
  if (credits > 0)       return { bg: "#FFF3E0", color: "#7A3A00", glow: "0 0 6px rgba(247,185,139,0.4)" };
  return                        { bg: "#FEE8E8", color: "#7A1A1A", glow: "0 0 6px rgba(200,37,56,0.3)" };
}

export default function CreditWallet({ credits, compact = false }) {
  const navigate    = useNavigate();
  const [bump, setBump] = useState(false);
  const prevCredits = useRef(credits);

  // Animação de bump quando créditos mudam
  useEffect(() => {
    if (credits !== null && credits !== prevCredits.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 400);
      prevCredits.current = credits;
      return () => clearTimeout(t);
    }
  }, [credits]);

  const { bg, color, glow } = walletStyle(credits);

  const label =
    credits === null   ? "—"            :
    credits === 0      ? "0 cr"         :
    compact            ? `${credits}`   :
                         `${credits} cr`;

  const title =
    credits === null   ? "Carregando saldo…"         :
    credits >= 100     ? `${credits} créditos · Plano Premium` :
    credits >= 20      ? `${credits} créditos · Plano Free`    :
    credits > 0        ? `${credits} créditos — saldo baixo!`  :
                         "Sem créditos — recarregue agora";

  return (
    <button
      onClick={() => navigate("/creditos")}
      title={title}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           compact ? 4 : 5,
        background:    bg,
        color,
        border:        `1px solid ${color}30`,
        borderRadius:  100,
        padding:       compact ? "2px 8px" : "3px 10px 3px 7px",
        fontSize:      compact ? 11 : 12,
        fontWeight:    700,
        cursor:        "pointer",
        boxShadow:     glow,
        transition:    "all 0.2s ease",
        transform:     bump ? "scale(1.12)" : "scale(1)",
        whiteSpace:    "nowrap",
        letterSpacing: "-0.2px",
        userSelect:    "none",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.filter = "brightness(0.95)";
        e.currentTarget.style.transform = "scale(1.04)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.filter = "none";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {/* Ícone de moeda */}
      <span
        style={{
          width:         compact ? 14 : 16,
          height:        compact ? 14 : 16,
          borderRadius:  "50%",
          background:    `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.6) 0%, transparent 55%), linear-gradient(135deg, #FBD87F, #F7B98B)`,
          display:       "inline-flex",
          alignItems:    "center",
          justifyContent:"center",
          fontSize:      compact ? 7 : 8,
          flexShrink:    0,
          boxShadow:     "inset 0 1px 2px rgba(255,255,255,0.4), 0 1px 3px rgba(0,0,0,0.1)",
        }}
        aria-hidden="true"
      >
        ✦
      </span>

      {label}

      {/* Seta de recarga quando saldo zerado */}
      {credits === 0 && (
        <span style={{ fontSize: 9, opacity: 0.7 }}>↑</span>
      )}
    </button>
  );
}
