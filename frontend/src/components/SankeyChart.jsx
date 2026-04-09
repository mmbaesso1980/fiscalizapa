/**
 * SankeyChart.jsx — Visualização de Fluxo Financeiro (D.R.A.C.U.L.A.)
 *
 * Protocolo A.F.R.O.D.I.T.E. — Fluxo de dinheiro Estado → OSS → Destinos
 *
 * Implementação SVG pura, sem dependências externas.
 * Layout em 3 colunas:
 *   COLUNA 0 (Sources): Estado / Governo
 *   COLUNA 1 (Middle):  OSS / Organizações Sociais
 *   COLUNA 2 (Sinks):   Laboratórios / Hospitais / Contratos
 *
 * Cores:
 *   Fluxo limpo:     #00f5d4 (Verde Médico AFRODITE)
 *   Fluxo suspeito:  #ff0054 (Carmesim Pulsante DRACULA)
 *   Nó fonte:        #1a1a2e / #16213e
 *   Nó destino:      glassmorphism dark
 *
 * Props:
 *   @param {object[]} data.nodes  - [{ id, label, value, type, suspicious }]
 *   @param {object[]} data.links  - [{ source, target, value, suspicious }]
 *   @param {number}   width       - Largura total (default: 680)
 *   @param {number}   height      - Altura total (default: 400)
 *   @param {string}   title       - Título do gráfico
 */

import { useState, useMemo } from "react";

// ─── Dados mock (fluxo "Marquinho Boi" + OSS) ─────────────────────────────────
export const MOCK_SANKEY_DATA = {
  nodes: [
    // Sources
    { id: "gov_sp",   label: "Estado de SP",           value: 47_800_000, type: "source",  uf: "SP" },
    { id: "gov_rj",   label: "Mun. Rio de Janeiro",    value: 28_500_000, type: "source",  uf: "RJ" },
    // OSS Intermediários
    { id: "oss1",     label: "Instituto Saúde Plena",   value: 45_000_000, type: "oss",     suspicious: true },
    { id: "oss2",     label: "Fundação Vida e Saúde",   value: 28_000_000, type: "oss",     suspicious: true },
    // Destinos
    { id: "hosp_a",   label: "Hospital Estadual X",     value: 22_000_000, type: "sink",    suspicious: false },
    { id: "lab_f1",   label: "LabFácil Análises ⚠️",   value: 4_800_000,  type: "sink",    suspicious: true,
      note: "Sem licença ANVISA · Empresa nova" },
    { id: "lab_f2",   label: "Diagnósticos Express ⚠️", value: 2_100_000, type: "sink",    suspicious: true,
      note: "2 funcionários · R$ 2.1M em exames" },
    { id: "seg_irmao",label: "Silva Segurança Ltda ⚠️", value: 2_400_000, type: "sink",    suspicious: true,
      note: "Empresa do irmão do parlamentar" },
    { id: "hosp_b",   label: "Clínica Parceira S/A",    value: 9_200_000,  type: "sink",    suspicious: false },
    { id: "rh_sub",   label: "RH Terceirizado Ltda",    value: 5_500_000,  type: "sink",    suspicious: false },
  ],
  links: [
    { source: "gov_sp",  target: "oss1",      value: 45_000_000, suspicious: true  },
    { source: "gov_rj",  target: "oss2",      value: 28_000_000, suspicious: true  },
    { source: "oss1",    target: "hosp_a",    value: 22_000_000, suspicious: false },
    { source: "oss1",    target: "lab_f1",    value: 4_800_000,  suspicious: true  },
    { source: "oss1",    target: "seg_irmao", value: 2_400_000,  suspicious: true  },
    { source: "oss1",    target: "rh_sub",    value: 5_500_000,  suspicious: false },
    { source: "oss2",    target: "lab_f2",    value: 2_100_000,  suspicious: true  },
    { source: "oss2",    target: "hosp_b",    value: 9_200_000,  suspicious: false },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMi(v) {
  const n = Number(v ?? 0);
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n.toLocaleString("pt-BR")}`;
}

const COLOR_CLEAN      = "#00f5d4";
const COLOR_SUSPICIOUS = "#ff0054";
const COLOR_SOURCE_BG  = "#0d1b2a";
const COLOR_OSS_BG     = "#1a0a2e";
const COLOR_SINK_BG    = "#0a1628";
const COLOR_SINK_SUSP  = "#2a0010";

const NODE_COLORS = {
  source: { bg: COLOR_SOURCE_BG, border: "#1e3a5f", text: "#94b4cc" },
  oss:    { bg: COLOR_OSS_BG,    border: "#3d1a5e", text: "#c4a4f5" },
  sink:   { bg: COLOR_SINK_BG,   border: "#1e3a5f", text: "#94b4cc" },
};

// ─── Layout engine ────────────────────────────────────────────────────────────
function computeLayout(nodes, links, width, height) {
  const PADDING_X = 60;
  const PADDING_Y = 40;
  const NODE_W    = 140;
  const NODE_H    = 42;
  const GAP_Y     = 14;

  // Agrupar nós por tipo (coluna)
  const columns = {
    source: nodes.filter(n => n.type === "source"),
    oss:    nodes.filter(n => n.type === "oss"),
    sink:   nodes.filter(n => n.type === "sink"),
  };

  const colX = {
    source: PADDING_X,
    oss:    (width - NODE_W) / 2,
    sink:   width - PADDING_X - NODE_W,
  };

  // Calcular posições Y (centralizado verticalmente)
  const nodePos = {};

  Object.entries(columns).forEach(([type, group]) => {
    const totalH = group.length * (NODE_H + GAP_Y) - GAP_Y;
    const startY = (height - totalH) / 2;
    group.forEach((node, i) => {
      nodePos[node.id] = {
        x:          colX[type],
        y:          startY + i * (NODE_H + GAP_Y),
        w:          NODE_W,
        h:          NODE_H,
        ...node,
      };
    });
  });

  // Calcular paths dos links
  const linkPaths = links.map(link => {
    const src = nodePos[link.source];
    const tgt = nodePos[link.target];
    if (!src || !tgt) return null;

    const maxVal    = Math.max(...links.map(l => l.value), 1);
    const strokeW   = Math.max(2, Math.round((link.value / maxVal) * 18));
    const x1        = src.x + src.w;
    const y1        = src.y + src.h / 2;
    const x2        = tgt.x;
    const y2        = tgt.y + tgt.h / 2;
    const cx        = (x1 + x2) / 2;

    return {
      d:          `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
      strokeW,
      suspicious: link.suspicious,
      value:      link.value,
      source:     link.source,
      target:     link.target,
      x1, y1, x2, y2,
    };
  }).filter(Boolean);

  return { nodePos, linkPaths };
}

// ─── Nó SVG ───────────────────────────────────────────────────────────────────
function SankeyNode({ node, isHovered, onHover }) {
  const colors = NODE_COLORS[node.type] ?? NODE_COLORS.sink;
  const bg     = node.suspicious ? COLOR_SINK_SUSP : colors.bg;
  const border = node.suspicious ? COLOR_SUSPICIOUS : colors.border;
  const text   = node.suspicious ? "#ff6688" : colors.text;

  return (
    <g
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer" }}
    >
      {/* Glow para nós suspeitos */}
      {node.suspicious && (
        <rect
          x={node.x - 3} y={node.y - 3}
          width={node.w + 6} height={node.h + 6}
          rx={11} fill="none"
          stroke={COLOR_SUSPICIOUS}
          strokeWidth={1.5}
          opacity={0.4}
        />
      )}
      {/* Fundo */}
      <rect
        x={node.x} y={node.y}
        width={node.w} height={node.h}
        rx={9}
        fill={bg}
        stroke={border}
        strokeWidth={1.5}
        opacity={isHovered ? 1 : 0.9}
      />
      {/* Label principal */}
      <text
        x={node.x + node.w / 2}
        y={node.y + (node.note ? 13 : 15)}
        textAnchor="middle"
        fill={text}
        fontSize={11}
        fontWeight={600}
        fontFamily="'Space Grotesk', sans-serif"
      >
        {node.label.length > 17 ? node.label.substring(0, 15) + "…" : node.label}
      </text>
      {/* Valor */}
      <text
        x={node.x + node.w / 2}
        y={node.y + (node.note ? 26 : 29)}
        textAnchor="middle"
        fill={node.suspicious ? COLOR_SUSPICIOUS : "#4ecdc4"}
        fontSize={10}
        fontWeight={700}
        fontFamily="'Fira Code', monospace"
      >
        {fmtMi(node.value)}
      </text>
      {/* Nota (fantasma) */}
      {node.note && (
        <text
          x={node.x + node.w / 2}
          y={node.y + 38}
          textAnchor="middle"
          fill={COLOR_SUSPICIOUS}
          fontSize={7.5}
          fontFamily="'Fira Code', monospace"
          opacity={0.8}
        >
          {node.note.length > 22 ? node.note.substring(0, 20) + "…" : node.note}
        </text>
      )}
    </g>
  );
}

// ─── SankeyChart principal ────────────────────────────────────────────────────
export default function SankeyChart({
  data     = MOCK_SANKEY_DATA,
  width    = 700,
  height   = 420,
  title    = "Fluxo Financeiro — Estado → OSS → Destinos",
}) {
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [tooltip,     setTooltip    ] = useState(null);

  const { nodePos, linkPaths } = useMemo(
    () => computeLayout(data.nodes, data.links, width, height),
    [data, width, height]
  );

  const totalFluxo     = data.links.reduce((a, l) => a + l.value, 0);
  const totalSuspeito  = data.links.filter(l => l.suspicious).reduce((a, l) => a + l.value, 0);
  const pctSuspeito    = totalFluxo > 0 ? ((totalSuspeito / totalFluxo) * 100).toFixed(1) : 0;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 14, fontWeight: 700, color: "#e2e8f0", margin: "0 0 4px",
          }}>
            {title}
          </h3>
          <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>
            Total rastreado: {fmtMi(totalFluxo)} · Suspeito: {fmtMi(totalSuspeito)} ({pctSuspeito}%)
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 24, height: 3, background: COLOR_CLEAN, borderRadius: 2 }} />
            <span style={{ fontSize: 9, color: "#94a3b8" }}>Fluxo regular</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 24, height: 3, background: COLOR_SUSPICIOUS, borderRadius: 2 }} />
            <span style={{ fontSize: 9, color: "#94a3b8" }}>Fluxo suspeito</span>
          </div>
        </div>
      </div>

      {/* Labels das colunas */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", color: "#475569", marginBottom: 8,
        width, textAlign: "center",
      }}>
        <span>🏛️ Governo</span>
        <span>🏥 OSS / Intermediário</span>
        <span>🧪 Destino Final</span>
      </div>

      {/* SVG */}
      <div style={{
        background:    "rgba(10,10,20,0.85)",
        backdropFilter: "blur(18px)",
        borderRadius:  16,
        border:        "1px solid rgba(255,255,255,0.08)",
        overflow:      "hidden",
        position:      "relative",
      }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          style={{ display: "block" }}>

          {/* Definições de gradiente e filtros */}
          <defs>
            <filter id="glow-susp">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-clean">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <linearGradient id="grad-clean" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLOR_CLEAN} stopOpacity="0.6" />
              <stop offset="100%" stopColor={COLOR_CLEAN} stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="grad-susp" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLOR_SUSPICIOUS} stopOpacity="0.7" />
              <stop offset="100%" stopColor={COLOR_SUSPICIOUS} stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Links (curvas bezier) */}
          {linkPaths.map((link, i) => {
            const isHov  = hoveredLink === i;
            const color  = link.suspicious ? COLOR_SUSPICIOUS : COLOR_CLEAN;
            const grad   = link.suspicious ? "url(#grad-susp)" : "url(#grad-clean)";
            const filter = link.suspicious ? "url(#glow-susp)" : isHov ? "url(#glow-clean)" : "none";
            return (
              <g key={i}>
                {/* Sombra do link */}
                <path
                  d={link.d}
                  fill="none"
                  stroke={color}
                  strokeWidth={link.strokeW + 4}
                  opacity={0.06}
                />
                {/* Link principal */}
                <path
                  d={link.d}
                  fill="none"
                  stroke={isHov ? color : grad}
                  strokeWidth={link.strokeW}
                  opacity={isHov ? 0.9 : link.suspicious ? 0.55 : 0.4}
                  filter={filter}
                  style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                  onMouseEnter={e => {
                    setHoveredLink(i);
                    setTooltip({
                      x: e.clientX, y: e.clientY,
                      text: `${link.source} → ${link.target}: ${fmtMi(link.value)}`,
                      suspicious: link.suspicious,
                    });
                  }}
                  onMouseLeave={() => { setHoveredLink(null); setTooltip(null); }}
                />
                {/* Seta na ponta */}
                <circle
                  cx={link.x2 - 4}
                  cy={link.y2}
                  r={link.strokeW / 2 + 1}
                  fill={color}
                  opacity={link.suspicious ? 0.8 : 0.45}
                />
              </g>
            );
          })}

          {/* Nós */}
          {Object.values(nodePos).map(node => (
            <SankeyNode
              key={node.id}
              node={node}
              isHovered={hoveredNode === node.id}
              onHover={setHoveredNode}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position:    "fixed",
            left:        tooltip.x + 12,
            top:         tooltip.y - 10,
            background:  "rgba(10,10,25,0.95)",
            backdropFilter: "blur(16px)",
            border:      `1px solid ${tooltip.suspicious ? COLOR_SUSPICIOUS : COLOR_CLEAN}44`,
            borderRadius: 10,
            padding:     "8px 14px",
            fontSize:    11,
            color:       tooltip.suspicious ? "#ff88a0" : "#70f5e0",
            pointerEvents: "none",
            zIndex:      600,
            fontFamily:  "'Fira Code', monospace",
            boxShadow:   `0 4px 24px ${tooltip.suspicious ? "rgba(255,0,84,0.25)" : "rgba(0,245,212,0.15)"}`,
          }}>
            {tooltip.suspicious && "⚠️ "}
            {tooltip.text}
          </div>
        )}
      </div>

      {/* Resumo abaixo */}
      <div style={{
        display: "flex", gap: 16, marginTop: 12,
        flexWrap: "wrap",
      }}>
        {[
          { label: "Fluxo Total",       value: fmtMi(totalFluxo),    color: "#94a3b8" },
          { label: "Fluxo Suspeito",    value: fmtMi(totalSuspeito), color: COLOR_SUSPICIOUS },
          { label: "% Comprometido",    value: `${pctSuspeito}%`,    color: pctSuspeito > 30 ? COLOR_SUSPICIOUS : "#94a3b8" },
          { label: "Destinos Suspeitos", value: `${data.nodes.filter(n => n.suspicious && n.type === "sink").length}`, color: COLOR_SUSPICIOUS },
        ].map(m => (
          <div key={m.label} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10, padding: "8px 14px",
          }}>
            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {m.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: m.color, fontFamily: "'Fira Code', monospace" }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 9, color: "#334155", marginTop: 8 }}>
        * Visualização gerada por motores 17_health_scanner.py + 18_oss_scanner.py + 16_contract_collision.py
      </p>
    </div>
  );
}
