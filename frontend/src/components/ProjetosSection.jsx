import { useState, useEffect } from "react";

export default function ProjetosSection({ deputadoId, colecao }) {
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deputadoId || colecao !== "deputados_federais") {
      setProjetos([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);

      try {
        const url =
          `https://dadosabertos.camara.leg.br/api/v2/proposicoes` +
          `?idDeputadoAutor=${deputadoId}&ordem=DESC&ordenarPor=dataApresentacao&itens=100`;

        const res = await fetch(url, {
          headers: { accept: "application/json" }
        });

        const data = await res.json();
        const lista = Array.isArray(data?.dados) ? data.dados : [];

        const ordenada = lista
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
  }, [deputadoId, colecao]);

  if (loading) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "var(--text-muted)"
        }}
      >
        Carregando proposições...
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
          color: "var(--text-muted)"
        }}
      >
        Nenhuma proposição encontrada para este político.
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
    MPV: "#00897b"
  };

  return (
    <div
      style={{
        background: "var(--bg-card)",
        borderRadius: "var(--radius-md)",
        padding: "24px",
        border: "1px solid var(--border-light)"
      }}
    >
      <h3
        style={{
          fontSize: "18px",
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: "8px"
        }}
      >
        Proposições Legislativas
      </h3>

      <p
        style={{
          fontSize: "13px",
          color: "var(--text-muted)",
          marginBottom: "16px"
        }}
      >
        {projetos.length} proposições encontradas
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {projetos.slice(0, 30).map((p) => {
          const cor = tipoColors[p.siglaTipo] || "#666";
          const href = p.id
            ? `https://www.camara.leg.br/propostas-legislativas/${p.id}`
            : "#";

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
                color: "inherit"
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                    flexWrap: "wrap"
                  }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: `${cor}20`,
                      color: cor
                    }}
                  >
                    {p.siglaTipo || "PROP"} {p.numero || "s/n"}/{p.ano || ""}
                  </span>

                  {p.dataApresentacao ? (
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)"
                      }}
                    >
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
                    whiteSpace: "nowrap"
                  }}
                  title={p.ementa || "Sem ementa"}
                >
                  {p.ementa || "Sem ementa"}
                </p>
              </div>

              <span
                style={{
                  fontSize: "20px",
                  marginLeft: "12px",
                  color: "var(--text-muted)"
                }}
              >
                ›
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
