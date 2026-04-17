import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import ScoreBadge from "./ScoreBadge";
import AlertaForense from "./AlertaForense";
import { ShieldCheck, Activity, BarChart3, FileText, Users, AlertTriangle } from "lucide-react";

const TIMEOUT_MS = 15_000;

async function callForensicEngine(params) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS),
  );
  const engine = httpsCallable(functions, "forensicEngine");
  return Promise.race([engine(params), timeoutPromise]);
}

/**
 * ForensicDashboard — Painel forense completo.
 *
 * Chama forensicEngine (análise completa) ou getForensicCache (leitura rápida).
 * Exibe score, badge, componentes do score, e flags red/yellow/green.
 *
 * Props:
 *   idCamara: number
 *   nome: string
 *   cpf?: string
 *   compact?: boolean (modo compacto para sidebar)
 *   preview?: boolean — score e componentes visíveis; alertas só com resumo + CTA
 */
function normalizeForensicPayload(raw) {
  if (!raw || raw.erro) return raw;
  const d = raw.dados;
  if (!d || d.ceap?.total != null) return raw;
  return {
    ...raw,
    dados: {
      ceap: {
        total: d.ceapTotal ?? 0,
        count: d.ceapCount ?? 0,
      },
      emendas: {
        count: d.emendasCount ?? 0,
        taxaExecucao: d.emendasTaxaExecucao ?? 0,
      },
      proposicoes: {
        total: d.proposicoesTotal ?? 0,
        tipos: d.proposicoesTipos ?? {},
      },
      discursos: {
        total: d.discursosTotal ?? 0,
      },
      frentes: {
        total: d.frentesTotal ?? 0,
      },
      sancoes: {
        total: d.sancoesTotal ?? 0,
      },
    },
  };
}

export default function ForensicDashboard({ idCamara, nome, cpf, compact = false, preview = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllFlags, setShowAllFlags] = useState(false);

  useEffect(() => {
    if (!idCamara && !nome) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        // Try cache first for instant load
        try {
          if (idCamara) {
            const getCache = httpsCallable(functions, "getForensicCache");
            const cachePromise = getCache({ deputadoId: idCamara });
            const cacheTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("CACHE_TIMEOUT")), TIMEOUT_MS),
            );
            const cacheResult = await Promise.race([cachePromise, cacheTimeout]);
            if (cacheResult?.data?.found && mounted) {
              setData(normalizeForensicPayload(cacheResult.data));
              setLoading(false);
              if (!preview) refreshInBackground();
              return;
            }
          }
        } catch {
          // Cache miss / timeout — proceed to full analysis
        }

        await refreshInBackground();
      } catch (e) {
        console.error("ForensicDashboard load:", e);
        if (mounted) {
          setError(
            e?.message === "TIMEOUT"
              ? "A análise forense demorou mais que o esperado. Tente novamente em alguns instantes."
              : "Motor Forense temporariamente indisponível.",
          );
          setLoading(false);
        }
      }
    }

    async function refreshInBackground() {
      try {
        const result = await callForensicEngine({ idCamara, nome, cpf });
        if (mounted) {
          setData(normalizeForensicPayload(result.data));
          setLoading(false);
        }
      } catch (e) {
        console.error("ForensicDashboard:", e);
        if (mounted) {
          setError(
            e?.message === "TIMEOUT"
              ? "A análise forense demorou mais que o esperado. Tente novamente em alguns instantes."
              : "Análise forense temporariamente indisponível.",
          );
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [idCamara, nome, cpf, preview]);

  if (loading) {
    return (
      <div style={{ padding: compact ? 16 : 24, textAlign: "center" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          fontSize: 13, color: "#6b7280",
        }}>
          <div style={{
            width: 20, height: 20,
            border: "2px solid #A8D8B0", borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          Analisando dados forenses...
        </div>
      </div>
    );
  }

  const previewPlaceholder = (
    <div style={{
      padding: 24, textAlign: "center", borderRadius: 16,
      background: "#eef5f0",
    }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
        Motor Forense TransparenciaBR
      </p>
      <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
        Análise forense será ativada quando um usuário solicitar a primeira análise deste deputado.
      </p>
    </div>
  );

  if (preview && !loading && !data && !error) {
    return previewPlaceholder;
  }

  if (preview && !loading && (error || !data || data?.erro)) {
    return previewPlaceholder;
  }

  if (error || !data || data.erro) {
    return (
      <div style={{
        padding: 16, borderRadius: 12,
        background: "#FEF9C3", border: "1px solid #FDE68A",
        fontSize: 13, color: "#92400E",
      }}>
        {error || data?.erro || "Análise forense indisponível."}
      </div>
    );
  }

  const { score, badge, componentes, flags, dados } = data;
  const sortedFlags = [...(flags || [])].sort((a, b) => {
    const order = { red: 0, yellow: 1, green: 2 };
    return (order[a.severidade] ?? 3) - (order[b.severidade] ?? 3);
  });

  const displayFlags = showAllFlags ? sortedFlags : sortedFlags.slice(0, 4);
  const redCount = sortedFlags.filter(f => f.severidade === "red").length;
  const yellowCount = sortedFlags.filter(f => f.severidade === "yellow").length;

  const componentIcons = {
    ceap: <FileText size={14} />,
    emendas: <BarChart3 size={14} />,
    votacoes: <Activity size={14} />,
    fornecedores: <Users size={14} />,
    sancoes: <ShieldCheck size={14} />,
  };
  const componentLabels = {
    ceap: "CEAP",
    emendas: "Emendas",
    votacoes: "Atividade",
    fornecedores: "Fornecedores",
    sancoes: "Sanções",
  };

  if (compact) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <ScoreBadge score={score} size="md" />
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.06em", color: badge?.cor === "red" ? "#dc2626" : badge?.cor === "yellow" ? "#d97706" : badge?.cor === "blue" ? "#1d4ed8" : "#16a34a",
          }}>
            {badge?.label}
          </span>
        </div>
        {redCount > 0 && (
          <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
            <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
            {redCount} alerta(s) crítico(s)
          </div>
        )}
        {yellowCount > 0 && (
          <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600, marginTop: 4 }}>
            {yellowCount} ponto(s) de atenção
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Score Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        flexWrap: "wrap",
        padding: "20px 24px",
        background: "linear-gradient(135deg, #fff 60%, #FBF7E8 100%)",
        border: "1px solid #EDEBE8", borderRadius: 16,
      }}>
        <ScoreBadge score={score} size="lg" />
        <div style={{ flex: 1 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "#9ca3af", margin: "0 0 4px",
          }}>
            Motor Forense TransparenciaBR
          </p>
          <p style={{ fontSize: 14, color: "#374151", margin: 0, lineHeight: 1.5 }}>
            Análise cruzada de {dados?.proposicoes?.total || 0} proposições,{" "}
            {dados?.ceap?.count || 0} notas CEAP,{" "}
            {dados?.emendas?.count || 0} emendas e{" "}
            {dados?.discursos?.total || 0} discursos em plenário.
          </p>
        </div>
      </div>

      {/* Score Components */}
      <div
        className="score-components-grid"
        style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8,
        }}
      >
        {componentes && Object.entries(componentes).map(([key, comp]) => {
          const pct = comp.max > 0 ? (comp.score / comp.max) * 100 : 0;
          const barColor = pct >= 70 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626";

          return (
            <div key={key} style={{
              background: "#fff", border: "1px solid #EDEBE8",
              borderRadius: 12, padding: "12px 10px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <div style={{ color: "#6b7280" }}>{componentIcons[key]}</div>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.05em", color: "#6b7280",
              }}>
                {componentLabels[key]}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: barColor }}>
                {comp.score}
              </span>
              <div style={{
                width: "100%", height: 4, background: "#f1f5f9",
                borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: barColor, borderRadius: 2,
                  transition: "width 0.6s ease",
                }} />
              </div>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>
                {comp.score}/{comp.max} ({comp.peso})
              </span>
            </div>
          );
        })}
      </div>

      {preview && sortedFlags.length > 0 && (
        <div style={{
          padding: "16px 20px", borderRadius: 12,
          background: "linear-gradient(135deg, #FEF9C3 0%, #FEF2F2 100%)",
          border: "1.5px solid #FDE68A",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            {(redCount > 0 || yellowCount > 0) && (
              <p style={{ fontSize: 14, fontWeight: 700, color: "#92400E", margin: "0 0 4px" }}>
                {redCount > 0 ? `⚠️ ${redCount} alerta(s) crítico(s)` : ""}
                {redCount > 0 && yellowCount > 0 ? " · " : ""}
                {yellowCount > 0 ? `${yellowCount} ponto(s) de atenção` : ""}
              </p>
            )}
            <p style={{ fontSize: 12, color: "#78716C", margin: 0 }}>
              {sortedFlags.length} alerta(s) encontrado(s) — desbloqueie para ver os detalhes de cada alerta forense.
            </p>
          </div>
          <Link to="/creditos" style={{
            padding: "8px 16px", borderRadius: 99,
            background: "#1B5E3B", color: "#fff",
            fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center", whiteSpace: "nowrap", alignSelf: "center",
          }}>
            🔓 Ver análise completa
          </Link>
        </div>
      )}

      {!preview && sortedFlags.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.06em", color: "#6b7280", margin: 0,
          }}>
            Alertas do Motor Forense
          </p>
          {displayFlags.map((flag, i) => (
            <AlertaForense
              key={i}
              severidade={flag.severidade}
              titulo={flag.titulo}
              descricao={flag.descricao}
              detalhes={flag.detalhes}
            />
          ))}
          {sortedFlags.length > 4 && (
            <button
              onClick={() => setShowAllFlags(!showAllFlags)}
              style={{
                background: "none", border: "1px solid #EDEBE8",
                borderRadius: 8, padding: "8px 16px",
                fontSize: 12, fontWeight: 600, color: "#6b7280",
                cursor: "pointer",
              }}
            >
              {showAllFlags ? "Mostrar menos" : `Ver todos (${sortedFlags.length} alertas)`}
            </button>
          )}
        </div>
      )}

      {/* Fonte */}
      <p style={{
        fontSize: 10, color: "#9ca3af", margin: 0,
        borderTop: "1px solid #f1f5f9", paddingTop: 10,
      }}>
        Fontes: Dados Abertos da Câmara (CEAP, Proposições, Discursos) · Portal da Transparência (Emendas, CEIS/CNEP) · BigQuery TransparenciaBR.
        Dados atualizados sob demanda.
      </p>
    </div>
  );
}
