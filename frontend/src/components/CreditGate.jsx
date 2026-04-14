import { useState, Children } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCreditSystem } from "../hooks/useCreditSystem";
import { useAuth } from "../hooks/useAuth";
import ModalCompraCreditos from "./ModalCompraCreditos";

const PREVIEW_COUNT = 4;

function wrapChild(node, key) {
  return (
    <div key={key} style={{ marginBottom: 8 }}>
      {node}
    </div>
  );
}

/**
 * Conteúdo premium: primeiras linhas legíveis; restante com blur até desbloquear.
 */
export function CreditGate({ custo, descricao, children, onDesbloqueado }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { checkCredits, consumirCreditos, saldoExibicao, isAdmin } = useCreditSystem();
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
      const msg = String(e?.message || "");
      const code = e?.code;
      if (msg.includes("boas-vindas") || msg.includes("Bem-vindo")) {
        setErro("🎉 " + msg);
      } else if (
        /permission/i.test(msg)
        || code === "permission-denied"
      ) {
        setErro("Erro de acesso. Recarregue a página e tente novamente.");
      } else if (/saldo|crédito|credito|insuf/i.test(msg)) {
        setErro("Créditos insuficientes. Adquira mais créditos para continuar.");
      } else {
        setErro(msg || "Erro ao desbloquear. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (desbloqueado || isAdmin) return children;

  const childArray = Children.toArray(children);
  const visible = childArray.slice(0, PREVIEW_COUNT);
  const blurred = childArray.slice(PREVIEW_COUNT);
  const hasBlur = blurred.length > 0;

  return (
    <>
      <div className="credit-gate-wrapper" style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
        {visible.map((c, i) => wrapChild(c, `cg-v-${i}`))}

        {hasBlur ? (
          <div style={{ position: "relative", marginTop: 8 }}>
            <div
              style={{
                filter: "blur(6px)",
                pointerEvents: "none",
                userSelect: "none",
                maxHeight: 220,
                overflow: "hidden",
              }}
            >
              {blurred.map((c, i) => wrapChild(c, `cg-b-${i}`))}
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
                className="btn-unlock"
                style={{
                  background: "#1B5E3B",
                  color: "#fff",
                  padding: "12px 22px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  border: "none",
                  cursor: loading ? "wait" : "pointer",
                  fontFamily: "'Inter', sans-serif",
                  minHeight: 44,
                }}
              >
                {loading ? "…" : `🔓 Ver tudo · ${custo} crédito(s)`}
              </button>
              {saldoExibicao != null && (
                <p className="credit-balance" style={{ margin: 0, fontSize: 12, color: "#e2e8f0" }}>
                  Saldo: {saldoExibicao} crédito(s)
                </p>
              )}
              {erro ? (
                <p style={{ margin: 0, fontSize: 12, color: "#fecaca", textAlign: "center", maxWidth: 280 }}>
                  {erro}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: 16,
              background: "rgba(248,250,252,0.95)",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          >
            <button
              type="button"
              onClick={tentar}
              disabled={loading}
              style={{
                background: "#1B5E3B",
                color: "#fff",
                padding: "12px 22px",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                border: "none",
                cursor: loading ? "wait" : "pointer",
                minHeight: 44,
              }}
            >
              {loading ? "…" : `Desbloquear · ${custo} crédito(s)`}
            </button>
            {saldoExibicao != null && (
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Saldo: {saldoExibicao} crédito(s)</p>
            )}
            {erro ? (
              <p style={{ margin: 0, fontSize: 12, color: "#b91c1c", textAlign: "center", maxWidth: 280 }}>{erro}</p>
            ) : null}
          </div>
        )}
      </div>
      {showModal ? <ModalCompraCreditos onClose={() => setShowModal(false)} /> : null}
    </>
  );
}
