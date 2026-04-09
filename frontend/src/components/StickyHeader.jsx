/**
 * StickyHeader.jsx — Header fixo que aparece ao scrollar a página de um político.
 *
 * Mostra: avatar, nome, partido/UF e a "Temperatura de Risco" (escala HSL verde→vermelho
 * baseada no ranking entre 513 deputados), com badge colorido.
 *
 * Aparece com slide-in suave quando `visible` = true (controlado pelo DossiePage via scroll).
 * Desaparece imediatamente ao voltar ao topo.
 */

import { getRiskColor } from "../utils/colorUtils";

function getRiskLabel(rankIndex, total = 513) {
  const ratio = rankIndex / Math.max(total - 1, 1);
  if (ratio >= 0.85) return { label: "CRÍTICO",   emoji: "🔴" };
  if (ratio >= 0.65) return { label: "ALTO",       emoji: "🟠" };
  if (ratio >= 0.40) return { label: "MÉDIO",      emoji: "🟡" };
  if (ratio >= 0.20) return { label: "BAIXO",      emoji: "🟢" };
  return                     { label: "MONITORADO", emoji: "🔵" };
}

/**
 * @param {object} props
 * @param {object} props.politico  - Objeto do político com nome, partido, uf, photoURL
 * @param {number} props.rankIndex - Posição 0-based no ranking de risco (0 = menor risco)
 * @param {number} props.total     - Total de deputados (padrão 513)
 * @param {boolean} props.visible  - Controla a visibilidade (slide in/out)
 */
export default function StickyHeader({ politico, rankIndex = 0, total = 513, visible = false }) {
  if (!politico) return null;

  const hsl       = getRiskColor(rankIndex, total);
  const riskInfo  = getRiskLabel(rankIndex, total);
  const ratio     = rankIndex / Math.max(total - 1, 1);
  const barWidth  = `${Math.round(ratio * 100)}%`;

  return (
    <div
      role="banner"
      aria-label={`Informações rápidas: ${politico.nome}`}
      style={{
        position:     "fixed",
        top:          0,
        left:         0,
        right:        0,
        zIndex:       200,
        transform:    visible ? "translateY(0)" : "translateY(-110%)",
        transition:   "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        willChange:   "transform",
        background:   "rgba(255, 255, 255, 0.82)",
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        boxShadow:    "0 4px 24px rgba(0,0,0,0.10)",
        padding:      "10px 24px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 16 }}>

        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          overflow: "hidden", flexShrink: 0,
          border: `2px solid ${hsl}`,
          background: "#f3f4f6",
        }}>
          {politico.photoURL
            ? <img src={politico.photoURL} alt={politico.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : (
              <div style={{
                width: "100%", height: "100%", display: "flex",
                alignItems: "center", justifyContent: "center",
                background: `linear-gradient(135deg, ${hsl}33, ${hsl}66)`,
                fontSize: 16, fontWeight: 700, color: "#374151",
              }}>
                {(politico.nome ?? "?")[0]}
              </div>
            )
          }
        </div>

        {/* Nome e partido */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>
              {politico.nome ?? "–"}
            </span>
            <span style={{
              background: "#f3f4f6", color: "#6b7280",
              fontSize: 11, fontWeight: 600, padding: "2px 8px",
              borderRadius: 99, letterSpacing: "0.04em",
            }}>
              {politico.partido ?? "–"} · {politico.uf ?? "–"}
            </span>
          </div>

          {/* Barra de temperatura */}
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              flex: 1, height: 4, borderRadius: 99,
              background: "#e5e7eb", maxWidth: 200, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: barWidth, borderRadius: 99,
                background: `linear-gradient(90deg, #22c55e, #eab308, ${hsl})`,
                transition: "width 0.6s ease",
              }} />
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, color: hsl,
              letterSpacing: "0.06em",
            }}>
              {riskInfo.emoji} {riskInfo.label}
            </span>
          </div>
        </div>

        {/* Ranking badge */}
        <div style={{
          flexShrink: 0, textAlign: "center",
          background: `${hsl}18`, border: `1px solid ${hsl}44`,
          borderRadius: 10, padding: "6px 14px",
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: hsl, lineHeight: 1 }}>
            #{rankIndex + 1}
          </div>
          <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.08em", marginTop: 2 }}>
            de {total}
          </div>
        </div>

      </div>
    </div>
  );
}
