import { useState, useEffect, useMemo } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { FileText, Mic, Users, Building2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

const TIPO_COLORS = {
  PL: "#4caf50",
  PEC: "#e53935",
  PLP: "#ff9800",
  PDL: "#2196f3",
  REQ: "#9e9e9e",
  RCP: "#00897b",
  PRC: "#8e24aa",
  INC: "#607d8b",
  MPV: "#00897b",
  EMC: "#795548",
};

function Badge({ label, count, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700, padding: "3px 10px",
      borderRadius: 99, background: `${color}15`,
      color, border: `1px solid ${color}30`,
    }}>
      {label} <span style={{ fontWeight: 800 }}>{count}</span>
    </span>
  );
}

function TabButton({ active, label, icon, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 16px", borderRadius: 10,
        border: active ? "1.5px solid #2E7F6E" : "1px solid #EDEBE8",
        background: active ? "#F0FDF4" : "#fff",
        color: active ? "#166534" : "#6b7280",
        fontWeight: active ? 700 : 500, fontSize: 13,
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
      {count != null && (
        <span style={{
          fontSize: 11, fontWeight: 700, background: active ? "#DCFCE7" : "#f1f5f9",
          padding: "1px 7px", borderRadius: 99,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * AtividadeParlamentarSection — Atividade parlamentar completa.
 *
 * Tabs: Proposições (autor) | Discursos | Frentes | Órgãos
 *
 * Props:
 *   deputadoId: string (Firestore doc ID)
 *   idCamara: number
 *   nome: string
 *   colecao: string
 */
export default function AtividadeParlamentarSection({ deputadoId, idCamara, nome, colecao }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("proposicoes");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (colecao !== "deputados_federais" || (!idCamara && !nome)) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const fn = httpsCallable(functions, "getAtividadeParlamentar");
        const result = await fn({ idCamara, nome });
        if (mounted) setData(result.data);
      } catch (e) {
        console.error("AtividadeParlamentar:", e);
        if (mounted) setError("Dados de atividade indisponíveis.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [idCamara, nome, colecao]);

  // ── Stats ──
  const stats = useMemo(() => {
    if (!data) return null;
    const props = data.proposicoes || [];
    const tipos = data.tipoContagem || {};
    const propSignificativas = (tipos.PL || 0) + (tipos.PEC || 0) + (tipos.PLP || 0) + (tipos.PDL || 0);
    return {
      totalProps: data.totalProposicoes || 0,
      propSignificativas,
      totalDiscursos: data.discursos?.total || 0,
      totalFrentes: data.totalFrentes || 0,
      totalOrgaos: data.totalOrgaos || 0,
      tipos,
    };
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
        <div style={{
          display: "inline-block", width: 20, height: 20,
          border: "2px solid #A8D8B0", borderTopColor: "transparent",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
          marginRight: 8, verticalAlign: "middle",
        }} />
        Carregando atividade parlamentar...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: 20, borderRadius: 8,
        background: "#FEF9C3", border: "1px solid #FDE68A",
        fontSize: 13, color: "#92400E",
      }}>
        {error}
      </div>
    );
  }

  if (!data) return null;

  const proposicoes = data.proposicoes || [];
  const discursos = data.discursos?.lista || [];
  const frentes = data.frentes || [];
  const orgaos = data.orgaos || [];

  const SHOW_LIMIT = expanded ? 999 : 30;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { label: "Proposições", value: stats?.totalProps || 0, sub: `${stats?.propSignificativas || 0} PL/PEC/PLP`, icon: <FileText size={16} color="#4caf50" /> },
          { label: "Discursos", value: stats?.totalDiscursos || 0, sub: "em plenário", icon: <Mic size={16} color="#2196f3" /> },
          { label: "Frentes", value: stats?.totalFrentes || 0, sub: "parlamentares", icon: <Users size={16} color="#9c27b0" /> },
          { label: "Comissões", value: stats?.totalOrgaos || 0, sub: "órgãos", icon: <Building2 size={16} color="#ff9800" /> },
        ].map((s, i) => (
          <div key={i} style={{
            background: "#fff", border: "1px solid #EDEBE8",
            borderRadius: 10, padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              {s.icon}
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af" }}>
                {s.label}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1f2937" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Tipo badges (proposições) */}
      {stats?.tipos && Object.keys(stats.tipos).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(stats.tipos)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tipo, count]) => (
              <Badge key={tipo} label={tipo} count={count} color={TIPO_COLORS[tipo] || "#666"} />
            ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <TabButton
          active={activeTab === "proposicoes"} label="Proposições" count={stats?.totalProps}
          icon={<FileText size={14} />} onClick={() => setActiveTab("proposicoes")}
        />
        <TabButton
          active={activeTab === "discursos"} label="Discursos" count={stats?.totalDiscursos}
          icon={<Mic size={14} />} onClick={() => setActiveTab("discursos")}
        />
        <TabButton
          active={activeTab === "frentes"} label="Frentes" count={stats?.totalFrentes}
          icon={<Users size={14} />} onClick={() => setActiveTab("frentes")}
        />
        {orgaos.length > 0 && (
          <TabButton
            active={activeTab === "orgaos"} label="Comissões" count={stats?.totalOrgaos}
            icon={<Building2 size={14} />} onClick={() => setActiveTab("orgaos")}
          />
        )}
      </div>

      {/* Tab Content */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {activeTab === "proposicoes" && (
          <>
            {proposicoes.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Nenhuma proposição encontrada como autor principal.
              </div>
            ) : (
              <>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 4px" }}>
                  {proposicoes.length} proposições como autor principal · API Dados Abertos da Câmara
                </p>
                {proposicoes.slice(0, SHOW_LIMIT).map((p) => {
                  const cor = TIPO_COLORS[p.siglaTipo] || "#666";
                  return (
                    <a
                      key={p.id}
                      href={p.url || `https://www.camara.leg.br/propostas-legislativas/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", background: "#fff", borderRadius: 8,
                        border: "1px solid #EDEBE8", textDecoration: "none", color: "inherit",
                        transition: "background 0.15s",
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = "#f9fafb"}
                      onMouseOut={(e) => e.currentTarget.style.background = "#fff"}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 10,
                            fontSize: 11, fontWeight: 700,
                            background: `${cor}15`, color: cor,
                          }}>
                            {p.siglaTipo || "PROP"} {p.numero || "s/n"}/{p.ano || ""}
                          </span>
                          {p.dataApresentacao && (
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>
                              {new Date(p.dataApresentacao).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                        <p style={{
                          fontSize: 13, color: "#475569", lineHeight: 1.4, margin: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }} title={p.ementa || "Sem ementa"}>
                          {p.ementa || "Sem ementa"}
                        </p>
                      </div>
                      <ExternalLink size={14} color="#9ca3af" style={{ flexShrink: 0, marginLeft: 8 }} />
                    </a>
                  );
                })}
              </>
            )}
          </>
        )}

        {activeTab === "discursos" && (
          <>
            {discursos.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Nenhum discurso registrado nesta legislatura.
              </div>
            ) : (
              <>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 4px" }}>
                  {data.discursos?.total} discursos · Legislatura 57
                </p>
                {data.discursos?.porTipo && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {Object.entries(data.discursos.porTipo)
                      .sort((a, b) => b[1] - a[1])
                      .map(([tipo, count]) => (
                        <Badge key={tipo} label={tipo} count={count} color="#2196f3" />
                      ))}
                  </div>
                )}
                {discursos.slice(0, SHOW_LIMIT).map((d, i) => (
                  <div key={i} style={{
                    padding: "10px 14px", background: "#fff",
                    borderRadius: 8, border: "1px solid #EDEBE8",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px",
                        borderRadius: 99, background: "#EFF6FF", color: "#2563EB",
                      }}>
                        {d.tipo || "Discurso"}
                      </span>
                      {d.data && (
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>
                          {new Date(d.data).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {d.urlTexto && (
                        <a href={d.urlTexto} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 10, color: "#6b7280", textDecoration: "underline", marginLeft: "auto" }}>
                          Ver texto ↗
                        </a>
                      )}
                    </div>
                    {d.sumario && (
                      <p style={{
                        fontSize: 12, color: "#475569", lineHeight: 1.5, margin: 0,
                        display: "-webkit-box", WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical", overflow: "hidden",
                      }}>
                        {d.sumario}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {activeTab === "frentes" && (
          <>
            {frentes.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Nenhuma frente parlamentar registrada.
              </div>
            ) : (
              <>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 4px" }}>
                  {frentes.length} frentes parlamentares
                </p>
                {frentes.slice(0, SHOW_LIMIT).map((f) => (
                  <div key={f.id} style={{
                    padding: "10px 14px", background: "#fff",
                    borderRadius: 8, border: "1px solid #EDEBE8",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <Users size={14} color="#9c27b0" />
                    <span style={{ fontSize: 13, color: "#374151", flex: 1 }}>{f.titulo}</span>
                    {f.idLegislatura && (
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>Leg. {f.idLegislatura}</span>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {activeTab === "orgaos" && (
          <>
            {orgaos.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Nenhuma comissão registrada.
              </div>
            ) : (
              <>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 4px" }}>
                  {orgaos.length} comissões/órgãos
                </p>
                {orgaos.slice(0, SHOW_LIMIT).map((o, i) => (
                  <div key={i} style={{
                    padding: "10px 14px", background: "#fff",
                    borderRadius: 8, border: "1px solid #EDEBE8",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Building2 size={14} color="#ff9800" />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#ff9800" }}>{o.sigla}</span>
                      <span style={{ fontSize: 13, color: "#374151", flex: 1 }}>{o.nome || o.nomePublicacao}</span>
                    </div>
                    {(o.titulo || o.dataInicio) && (
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, paddingLeft: 22 }}>
                        {o.titulo && <span>{o.titulo}</span>}
                        {o.dataInicio && <span> · {o.dataInicio}{o.dataFim ? ` a ${o.dataFim}` : " — atual"}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Expand / Collapse */}
      {((activeTab === "proposicoes" && proposicoes.length > 30) ||
        (activeTab === "discursos" && discursos.length > 30) ||
        (activeTab === "frentes" && frentes.length > 30)) && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "8px 16px", border: "1px solid #EDEBE8", borderRadius: 8,
            background: "#fff", fontSize: 12, fontWeight: 600, color: "#6b7280",
            cursor: "pointer",
          }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? "Mostrar menos" : "Ver todos"}
        </button>
      )}

      {/* Source */}
      <p style={{ fontSize: 10, color: "#9ca3af", margin: 0 }}>
        Fonte:{" "}
        <a href="https://dadosabertos.camara.leg.br" target="_blank" rel="noopener noreferrer"
          style={{ color: "#9ca3af", textDecoration: "underline" }}>
          Dados Abertos da Câmara dos Deputados ↗
        </a>
      </p>
    </div>
  );
}
