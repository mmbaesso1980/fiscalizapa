import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";

/**
 * Área do usuário — saldo, atalhos (histórico detalhado em /perfil e /creditos).
 */
export default function UsuarioPage() {
  const navigate = useNavigate();
  const { user, credits, creditsComprado, creditsBonus, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/login", { state: { from: "/usuario" } });
  }, [user, loading, navigate]);

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
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Minha conta</h1>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 28 }}>
          {user.displayName || user.email}
        </p>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 28,
            marginBottom: 20,
            boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
            Saldo de créditos
          </p>
          <p style={{ fontSize: 42, fontWeight: 800, color: "#01696f", margin: "0 0 12px", lineHeight: 1 }}>
            {total.toLocaleString("pt-BR")}
          </p>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
            Comprados: <strong style={{ color: "#0f172a" }}>{comprado.toLocaleString("pt-BR")}</strong>
            {" · "}
            Bônus: <strong style={{ color: "#0f172a" }}>{bonus.toLocaleString("pt-BR")}</strong>
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link
            to="/creditos"
            style={{
              display: "block",
              textAlign: "center",
              padding: "14px 20px",
              borderRadius: 12,
              background: "#01696f",
              color: "#fff",
              fontWeight: 700,
              textDecoration: "none",
              fontSize: 15,
            }}
          >
            Comprar créditos
          </Link>
          <Link
            to="/perfil"
            style={{
              display: "block",
              textAlign: "center",
              padding: "14px 20px",
              borderRadius: 12,
              background: "#fff",
              color: "#0f172a",
              fontWeight: 600,
              textDecoration: "none",
              fontSize: 14,
              border: "1px solid #e2e8f0",
            }}
          >
            Meu cofre e histórico de dossiês
          </Link>
          <Link
            to="/dashboard"
            style={{
              display: "block",
              textAlign: "center",
              padding: "12px 20px",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            Painel
          </Link>
        </div>
      </div>
    </div>
  );
}
