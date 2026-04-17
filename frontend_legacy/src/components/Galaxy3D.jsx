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
      val: Math.max(1, (Number(n.val) || Number(n.score_sep) || 5) / 10),
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
      className="max-w-[960px] mx-auto mb-10 px-4"
      aria-label="Mapa de proximidade de parlamentares"
    >
      <h2 className="font-inter text-[15px] font-semibold text-[#0f172a] m-0 mb-2 tracking-tight">
        Rede de referência (SEP)
      </h2>
      <p className="text-[13px] text-[#64748b] m-0 mb-4 leading-relaxed max-w-[640px]">
        Cada esfera representa um parlamentar; o tamanho reflete o score SEP. Clique para abrir o dossiê.
      </p>
      {err && (
        <p className="text-[13px] text-[#b45309] mb-3">{err}</p>
      )}
      <div className="w-full h-[360px] rounded-xl overflow-hidden shadow-sm bg-transparent border border-[#e2e8f0]">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-[13px] text-[#94a3b8]">
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
              backgroundColor="#FAFAF8"
              onNodeClick={onNodeClick}
              enableNodeDrag={true}
              cooldownTicks={80}
            />
          ) : (
            !err && (
              <div className="h-full flex items-center justify-center text-[13px] text-[#94a3b8]">
                Sem nós para exibir.
              </div>
            )
          )}
        </Suspense>
      </div>
    </section>
  );
}
