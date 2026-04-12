import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { Coins, FileText, ShieldCheck, Settings, ChevronRight } from "lucide-react";

const TIPO_LABELS = {
  PURCHASE:         { label: "Compra",      color: "#22c55e", sign: "+" },
  TRIAL:            { label: "Boas-vindas", color: "#3b82f6", sign: "+" },
  CONSUME_CHAT:     { label: "Chat IA",     color: "#ef4444", sign: "" },
  CONSUME_ANALYSIS: { label: "Análise",     color: "#ef4444", sign: "" },
  BONUS:            { label: "Bônus",       color: "#8b5cf6", sign: "+" },
  REFERRAL_BONUS:   { label: "Indicação",   color: "#8b5cf6", sign: "+" },
  REFUND:           { label: "Estorno",     color: "#f59e0b", sign: "+" },
  uso:              { label: "Uso",         color: "#ef4444", sign: "" },
};

/**
 * Área do usuário — saldo em destaque, histórico de consumo, atalhos.
 */
export default function UsuarioPage() {
  const navigate = useNavigate();
  const { user, credits, creditsComprado, creditsBonus, loading: authLoading } = useAuth();
  const [historico, setHistorico] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { state: { from: "/usuario" } });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await httpsCallable(functions, "getCreditHistory")({ limit: 15 });
        setHistorico(res.data?.historico || []);
      } catch {
        setHistorico([]);
      } finally {
        setLoadingHist(false);
      }
    })();
  }, [user]);

  if (!user) {
    return (
      <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #A8D8B0", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  const total = credits ?? 0;
  const comprado = creditsComprado ?? 0;
  const bonus = creditsBonus ?? 0;

  return (
    <div style={{ minHeight: "72vh", background: "#FAFAF8", padding: "40px 20px", fontFamily: "'Inter', sans-serif" }}>
      <Helmet>
        <title>Minha conta | TransparenciaBR</title>
      </Helmet>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Minha conta</h1>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 28 }}>
          {user.displayName || user.email}
        </p>

        {/* ── Saldo de créditos ────────────────────────────────── */}
        <div
          style={{
            background: "linear-gradient(135deg,#01696f,#0e8c85)",
            borderRadius: 16,
            padding: 28,
            marginBottom: 20,
            color: "#fff",
            boxShadow: "0 4px 24px rgba(1,105,111,0.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Coins size={20} />
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.85 }}>
              Saldo de créditos
            </span>
          </div>
          <p style={{ fontSize: 48, fontWeight: 800, margin: "0 0 12px", lineHeight: 1 }}>
            {total.toLocaleString("pt-BR")}
          </p>
          <p style={{ fontSize: 13, margin: 0, opacity: 0.8 }}>
            Comprados: <strong>{comprado.toLocaleString("pt-BR")}</strong>
            {" · "}
            Bônus: <strong>{bonus.toLocaleString("pt-BR")}</strong>
          </p>
        </div>

        {/* ── Comprar créditos CTA ─────────────────────────────── */}
        <Link
          to="/creditos"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderRadius: 12,
            background: "#fff",
            border: "1.5px solid #e2e8f0",
            color: "#0f172a",
            fontWeight: 600,
            textDecoration: "none",
            fontSize: 15,
            marginBottom: 10,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Coins size={18} color="#01696f" /> Comprar créditos
          </span>
          <ChevronRight size={18} color="#94a3b8" />
        </Link>

        {/* ── Atalhos ──────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
          <Link
            to="/perfil"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 16px",
              borderRadius: 12,
              background: "#fff",
              border: "1.5px solid #e2e8f0",
              color: "#0f172a",
              fontWeight: 500,
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            <FileText size={16} color="#64748b" /> Dossiês
          </Link>
          <Link
            to="/ranking"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 16px",
              borderRadius: 12,
              background: "#fff",
              border: "1.5px solid #e2e8f0",
              color: "#0f172a",
              fontWeight: 500,
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            <ShieldCheck size={16} color="#64748b" /> Ranking
          </Link>
          <Link
            to="/dashboard"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 16px",
              borderRadius: 12,
              background: "#fff",
              border: "1.5px solid #e2e8f0",
              color: "#0f172a",
              fontWeight: 500,
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            <Settings size={16} color="#64748b" /> Painel
          </Link>
        </div>

        {/* ── Histórico de consumo ─────────────────────────────── */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
          Histórico de consumo
        </h2>
        {loadingHist ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Carregando...</p>
        ) : historico.length === 0 ? (
          <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "32px 20px", textAlign: "center" }}>
            <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
              Nenhuma transação registrada ainda.
            </p>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", color: "#64748b", fontWeight: 600 }}>Créditos</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", color: "#64748b", fontWeight: 600 }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h, i) => {
                  const info = TIPO_LABELS[h.tipo] || { label: h.tipo || "—", color: "#6b7280", sign: "" };
                  const val = h.credits ?? h.valor ?? 0;
                  const data = (h.criadoEm?.seconds || h.ts?.seconds)
                    ? new Date((h.criadoEm?.seconds || h.ts?.seconds) * 1000).toLocaleDateString("pt-BR")
                    : "—";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ background: info.color + "22", color: info.color, borderRadius: 6, padding: "2px 10px", fontWeight: 600, fontSize: 12 }}>
                          {info.label}
                        </span>
                        {h.descricao && <span style={{ color: "#94a3b8", fontSize: 12, marginLeft: 8 }}>{h.descricao}</span>}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: val > 0 ? "#22c55e" : "#ef4444" }}>
                        {val > 0 ? "+" : ""}{val}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>{data}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
