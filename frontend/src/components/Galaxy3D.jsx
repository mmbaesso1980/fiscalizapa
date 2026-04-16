import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "../lib/firebase";

const ForceGraph3D = lazy(() => import("react-force-graph-3d"));

const GALAXY_DEP_LIMIT = 100;

/** Cores discretas por sigla — alinhado à paleta institucional da home */
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

/** Monta anel leve para o layout forçado (evita “bolas soltas” sem estrutura). */
function ringLinks(nodeIds) {
  const links = [];
  const n = nodeIds.length;
  if (n < 2) return links;
  for (let i = 0; i < n; i++) {
    links.push({ source: nodeIds[i], target: nodeIds[(i + 1) % n] });
  }
  return links;
}

export default function Galaxy3D() {
  const navigate = useNavigate();
  const [data, setData] = useState({ nodes: [], links: [] });
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadFromFirestore() {
      setLoading(true);
      setErr(null);
      try {
        const snap = await getDocs(
          query(collection(db, "deputados_federais"), limit(GALAXY_DEP_LIMIT)),
        );
        if (cancelled) return;
        const nodes = snap.docs.map((d) => {
          const raw = d.data();
          const nome =
            (raw.nome || raw.nomeCompleto || raw.nomeEleitoral || "").trim() || d.id;
          const scoreSep = Number(raw.score_sep);
          const scoreAlt = Number(raw.score ?? raw.indice_transparenciabr);
          const valBase = Number.isFinite(scoreSep)
            ? scoreSep
            : Number.isFinite(scoreAlt)
              ? scoreAlt
              : 5;
          return {
            id: d.id,
            name: nome,
            partido: raw.partido || raw.siglaPartido || "",
            val: Math.max(2, Math.min(42, valBase / 2.5 + 3)),
          };
        });

        if (nodes.length > 0) {
          const ids = nodes.map((n) => n.id);
          setData({ nodes, links: ringLinks(ids) });
          setLoading(false);
          return;
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("Galaxy3D Firestore:", e);
        }
      }

      try {
        const r = await fetch("/galaxy-data.json");
        if (!r.ok) throw new Error(String(r.status));
        const json = await r.json();
        if (cancelled) return;
        const nodes = Array.isArray(json.nodes) ? json.nodes : [];
        const links = Array.isArray(json.links) ? json.links : [];
        const ids = nodes.map((n) => String(n.id));
        setData({
          nodes,
          links: links.length > 0 ? links : ringLinks(ids),
        });
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e.message || "Falha ao carregar dados da rede");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFromFirestore();
    return () => {
      cancelled = true;
    };
  }, []);

  const graphData = useMemo(() => {
    const nodes = data.nodes.map((n) => {
      const v =
        n.val != null && Number.isFinite(Number(n.val))
          ? Number(n.val)
          : Math.max(2, Math.min(42, (Number(n.score_sep) || 5) / 2.5 + 3));
      return { ...n, val: Math.max(2, v) };
    });
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
        margin: "0 auto 48px",
        padding: "0 16px",
      }}
      aria-label="Mapa de proximidade de parlamentares"
    >
      <div
        style={{
          borderRadius: 20,
          padding: "clamp(20px, 4vw, 28px)",
          background:
            "linear-gradient(135deg, #FEF3E2 0%, #FDF8F0 25%, #F0F7F2 55%, #EEF2F9 100%)",
          border: "1px solid rgba(27, 94, 59, 0.12)",
          boxShadow: "0 12px 40px rgba(61, 43, 31, 0.06)",
        }}
      >
        <h2
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: "clamp(18px, 3.5vw, 22px)",
            fontWeight: 600,
            color: "#3d2b1f",
            margin: "0 0 10px",
            letterSpacing: "-0.02em",
          }}
        >
          Rede de referência (SEP)
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "#64748b",
            margin: "0 0 18px",
            lineHeight: 1.6,
            maxWidth: 640,
          }}
        >
          Cada esfera é um deputado federal (amostra ao vivo). Tamanho reflete o score SEP quando
          disponível. Clique para abrir o dossiê.
        </p>
        {err && (
          <p style={{ fontSize: 13, color: "#b45309", marginBottom: 12 }}>{err}</p>
        )}
        <div
          style={{
            width: "100%",
            height: "min(420px, 58vh)",
            borderRadius: 16,
            border: "1px solid rgba(15, 23, 42, 0.08)",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
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
            {loading ? (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                Carregando deputados…
              </div>
            ) : graphData.nodes.length > 0 ? (
              <ForceGraph3D
                graphData={graphData}
                nodeLabel="name"
                nodeVal="val"
                nodeAutoColorBy={null}
                nodeColor={(n) => partidoColor(n.partido)}
                nodeResolution={24}
                linkOpacity={0.12}
                linkWidth={0.35}
                linkColor={() => "rgba(27, 94, 59, 0.35)"}
                backgroundColor="rgba(248, 250, 252, 0.4)"
                showNavInfo={false}
                onNodeClick={onNodeClick}
                enableNodeDrag
                cooldownTicks={100}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.35}
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
                  Sem dados para exibir.
                </div>
              )
            )}
          </Suspense>
        </div>
      </div>
    </section>
  );
}
