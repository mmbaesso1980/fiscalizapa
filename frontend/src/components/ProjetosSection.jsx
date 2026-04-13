import { useState, useEffect } from "react";

const LEGISLATURA_ATUAL = 57;

async function fetchTodasProposicoesAutor(idCamara) {
  const all = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const url =
      `https://dadosabertos.camara.leg.br/api/v2/proposicoes` +
      `?idDeputadoAutor=${encodeURIComponent(idCamara)}` +
      `&idLegislatura=${LEGISLATURA_ATUAL}` +
      `&ordem=DESC&ordenarPor=dataApresentacao&itens=100&pagina=${pagina}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) break;
    const data = await res.json();
    const lista = Array.isArray(data?.dados) ? data.dados : [];
    if (lista.length === 0) break;
    all.push(...lista);
    if (lista.length < 100) break;
  }
  return all;
}

function primeiroAutorId(prop) {
  const id = prop?.autores?.[0]?.id;
  if (id != null) return Number(id);
  const uri = prop?.uri;
  if (uri && typeof uri === "string") {
    const m = uri.match(/\/deputados\/(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

export default function ProjetosSection({ deputadoId, idCamara, colecao }) {
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);

  const idC = idCamara != null && String(idCamara).trim() !== "" ? Number(idCamara) : null;

  useEffect(() => {
    if (!deputadoId || colecao !== "deputados_federais") {
      setProjetos([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        if (!Number.isFinite(idC)) {
          setProjetos([]);
          setLoading(false);
          return;
        }
        const lista = await fetchTodasProposicoesAutor(idC);
        const filtradas = lista.filter((p) => {
          const aid = primeiroAutorId(p);
          return aid === idC;
        });
        const ordenada = filtradas
          .filter((p) => p && (p.id || p.numero || p.ano))
          .sort((a, b) => {
            const da = new Date(a.dataApresentacao || a.dataHora || 0).getTime();
            const db = new Date(b.dataApresentacao || b.dataHora || 0).getTime();
            return db - da;
          });
        setProjetos(ordenada);
      } catch (err) {
        console.error("Erro ao buscar proposicoes:", err);
        setProjetos([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [deputadoId, colecao, idC]);

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        Carregando proposições...
      </div>
    );
  }

  if (!Number.isFinite(idC)) {
    return (
      <div
        style={{
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-md)",
          padding: "24px",
          color: "var(--text-muted)",
        }}
      >
        ID numérico da Câmara indisponível — não foi possível listar proposições como autor principal.
      </div>
    );
  }

  if (projetos.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-md)",
          padding: "40px",
          textAlign: "center",
          color: "var(--text-muted)",
        }}
      >
        Nenhuma proposição como autor principal encontrada (legislatura {LEGISLATURA_ATUAL}).
      </div>
    );
  }

  const tipoColors = {
    PL: "#4caf50",
    PEC: "#e53935",
    PLP: "#ff9800",
    PDL: "#2196f3",
    REQ: "#9e9e9e",
    PRC: "#8e24aa",
    MPV: "#00897b",
  };

  return (
    <div
      style={{
        background: "var(--bg-card)",
        borderRadius: "var(--radius-md)",
        padding: "24px",
        border: "1px solid var(--border-light)",
      }}
    >
      <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
        Proposições (autor principal)
      </h3>

      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
        {projetos.length} proposições · legislatura {LEGISLATURA_ATUAL} · apenas primeiro autor na API da Câmara
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {projetos.slice(0, 30).map((p) => {
          const cor = tipoColors[p.siglaTipo] || "#666";
          const href = p.id ? `https://www.camara.leg.br/propostas-legislativas/${p.id}` : "#";

          return (
            <a
              key={p.id || `${p.siglaTipo}-${p.numero}-${p.ano}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: "var(--bg-card)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                textDecoration: "none",
                color: "inherit",
                minHeight: 44,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: `${cor}20`,
                      color: cor,
                    }}
                  >
                    {p.siglaTipo || "PROP"} {p.numero || "s/n"}/{p.ano || ""}
                  </span>

                  {p.dataApresentacao ? (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {new Date(p.dataApresentacao).toLocaleDateString("pt-BR")}
                    </span>
                  ) : null}
                </div>

                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={p.ementa || "Sem ementa"}
                >
                  {p.ementa || "Sem ementa"}
                </p>
              </div>

              <span style={{ fontSize: "20px", marginLeft: "12px", color: "var(--text-muted)" }}>›</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
