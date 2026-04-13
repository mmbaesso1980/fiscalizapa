import { useNavigate } from "react-router-dom";

/**
 * Modal simples: direciona para /creditos (pacotes Stripe já existentes).
 */
export default function ModalCompraCreditos({ onClose }) {
  const navigate = useNavigate();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-creditos-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.45)",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#fff",
          borderRadius: 14,
          padding: "24px 22px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
          border: "1px solid #e2e8f0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="modal-creditos-title"
          style={{
            margin: "0 0 8px",
            fontSize: 18,
            fontWeight: 700,
            color: "#0f172a",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Saldo insuficiente
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
          Compre créditos para desbloquear esta análise. Você pode ver pacotes e histórico na área de créditos.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#475569",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => {
              onClose?.();
              navigate("/creditos");
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#01696f",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Comprar créditos
          </button>
        </div>
      </div>
    </div>
  );
}
