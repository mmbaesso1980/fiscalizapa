function fmtBRL(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/**
 * Texto pronto para redes — engajamento cívico (dados públicos).
 */
export default function BotaoCobrarDeputado({ politico, custoContribuinte }) {
  const nome = politico?.nome ?? politico?.nomeCompleto ?? "Deputado(a)";
  const partido = politico?.partido ?? "—";
  const uf = politico?.uf ?? politico?.estado ?? "—";
  const docId = politico?.id ?? "";
  const ano = new Date().getFullYear();
  const valorTxt = fmtBRL(custoContribuinte);
  const url = typeof window !== "undefined" ? `${window.location.origin}/dossie/${docId}` : "";

  const texto =
    `Deputado(a) ${nome} (${partido}-${uf}): custo ao contribuinte estimado em ${valorTxt} (${ano}). ` +
    `Fontes abertas e auditoria em ${url || "transparenciabr"} #TransparenciaBR #Política`;

  const compartilhar = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "TransparenciaBR — custo parlamentar", text: texto });
        return;
      }
      await navigator.clipboard.writeText(texto);
      alert("Texto copiado. Cole no X, Instagram ou WhatsApp.");
    } catch (e) {
      console.warn(e);
      try {
        await navigator.clipboard.writeText(texto);
        alert("Texto copiado.");
      } catch {
        prompt("Copie o texto:", texto);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={compartilhar}
      style={{
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        color: "#92400e",
        fontWeight: 700,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      📣 Cobrar deputado
    </button>
  );
}
