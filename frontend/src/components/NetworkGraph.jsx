/**
 * NetworkGraph.jsx — Visualização de Grafos (Módulo 4: Máfias Eleitorais)
 *
 * Usa react-force-graph-2d para renderizar uma rede interativa de:
 *  • Nós: políticos, empresas, sócios, municípios
 *  • Links: contratos, parentesco, doações, emendas
 *
 * Carregamento: React.lazy + dynamic import (pacote ~600KB).
 * Fallback: skeleton com mensagem informativa se o pacote não estiver instalado.
 *
 * Props:
 *  graphData  — { nodes: Node[], links: Link[] } (obrigatório para exibir o grafo)
 *  politicoId — string (reservado para futuras chaves de cache)
 *  height     — number (padrão: 420)
 *
 * Estrutura de dados para ingestão futura do BigQuery (Módulo 4):
 *  Node: { id, name, type, value?, partido?, uf? }
 *    type: 'politician' | 'company' | 'person' | 'municipality' | 'fund'
 *  Link: { source, target, label, type?, value? }
 *    type: 'contract' | 'kinship' | 'donation' | 'amendment' | 'ownership'
 */

import { useRef, useEffect, useState, lazy, Suspense, useCallback } from "react";

// ─── Cores dos links por tipo ─────────────────────────────────────────────────
const LINK_COLORS = {
  contract:   "rgba(217,119,6,0.55)",
  amendment:  "rgba(200,37,56,0.55)",
  kinship:    "rgba(139,92,246,0.55)",
  donation:   "rgba(251,216,127,0.7)",
  ownership:  "rgba(59,130,246,0.55)",
};

// ─── Fallback enquanto o bundle carrega ───────────────────────────────────────
function GraphSkeleton({ height }) {
  return (
    <div style={{
      height, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 12,
      background: "rgba(255,255,255,0.5)", borderRadius: 14,
      border: "1px dashed #DDD8D0",
    }}>
      <div style={{ fontSize: 28 }}>🕸️</div>
      <p style={{ fontSize: 13, color: "#888", fontWeight: 600 }}>Carregando grafo…</p>
      <p style={{ fontSize: 11, color: "#CCC" }}>react-force-graph-2d</p>
    </div>
  );
}

// ─── Fallback de erro (biblioteca não instalada) ──────────────────────────────
function GraphError({ height, onRetry }) {
  return (
    <div style={{
      height, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 14,
      background: "rgba(255,255,255,0.5)", borderRadius: 14,
      border: "1px dashed #DDD8D0", padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 32 }}>🕸️</div>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#2D2D2D" }}>
        Visualizador de Rede (Módulo 4)
      </p>
      <p style={{ fontSize: 12, color: "#888", maxWidth: 320, lineHeight: 1.5 }}>
        Instale a dependência para ativar o grafo interativo:
      </p>
      <code style={{
        fontSize: 11, background: "#F5F3F0", padding: "6px 14px",
        borderRadius: 8, color: "#2D2D2D", fontFamily: "monospace",
      }}>
        cd frontend && npm install react-force-graph-2d
      </code>
      <p style={{ fontSize: 11, color: "#AAA", lineHeight: 1.5, maxWidth: 300 }}>
        Estrutura de dados pronta para receber o Módulo 4 do BigQuery
        (contratos, parentesco, doações, emendas).
      </p>
      {/* Mini-mapa SVG estático como placeholder visual */}
      <StaticGraphPreview />
    </div>
  );
}

// ─── Pré-visualização SVG estática (funciona sem biblioteca) ─────────────────
function StaticGraphPreview() {
  const nodes = [
    { x: 200, y: 120, r: 22, color: "#C82538", label: "Parlamentar" },
    { x: 80,  y: 60,  r: 14, color: "#D97706", label: "Empresa A" },
    { x: 320, y: 60,  r: 14, color: "#D97706", label: "Empresa B" },
    { x: 60,  y: 200, r: 12, color: "#3B82F6", label: "Sócio" },
    { x: 340, y: 200, r: 12, color: "#8B5CF6", label: "Cônjuge" },
    { x: 200, y: 220, r: 10, color: "#2E7F18", label: "Município" },
    { x: 200, y: 30,  r: 10, color: "#FBD87F", label: "Fundo" },
  ];
  const links = [
    [200,120, 80,60],  [200,120, 320,60], [200,120, 340,200],
    [200,120, 200,30], [60,200, 80,60],   [340,200, 320,60],
    [80,60, 200,220],  [320,60, 200,220],
  ];

  return (
    <svg width={400} height={260} style={{ borderRadius: 10, opacity: 0.7 }}>
      {links.map(([x1,y1,x2,y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#DDD" strokeWidth={1.5} strokeDasharray="4 3" />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.color}
                  fillOpacity={0.85} stroke="#fff" strokeWidth={2} />
          <text x={n.x} y={n.y + n.r + 10} textAnchor="middle"
                fontSize={8} fill="#666" fontFamily="Inter,sans-serif">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function normalizeGraphForForce(raw) {
  if (!raw || !Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    return { nodes: [], links: [] };
  }
  const nodes = raw.nodes.map((n, i) => {
    const id = n.id != null ? String(n.id) : `n_${i}`;
    const name = String(n.name ?? n.label ?? id).trim() || id;
    const val = Number(n.val ?? n.size ?? n.value ?? 8);
    const color = n.color
      ?? (n.group === "green" ? "#2E7F18" : n.group === "red" ? "#C82538" : "#888");
    return { ...n, id, name, val: Number.isFinite(val) ? val : 8, color };
  });
  const links = Array.isArray(raw.links)
    ? raw.links.map((l) => ({
      ...l,
      type: l.type || (raw.isFallback ? "amendment" : l.type),
    }))
    : [];
  return { nodes, links };
}

// ─── Componente do grafo real (lazy-loaded) ───────────────────────────────────
function ForceGraphWrapper({ graphData, height, isFallback }) {
  const [ForceGraph, setForceGraph] = useState(null);
  const [loadError,  setLoadError  ] = useState(false);
  const [hovered,    setHovered    ] = useState(null);
  const graphRef = useRef();

  useEffect(() => {
    import("react-force-graph-2d")
      .then(mod => setForceGraph(() => mod.default))
      .catch(() => setLoadError(true));
  }, []);

  const normalized = graphData ? normalizeGraphForForce(graphData) : { nodes: [], links: [] };
  const hasRealData = normalized.nodes.length > 0;
  const data = hasRealData ? normalized : { nodes: [], links: [] };

  const nodeLabel = useCallback(node => node.name, []);
  const linkColor = useCallback(link => LINK_COLORS[link.type] ?? "rgba(180,180,180,0.5)", []);
  const linkWidth = useCallback(link => link.type === "kinship" ? 2.5 : 1.5, []);

  const paintNode = useCallback((node, ctx, globalScale) => {
    const r    = Math.sqrt(node.val ?? 6) * 3;
    const size = Math.max(r, 5);

    // Halo para nó hovered
    if (hovered?.id === node.id) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI);
      ctx.fillStyle = node.color + "30";
      ctx.fill();
    }

    // Círculo principal
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = node.color ?? "#888";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();

    // Label se zoom suficiente
    if (globalScale > 0.8) {
      const label = node.name.length > 18 ? node.name.slice(0, 17) + "…" : node.name;
      const fontSize = Math.min(10, 10 / globalScale);
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = "#444";
      ctx.textAlign = "center";
      ctx.fillText(label, node.x, node.y + size + fontSize + 1);
    }
  }, [hovered]);

  if (loadError) return <GraphError height={height} />;
  if (!ForceGraph) return <GraphSkeleton height={height} />;

  if (!hasRealData) {
    return (
      <div style={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        borderRadius: 14,
        border: "1px dashed #DDD8D0",
        background: "rgba(255,255,255,0.6)",
        padding: 24,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 28 }}>🕸️</div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#64748b", margin: 0, maxWidth: 360 }}>
          {isFallback
            ? "Montando visualização…"
            : "Nenhum grafo de conexões carregado para este deputado. A rede completa depende dos dados agregados no cofre."}
        </p>
        <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
          {isFallback
            ? "Se nada aparecer, aguarde o carregamento das emendas ou verifique a conexão."
            : "Quando houver dados no cofre, o grafo será preenchido automaticamente."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 14, overflow: "hidden",
                  border: "1px solid rgba(237,235,232,0.8)", background: "#FDFCFB" }}>
      <ForceGraph
        ref={graphRef}
        graphData={data}
        width={undefined}
        height={height}
        backgroundColor="#FDFCFB"
        nodeLabel={nodeLabel}
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => "replace"}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.15}
        onNodeHover={setHovered}
        onNodeClick={node => {
          if (graphRef.current) {
            graphRef.current.centerAt(node.x, node.y, 600);
            graphRef.current.zoom(3, 600);
          }
        }}
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
    </div>
  );
}

// ─── Legenda ──────────────────────────────────────────────────────────────────
const LEGEND = [
  { color: "#C82538", label: "Político" },
  { color: "#D97706", label: "Empresa" },
  { color: "#3B82F6", label: "Pessoa/Sócio" },
  { color: "#8B5CF6", label: "Familiar" },
  { color: "#2E7F18", label: "Município" },
  { color: "#FBD87F", label: "Fundo" },
];

// ─── Export principal ─────────────────────────────────────────────────────────
export default function NetworkGraph({ graphData, politicoId, height = 420, isFallback = false }) {
  const fb = Boolean(isFallback || graphData?.isFallback);
  return (
    <section>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
                       fontWeight: 700, color: "#2D2D2D", marginBottom: 2 }}>
            🕸️ Rede de Conexões — Módulo 4
          </h3>
          <p style={{ fontSize: 11, color: "#888" }}>
            Contratos · Parentesco · Doações · Emendas · Participações societárias
          </p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                       background: fb ? "rgba(217,119,6,0.12)" : "rgba(100,116,139,0.12)",
                       color: fb ? "#b45309" : "#64748b" }}>
          {fb ? "Rede baseada em emendas — rede completa em processamento" : "Dados do cofre quando disponíveis"}
        </span>
      </div>

      {/* Grafo */}
      <ForceGraphWrapper
        graphData={graphData}
        height={height}
        isFallback={fb}
      />

      {/* Legenda */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
        {LEGEND.map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: l.color,
                          flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: "#888" }}>{l.label}</span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#CCC", marginLeft: "auto" }}>
          Clique no nó para centralizar · scroll para zoom
        </span>
      </div>
    </section>
  );
}
