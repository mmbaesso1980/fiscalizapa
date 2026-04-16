import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";

const ForceGraph3D = lazy(() => import("react-force-graph-3d"));

/** Cores discretas por sigla — estilo institucional */
const PARTIDO_HEX = {
  PL: "#1e3a5f",
  UNIÃO: "#0f766e",
  PSOL: "#7c2d12",
  PT: "#991b1b",
  MDB: "#4a5568",
  PSD: "#2d3748",
  PP: "#1a365d",
  REPUBLICANOS: "#276749",
  DEFAULT: "#475569",
};

function partidoColor(sigla) {
  const s = String(sigla || "").toUpperCase().trim();
  return PARTIDO_HEX[s] || PARTIDO_HEX.DEFAULT;
}

export default function Galaxy3D() {
  const navigate = useNavigate();
  const [data, setData] = useState({ nodes: [], links: [] });
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/galaxy-data.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        const nodes = Array.isArray(json.nodes) ? json.nodes : [];
        const links = Array.isArray(json.links) ? json.links : [];
        setData({ nodes, links });
        setErr(null);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || "Falha ao carregar dados");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const graphData = useMemo(() => {
    const nodes = data.nodes.map((n) => ({
      ...n,
      val: Math.max(1, Number(n.val) || Number(n.score_sep) || 5),
    }));
    return { nodes, links: data.links };
  }, [data]);

  const onNodeClick = useCallback(
    (node) => {
      if (node?.id != null) navigate(`/dossie/${node.id}`);
    },
    [navigate],
  );

  return (
    <section
      style={{
        maxWidth: 960,
        margin: "0 auto 40px",
        padding: "0 16px",
      }}
      aria-label="Mapa de proximidade de parlamentares"
    >
      <h2
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 600,
          color: "#0f172a",
          margin: "0 0 8px",
          letterSpacing: "-0.02em",
        }}
      >
        Rede de referência (SEP)
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "#64748b",
          margin: "0 0 16px",
          lineHeight: 1.5,
          maxWidth: 640,
        }}
      >
        Cada esfera representa um parlamentar; o tamanho reflete o score SEP. Clique para abrir o dossiê.
      </p>
      {err && (
        <p style={{ fontSize: 13, color: "#b45309", marginBottom: 12 }}>{err}</p>
      )}
      <div
        style={{
          width: "100%",
          height: 360,
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
          overflow: "hidden",
        }}
      >
        <Suspense
          fallback={
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "#94a3b8",
              }}
            >
              Carregando visualização…
            </div>
          }
        >
          {graphData.nodes.length > 0 ? (
            <ForceGraph3D
              graphData={graphData}
              nodeLabel="name"
              nodeVal="val"
              nodeAutoColorBy={null}
              nodeColor={(n) => partidoColor(n.partido)}
              linkOpacity={0.2}
              backgroundColor="#f8fafc"
              onNodeClick={onNodeClick}
              enableNodeDrag={true}
              cooldownTicks={80}
            />
          ) : (
            !err && (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  color: "#94a3b8",
                }}
              >
                Sem nós para exibir.
              </div>
            )
          )}
        </Suspense>
      </div>
    </section>
  );
}
