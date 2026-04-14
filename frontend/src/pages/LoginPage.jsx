import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import LoginModal from "../components/LoginModal";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, login, loginWithGitHub, loginWithEmail, registerWithEmail } = useAuth();
  const [showModal, setShowModal] = useState(true);

  const from =
    (location.state && location.state.from) ||
    new URLSearchParams(location.search).get("from") ||
    "/ranking";

  useEffect(() => {
    if (loading || !user) return;
    let dest = "/ranking";
    try {
      const saved = sessionStorage.getItem("tbr_auth_redirect");
      if (saved && saved.startsWith("/") && saved !== "/login") {
        dest = saved;
        sessionStorage.removeItem("tbr_auth_redirect");
      } else if (typeof from === "string" && from.startsWith("/") && from !== "/login") {
        dest = from;
      }
    } catch {
      dest =
        typeof from === "string" && from.startsWith("/") && from !== "/login"
          ? from
          : "/ranking";
    }
    navigate(dest, { replace: true });
  }, [user, loading, from, navigate]);

  return (
    <div
      style={{
        minHeight: "72vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 20px",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <Helmet>
        <title>Entrar | TransparenciaBR</title>
      </Helmet>
      <div style={{ textAlign: "center", maxWidth: 420, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>
          Acesse sua conta
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
          Novos usuários recebem créditos de boas-vindas para explorar análises. Após entrar, você será
          redirecionado para continuar de onde parou.
        </p>
      </div>
      {showModal && (
        <LoginModal
          onClose={() => setShowModal(false)}
          onGoogle={() => {
            const dest =
              typeof from === "string" && from.startsWith("/") && from !== "/login"
                ? from
                : "/ranking";
            login(dest);
          }}
          onGitHub={() => {
            const dest =
              typeof from === "string" && from.startsWith("/") && from !== "/login"
                ? from
                : "/ranking";
            loginWithGitHub(dest);
          }}
          onEmail={loginWithEmail}
          onRegister={registerWithEmail}
        />
      )}
      {!showModal && (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background: "#01696f",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Abrir login
        </button>
      )}
      <Link to="/" style={{ marginTop: 20, fontSize: 13, color: "#64748b" }}>
        ← Voltar ao início
      </Link>
    </div>
  );
}
