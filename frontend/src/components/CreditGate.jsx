import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCreditSystem } from "../hooks/useCreditSystem";
import { useAuth } from "../hooks/useAuth";
import ModalCompraCreditos from "./ModalCompraCreditos";

/**
 * Conteúdo premium: blur até o usuário desbloquear consumindo créditos.
 */
export function CreditGate({ custo, descricao, children, onDesbloqueado }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { checkCredits, consumirCreditos } = useCreditSystem();
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [erro, setErro] = useState(null);

  const tentar = async () => {
    setErro(null);
    if (!user) {
      const from = `${location.pathname}${location.search || ""}`;
      navigate("/login", { state: { from }, replace: false });
      return;
    }
    setLoading(true);
    try {
      const tem = await checkCredits(custo);
      if (!tem) {
        setShowModal(true);
        setLoading(false);
        return;
      }
      await consumirCreditos(custo, descricao);
      setDesbloqueado(true);
      onDesbloqueado?.();
    } catch (e) {
      const msg = e?.message || "Não foi possível desbloquear.";
      if (msg.includes("boas-vindas") || msg.includes("Bem-vindo")) {
        setErro("🎉 " + msg);
      } else {
        setErro(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (desbloqueado) return children;

  return (
    <>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
        <div
          style={{
            filter: "blur(6px)",
            pointerEvents: "none",
            userSelect: "none",
            opacity: 0.85,
          }}
        >
          {children}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15, 23, 42, 0.28)",
            padding: 16,
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={tentar}
            disabled={loading}
            style={{
              background: "#01696f",
              color: "#fff",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: loading ? "wait" : "pointer",
              boxShadow: "0 4px 14px rgba(1,105,111,0.35)",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {loading ? "…" : `Desbloquear · ${custo} crédito(s)`}
          </button>
          {erro ? (
            <p style={{ margin: 0, fontSize: 12, color: "#fecaca", textAlign: "center", maxWidth: 280 }}>
              {erro}
            </p>
          ) : null}
        </div>
      </div>
      {showModal ? <ModalCompraCreditos onClose={() => setShowModal(false)} /> : null}
    </>
  );
}
