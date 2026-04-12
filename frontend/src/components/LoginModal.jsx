import { useState } from "react";

export default function LoginModal({ onClose, onGoogle, onGitHub, onEmail, onRegister }) {
  const [mode, setMode] = useState("choose"); // "choose" | "email" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [oauthLoading, setOauthLoading] = useState(null); // "google" | "github" | null

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "register") {
        await onRegister(email, password);
      } else {
        await onEmail(email, password);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Erro ao autenticar");
    }
  };

  const handleOAuth = async (provider) => {
    setError("");
    setOauthLoading(provider);
    try {
      if (provider === "google") await onGoogle();
      else await onGitHub();
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível entrar. Tente de novo.");
    } finally {
      setOauthLoading(null);
    }
  };

  const busy = oauthLoading !== null;

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card, #fff)",
          borderRadius: 12,
          padding: 28,
          width: 360,
          maxWidth: "90vw",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ margin: "0 0 20px", textAlign: "center", fontSize: 18 }}>
          {mode === "choose" ? "Entrar no TransparenciaBR" : mode === "register" ? "Criar Conta" : "Entrar com Email"}
        </h3>

        {mode === "choose" ? (
          <>
            {error && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => handleOAuth("google")}
              style={{ ...btnStyle("#db4437"), opacity: busy && oauthLoading !== "google" ? 0.65 : 1 }}
            >
              {oauthLoading === "google" ? "Abrindo Google…" : "Entrar com Google"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleOAuth("github")}
              style={{ ...btnStyle("#333"), opacity: busy && oauthLoading !== "github" ? 0.65 : 1 }}
            >
              {oauthLoading === "github" ? "Abrindo GitHub…" : "Entrar com GitHub"}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode("email")} style={btnStyle("#3d6b5e")}>
              Entrar com Email
            </button>
            <p style={{ textAlign: "center", fontSize: 13, marginTop: 12, color: "var(--text-secondary)" }}>
              Novo aqui?{" "}
              <span
                onClick={() => !busy && setMode("register")}
                style={{ color: "#3d6b5e", cursor: busy ? "default" : "pointer", fontWeight: 600 }}
              >
                Criar conta
              </span>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 8 }}>{error}</p>}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Senha (min 6 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />
            <button type="submit" style={btnStyle("#3d6b5e")}>
              {mode === "register" ? "Criar Conta" : "Entrar"}
            </button>
            <p style={{ textAlign: "center", fontSize: 13, marginTop: 10, color: "var(--text-secondary)" }}>
              <span
                onClick={() => setMode(mode === "register" ? "email" : "register")}
                style={{ color: "#3d6b5e", cursor: "pointer", fontWeight: 600 }}
              >
                {mode === "register" ? "Ja tenho conta" : "Criar conta"}
              </span>
              {" | "}
              <span onClick={() => setMode("choose")} style={{ color: "#888", cursor: "pointer" }}>
                Voltar
              </span>
            </p>
          </form>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          style={{
            display: "block",
            margin: "16px auto 0",
            background: "none",
            border: "none",
            color: "#888",
            cursor: busy ? "default" : "pointer",
            fontSize: 13,
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

const btnStyle = (bg) => ({
  display: "block",
  width: "100%",
  padding: "12px",
  marginBottom: 10,
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
});

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginBottom: 10,
  border: "1px solid #ccc",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
};
