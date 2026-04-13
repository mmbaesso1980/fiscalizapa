import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";

import GastosChart from "../components/GastosChart";
import { normalizeUF } from "../components/SocialContext";
import EmendasAba from "../components/EmendasAba";
import ScorePilaresCard from "../components/ScorePilaresCard";
import PresencaSection from "../components/PresencaSection";
import ProjetosSection from "../components/ProjetosSection";
import AlertasFretamento from "../components/AlertasFretamento";
import NepotismoCard from "../components/NepotismoCard";
import VerbaGabineteSection from "../components/VerbaGabineteSection";
import EncaminhamentoEmendas from "../components/EncaminhamentoEmendas";
import { CreditGate } from "../components/CreditGate";
import ScoreBadge from "../components/ScoreBadge";
import AlertaForense from "../components/AlertaForense";
import ForensicDashboard from "../components/ForensicDashboard";
import AtividadeParlamentarSection from "../components/AtividadeParlamentarSection";
import { parseCamaraValorReais } from "../utils/moneyCamara";
import {
  loadRankingOrgExternoMap,
  lookupRankingOrgExterno,
  lookupRankingOrgExternoById,
  mergeDeputadoRankingOrg,
  RANKING_ORG_PAGE,
  RANKING_ORG_CRITERIA,
} from "../utils/rankingOrg";
import { anosCeapLegislaturaAtual } from "../utils/legislatura";

function fmtMoney(value) {
  const n = parseCamaraValorReais(value ?? 0);
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function absolutizeCamaraUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `https://www.camara.leg.br${s}`;
  return s;
}

function normalizeDespesa(item, index) {
  const rawNome = item?.txtFornecedor || item?.fornecedorNome || item?.nomeFornecedor;
  const urlDoc = absolutizeCamaraUrl(item?.urlDocumento);
  const cod = item?.codDocumento ?? item?.numDocumento ?? "";
  return {
    id: item?.id || urlDoc || `${cod}-${item?.dataDocumento || index}-${index}`,
    valorLiquido: parseCamaraValorReais(item?.vlrLiquido ?? item?.valorLiquido ?? item?.valorDocumento ?? 0),
    tipoDespesa: item?.txtDescricao || item?.tipoDespesa || "Sem categoria",
    fornecedorNome: rawNome && String(rawNome).trim() ? String(rawNome).trim() : null,
    dataDocumento: item?.datEmissao || item?.dataDocumento || "",
    urlDocumento: urlDoc,
    cnpjCpf: item?.txtCNPJCPF || item?.cnpjCpf || item?.cnpjCpfFornecedor || "",
    anoRef: item?.ano,
    analiseForense: item?.analise_forense || item?.analiseForense || "🟢 MONITORAMENTO",
    isLocked: Boolean(item?.isLocked),
  };
}

function getFotoPolitico(pol) {
  return pol?.urlFoto || pol?.fotoUrl || "/placeholder-avatar.png";
}

function getCargoPolitico(pol) {
  return pol?.cargo || "Deputado Federal";
}

function getStatusTone(analise) {
  const text = String(analise || "").toUpperCase();
  if (text.includes("VERMELHO") || text.includes("CRÍT") || text.includes("CRIT")) return "text-red-400";
  if (text.includes("AMARELO") || text.includes("ALERTA")) return "text-yellow-400";
  return "text-emerald-400";
}

function StatCard({ label, value, accent = "gold" }) {
  const accentMap = {
    gold: "border-[#e8d9a8] text-[#8B6914]",
    teal: "border-[#a7d4cc] text-[#2E7F6E]",
    white: "border-[#EDEBE8] text-[#2D2D2D]",
  };
  return (
    <div className={`bg-white border rounded-xl p-5 shadow-sm ${accentMap[accent] || accentMap.white}`}>
      <div className="text-[#9ca3af] text-xs uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-2xl font-bold font-space ${accentMap[accent]?.split(" ").pop() || "text-[#2D2D2D]"}`}>{value}</div>
    </div>
  );
}

function SectionCard({ title, icon, children, tone = "default" }) {
  const toneClasses = tone === "danger"
    ? "bg-white rounded-xl border border-red-200 p-6 shadow-sm relative overflow-hidden"
    : tone === "teal"
    ? "bg-white rounded-xl border border-[#a7d4cc] p-6 shadow-sm"
    : "bg-white rounded-xl border border-[#EDEBE8] p-6 shadow-sm";
  const titleClasses = tone === "danger"
    ? "text-lg text-red-600 font-bold mb-4 border-b border-red-100 pb-2 flex items-center gap-2 relative z-10"
    : tone === "teal"
    ? "text-lg text-[#2E7F6E] font-bold mb-4 border-b border-[#EDEBE8] pb-2 flex items-center gap-2"
    : "text-lg text-[#2D2D2D] font-bold mb-4 border-b border-[#EDEBE8] pb-2 flex items-center gap-2";
  return (
    <div className={toneClasses}>
      {tone === "danger" && <div className="absolute top-0 right-0 w-32 h-32 bg-red-900/10 rounded-full blur-3xl" />}
      <h3 className={titleClasses}>
        {icon ? <span className={tone === "danger" ? "animate-pulse" : ""}>{icon}</span> : null}
        {title}
      </h3>
      <div className={tone === "danger" ? "relative z-10" : ""}>{children}</div>
    </div>
  );
}

export default function PoliticoPage() {
  const { colecao, id } = useParams();
  const navigate = useNavigate();
  const col = colecao || "deputados_federais";

  const [pol, setPol] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [emendas, setEmendas] = useState([]);
  const [emendasOverride, setEmendasOverride] = useState(null);
  const [emendasTotaisPortal, setEmendasTotaisPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditError, setAuditError] = useState("");
  const [pageError, setPageError] = useState("");
  const [ceapAnos, setCeapAnos] = useState(() => anosCeapLegislaturaAtual());
  const [atividadeData, setAtividadeData] = useState(null);
  const CEAP_LIST_MAX = 80;

  useEffect(() => {
    if (!pol?.idCamara || col !== "deputados_federais") return;
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, "getAtividadeParlamentar");
        const idC = Number(pol.idCamara);
        const result = await fn({
          idCamara: Number.isFinite(idC) ? idC : undefined,
          nome: pol.nome || pol.nomeCompleto,
        });
        if (!cancelled) setAtividadeData(result.data);
      } catch (e) {
        console.error("PoliticoPage atividade:", e);
        if (!cancelled) setAtividadeData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [pol?.idCamara, pol?.nome, pol?.nomeCompleto, col]);

  useEffect(() => {
    let isMounted = true;
    async function loadPoliticoPage() {
      try {
        setLoading(true);
        setPageError("");
        setAuditError("");
        setEmendasOverride(null);
        setEmendasTotaisPortal(null);
        window.scrollTo({ top: 0, behavior: "smooth" });

        const snap = await getDoc(doc(db, col, id));
        if (!snap.exists()) {
          if (isMounted) { setPol(null); setGastos([]); setEmendas([]); setPageError("Deputado não encontrado."); setLoading(false); }
          return;
        }

        const data = snap.data();
        let politico = { id: snap.id, ...data };
        try {
          const { map, mapByIdCamara } = await loadRankingOrgExternoMap(db);
          const idC = politico.idCamara != null ? Number(politico.idCamara) : Number(snap.id);
          const ext =
            lookupRankingOrgExterno(map, politico.nome || politico.nomeCompleto) ||
            (Number.isFinite(idC) ? lookupRankingOrgExternoById(mapByIdCamara, idC) : null);
          politico = mergeDeputadoRankingOrg(politico, ext);
        } catch {/* seed / Firestore opcional */}
        if (isMounted) setPol(politico);

        const anosCeap = anosCeapLegislaturaAtual();
        const nomeBusca = String(politico.nome || politico.nomeCompleto || data?.nome || "").trim();
        const idCamaraBusca = politico.idCamara != null ? Number(politico.idCamara) : null;
        const promises = [];

        if (nomeBusca || Number.isFinite(idCamaraBusca)) {
          promises.push((async () => {
            try {
              const getAuditoriaPolitico = httpsCallable(functions, "getAuditoriaPolitico");
              const result = await getAuditoriaPolitico({
                nome: nomeBusca || undefined,
                idCamara: Number.isFinite(idCamaraBusca) ? idCamaraBusca : null,
                anos: anosCeap,
              });
              const despesas = safeArray(result?.data?.despesas).map(normalizeDespesa);
              if (isMounted) {
                setGastos(despesas);
                if (Array.isArray(result?.data?.anosCeap) && result.data.anosCeap.length) {
                  setCeapAnos(result.data.anosCeap);
                } else {
                  setCeapAnos(anosCeap);
                }
              }
            } catch (error) {
              console.error("Erro ao carregar auditoria:", error);
              if (isMounted) { setGastos([]); setAuditError("Auditoria forense temporariamente indisponível."); }
            }
          })());
        } else if (isMounted) setGastos([]);

        promises.push((async () => {
          let fromFs = [];
          try {
            const emendasRef = collection(db, "emendas");
            const emendasQuery = query(emendasRef, where("parlamentarId", "==", id));
            const eSnap = await getDocs(emendasQuery);
            fromFs = eSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch (error) {
            console.error("Erro ao carregar emendas Firestore:", error);
          }

          let fromPortal = [];
          let totaisPortal = null;
          if (nomeBusca) {
            try {
              const getEmendasParlamentar = httpsCallable(functions, "getEmendasParlamentar");
              const er = await getEmendasParlamentar({
                nomeAutor: nomeBusca,
                codigoAutor: Number.isFinite(idCamaraBusca) ? idCamaraBusca : undefined,
                politicoDocId: id,
                anos: anosCeap,
                maxEmendasComDocumentos: 15,
              });
              fromPortal = safeArray(er?.data?.emendas).map((e) => ({
                ...e,
                parlamentarId: id,
              }));
              totaisPortal = er?.data?.totaisAgregados ?? null;
            } catch (error) {
              console.error("Erro ao carregar emendas Portal:", error);
            }
          }

          const mergedFs = fromFs
            .map((e) => ({ ...e, id: String(e.codigo || e.id || "").trim() || e.id }))
            .filter((e) => e.id)
            .sort((a, b) => (Number(b.valorEmpenhado) || Number(b.valor) || 0) - (Number(a.valorEmpenhado) || Number(a.valor) || 0));

          const listaFinal = fromPortal.length > 0 ? fromPortal : mergedFs;

          if (isMounted) {
            setEmendas(listaFinal);
            setEmendasOverride(listaFinal);
            setEmendasTotaisPortal(fromPortal.length > 0 ? totaisPortal : null);
          }
        })());

        await Promise.all(promises);
        if (isMounted) setLoading(false);
      } catch (error) {
        console.error("Erro geral:", error);
        if (isMounted) { setPol(null); setGastos([]); setEmendas([]); setPageError("Não foi possível carregar o dossiê."); setLoading(false); }
      }
    }
    loadPoliticoPage();
    return () => { isMounted = false; };
  }, [col, id]);

  const totalGastos  = useMemo(
    () => gastos.reduce((acc, item) => acc + parseCamaraValorReais(item?.valorLiquido ?? 0), 0),
    [gastos],
  );
  const totalEmendas = useMemo(() => {
    if (emendasTotaisPortal?.valorEmpenhado != null) return Number(emendasTotaisPortal.valorEmpenhado);
    return emendas.reduce((acc, item) => acc + Number(item?.valorEmpenhado || item?.valor || 0), 0);
  }, [emendas, emendasTotaisPortal]);
  const qtdNotas = gastos.length;
  const foto = getFotoPolitico(pol);

  /* ── LOADING ── */
  if (loading) return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-6">
      <div style={{ width: 40, height: 40, border: '3px solid #A8D8B0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  /* ── ERROR ── */
  if (pageError || !pol) return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-6">
      <div className="text-center max-w-xl">
        <h1 className="text-2xl md:text-3xl font-bold font-space text-[#2D2D2D] mb-3">Dossiê indisponível</h1>
        <p className="text-[#6b7280] mb-6">{pageError || "Deputado não encontrado."}</p>
        <Link to="/" className="inline-block py-3 px-8 rounded-lg font-bold text-white bg-[#2D2D2D] hover:bg-[#444] transition-colors">← Voltar ao início</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#2D2D2D] font-sans pb-20">
      {/* ── HEADER ── */}
      <div style={{ borderBottom: "1px solid #EDEBE8", background: "linear-gradient(135deg, #fff 60%, #FBF7E8 100%)", paddingTop: 40, paddingBottom: 32, paddingLeft: 24, paddingRight: 24, marginBottom: 24 }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-6">
          {/* Foto com anel de risco */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img src={foto} alt={pol.nome}
              style={{ width: 104, height: 104, borderRadius: "50%", objectFit: "cover",
                       border: "3px solid #A8D8B0", boxShadow: "0 0 0 4px #A8D8B020" }} />
            <span style={{
              position: "absolute", bottom: 4, right: 4,
              width: 14, height: 14, borderRadius: "50%",
              background: "#2E7F18", border: "2px solid #fff",
            }} title="Auditoria ativa" />
          </div>

          <div className="text-center md:text-left flex-1">
            {/* Breadcrumb */}
            <p style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase",
                        color: "#A8D8B0", fontWeight: 700, marginBottom: 6 }}>
              TransparenciaBR · Dossiê Parlamentar · Dados Abertos
            </p>
            <h1 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 800, color: "#1f2937",
                          letterSpacing: "-0.5px", marginBottom: 4, textTransform: "uppercase" }}>
              {pol.nome}
            </h1>
            <p style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.15em",
                        textTransform: "uppercase", marginBottom: 12 }}>
              {pol.partido} · {normalizeUF(pol.uf, pol.estado)} | {getCargoPolitico(pol)}
            </p>

            {/* Badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 99,
                background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA",
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#DC2626",
                                animation: "spin 1.8s linear infinite" }} />
                Auditoria Ativa
              </span>
              <a href={`https://www.camara.leg.br/deputados/${pol.idCamara ?? id}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 99,
                          background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0",
                          textDecoration: "none", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                🔗 Fonte Oficial ↗
              </a>
              {pol.ranking_org && (
                <a
                  href={
                    pol.ranking_org.perfilPath
                      ? `https://ranking.org.br${pol.ranking_org.perfilPath}`
                      : RANKING_ORG_PAGE
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 99,
                    background: "#FBF7E8", color: "#92400E", border: "1px solid #F0E4A0",
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    textDecoration: "none",
                  }}
                >
                  {pol.ranking_org.semNotaPublicada ? (
                    `Posição #${pol.ranking_org.posicao} (seed) · sem nota no ranking.org ↗`
                  ) : (
                    <>
                      Ranking.org #{pol.ranking_org.posicao} · nota{" "}
                      <span style={{ textDecoration: "underline" }}>{Number(pol.ranking_org.nota).toFixed(2)}</span>
                      {" "}↗
                    </>
                  )}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {pol.ranking_org && (
        <div className="max-w-6xl mx-auto px-6 mb-4">
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 16px", fontSize: 11, color: "#166534", lineHeight: 1.6 }}>
            {pol.ranking_org.semNotaPublicada ? (
              <>
                <strong>Posição #{pol.ranking_org.posicao}</strong> no seed completo (513 mandatos).{" "}
                Este deputado está ativo na Câmara, mas{" "}
                <strong>não há linha com nota</strong> para ele na lista Câmara do{" "}
                <a href={RANKING_ORG_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: "#15803D", fontWeight: 700 }}>ranking.org.br</a> na data do seed.
              </>
            ) : (
              <>
                <strong>Posição e nota</strong> conforme o{" "}
                <a href={RANKING_ORG_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: "#15803D", fontWeight: 700 }}>Ranking dos Políticos</a>
                {" "}(Câmara) — nota{" "}
                <a href={RANKING_ORG_CRITERIA} target="_blank" rel="noopener noreferrer" style={{ color: "#15803D", fontWeight: 800, textDecoration: "underline" }}>
                  {Number(pol.ranking_org.nota).toFixed(2)}
                </a>
                .{" "}
                <a href={RANKING_ORG_CRITERIA} target="_blank" rel="noopener noreferrer" style={{ color: "#15803D", textDecoration: "underline" }}>Metodologia ↗</a>
              </>
            )}
            {pol.score != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
                · Índice TransparenciaBR: <ScoreBadge score={parseFloat(pol.score)} size="sm" />
              </span>
            )}
          </div>
        </div>
      )}

      {pol.idCamara && (
        <div className="max-w-6xl mx-auto px-6 mb-4">
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
            padding: "16px 24px", background: "rgba(255,255,255,0.72)",
            borderRadius: 16, border: "1px solid #EDEBE8",
          }}>
            {[
              { icon: "📝", label: "Proposições", value: atividadeData?.totalProposicoes ?? "..." },
              { icon: "🎤", label: "Discursos", value: atividadeData?.discursos?.total ?? "..." },
              { icon: "🤝", label: "Frentes", value: atividadeData?.totalFrentes ?? "..." },
              { icon: "🏛️", label: "Comissões", value: atividadeData?.totalOrgaos ?? "..." },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1f2937" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer IA */}
      <div className="max-w-6xl mx-auto px-6 mb-4">
        <div style={{ background: "#FBF7E8", border: "1px solid #F0E4A0", borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⚡</span>
          <p style={{ fontSize: 11, color: "#7A6A20", margin: 0, lineHeight: 1.6 }}>
            <strong>Análise probabilística por IA — pode cometer erros.</strong>{" "}
            Dados extraídos de fontes públicas. Antes de qualquer decisão, verifique em:{" "}
            <a href="https://portaldatransparencia.gov.br" target="_blank" rel="noopener noreferrer"
              style={{ color: "#7A6A20", fontWeight: 700, textDecoration: "underline" }}>
              Portal da Transparência ↗
            </a>
          </p>
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Gasto CEAP Auditado" value={fmtMoney(totalGastos)} accent="gold" />
            <StatCard label="Notas Fiscais" value={qtdNotas} accent="white" />
            <StatCard label="Total de Emendas" value={fmtMoney(totalEmendas)} accent="teal" />
          </div>

          <div className="bg-white border border-[#EDEBE8] rounded-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 border-b border-[#EDEBE8] pb-4">
              <div>
                <h3 className="text-xl text-[#2D2D2D] font-space font-bold flex items-center gap-2">
                  <span>🔍</span>Dossiê de Notas Fiscais (CEAP)
                </h3>
                <p className="text-[11px] text-[#9ca3af] mt-1">
                  Legislatura atual · anos {ceapAnos.length ? ceapAnos.slice().sort((a, b) => a - b).join(", ") : "—"} · API{" "}
                  <a href="https://dadosabertos.camara.leg.br/swagger/api.html" target="_blank" rel="noopener noreferrer" className="underline text-[#6b7280]">dados abertos Câmara ↗</a>
                </p>
              </div>
              <a href={`https://portaldatransparencia.gov.br/verbas-indenizatorias/consulta?nome=${encodeURIComponent(pol.nome)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-[#6b7280] border border-[#EDEBE8] rounded-md px-3 py-1 hover:bg-[#f9fafb] transition-colors no-underline shrink-0">
                🔗 Portal da Transparência ↗
              </a>
            </div>
            {auditError && (
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">{auditError}</div>
            )}
            <div className="space-y-3">
              {gastos.length === 0 ? (
                <div className="text-center py-10 text-[#9ca3af] text-sm">
                  Nenhuma despesa CEAP retornada para este mandato. Verifique o cadastro do deputado ou tente mais tarde.
                </div>
              ) : (
                <CreditGate custo={2} descricao="CEAP completo — deputado">
                  <>
                    <p className="text-[11px] text-[#6b7280] mb-3">
                      Exibindo {Math.min(CEAP_LIST_MAX, gastos.length)} de {gastos.length} lançamentos · cada linha com link abre o PDF oficial na Câmara (dados para análise por IA).
                    </p>
                    {gastos.slice(0, CEAP_LIST_MAX).map((g) => (
                      <div key={g.id}
                        className={`flex justify-between items-center gap-4 p-4 rounded-lg border transition-all ${
                          g.isLocked ? "bg-red-50 border-red-200 cursor-pointer hover:bg-red-100" : "bg-[#FAFAF8] border-[#EDEBE8] hover:bg-[#f3f4f6]"
                        }`}
                        onClick={() => { if (g.isLocked) navigate("/creditos"); }}
                      >
                        <div className={`min-w-0 ${g.isLocked ? "blur-[3px] select-none" : ""}`}>
                          {g.isLocked ? (
                            <p className="font-bold text-sm truncate text-red-500">FORNECEDOR EM SIGILO</p>
                          ) : g.fornecedorNome ? (
                            <p className="font-bold text-sm truncate text-[#2D2D2D]">{g.fornecedorNome}</p>
                          ) : (
                            <p className="text-sm text-gray-500 italic">Fornecedor não informado (Dados da Câmara)</p>
                          )}
                          <p className="text-xs text-[#9ca3af] mt-1">
                            {g.anoRef ? <span className="font-semibold text-[#6b7280]">{g.anoRef} · </span> : null}
                            {g.tipoDespesa}
                          </p>
                          <p className={`text-[11px] mt-1 font-semibold uppercase tracking-wide ${getStatusTone(g.analiseForense)}`}>{g.analiseForense}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-space font-bold ${g.isLocked ? "text-red-500" : "text-[#2E7F6E]"}`}>{fmtMoney(g.valorLiquido)}</p>
                          {g.isLocked ? (
                            <button type="button" className="text-[10px] bg-[#2D2D2D] text-white px-3 py-1.5 rounded mt-2 font-bold hover:bg-[#444] transition-colors">🔓 VER PROVA (1 CRÉDITO)</button>
                          ) : g.urlDocumento ? (
                            <a
                              href={g.urlDocumento}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block text-[10px] font-bold text-white bg-[#15803D] px-3 py-1.5 rounded-md mt-2 no-underline hover:bg-[#166534] shadow-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              📄 Abrir nota (PDF) ↗
                            </a>
                          ) : (
                            <span className="text-[10px] text-[#d1d5db] mt-2 block">Sem URL pública da nota</span>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="bg-[#FAFAF8] border border-[#EDEBE8] rounded-xl p-6 shadow-sm mt-6">
                      <GastosChart data={gastos} />
                    </div>
                  </>
                </CreditGate>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {pol.scorePilares && (
            <div className="bg-white rounded-xl border border-[#EDEBE8] overflow-hidden shadow-sm">
              <ScorePilaresCard scorePilares={pol.scorePilares} />
            </div>
          )}
          <div className="bg-white rounded-xl border border-[#EDEBE8] p-6 shadow-sm">
            <h3 className="text-lg text-[#2D2D2D] font-bold mb-4 border-b border-[#EDEBE8] pb-2">Rastro de Emendas</h3>
            <CreditGate custo={1} descricao="Emendas do deputado">
              <EmendasAba
                deputadoId={id}
                nomeDeputado={pol.nome}
                emendasOverride={emendasOverride}
                totaisAgregadosOverride={emendasTotaisPortal}
              />
            </CreditGate>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8 space-y-8">
        <SectionCard title="Motor Forense" icon="🔬" tone="danger">
          <ForensicDashboard
            idCamara={pol.idCamara || id}
            nome={pol.nome}
            cpf={pol.cpf}
            preview
          />
        </SectionCard>

        <SectionCard title="Análise Forense Detalhada" icon="🛡️">
          <CreditGate custo={3} descricao="Alertas forenses detalhados">
            <ForensicDashboard
              idCamara={pol.idCamara || id}
              nome={pol.nome}
              cpf={pol.cpf}
            />
          </CreditGate>
        </SectionCard>

        {/* Atividade Parlamentar Completa */}
        <SectionCard title="Atividade Parlamentar" icon="📊">
          <CreditGate custo={2} descricao="Atividade parlamentar completa">
            <AtividadeParlamentarSection
              deputadoId={id}
              idCamara={pol.idCamara || id}
              nome={pol.nome}
              colecao={col}
            />
          </CreditGate>
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <SectionCard title="Assiduidade em Plenário" icon="🏛️">
            <PresencaSection politico={pol} colecao={col} politicoId={id} />
          </SectionCard>
          <SectionCard title="Produção Legislativa (Resumo)" icon="📚">
            <ProjetosSection deputadoId={id} idCamara={pol.idCamara || id} colecao={col} />
          </SectionCard>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {gastos.length > 0 ? (
            <SectionCard title="Radar de Fretamento" icon="✈️" tone="danger">
              <AlertasFretamento gastos={gastos} politico={pol} />
            </SectionCard>
          ) : (
            <SectionCard title="Radar de Fretamento" icon="✈️" tone="danger">
              <div className="text-sm text-[#9ca3af]">Sem despesas suficientes para análise de fretamento.</div>
            </SectionCard>
          )}
          <SectionCard title="Monitor de Nepotismo Cruzado" icon="🧬" tone="teal">
            <NepotismoCard deputadoId={id} colecao={col} />
          </SectionCard>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          <SectionCard title="Folha do Gabinete" icon="🏢">
            <VerbaGabineteSection colecao={col} politicoId={id} idCamara={pol.idCamara || id} />
          </SectionCard>
          <SectionCard title="Rastreio de Convênios" icon="📨">
            <EncaminhamentoEmendas politicoId={id} nomeAutor={pol.nome} />
          </SectionCard>
        </div>
        <div className="text-center pb-10">
          <Link to="/" className="inline-block py-3 px-8 rounded-lg font-bold text-white bg-[#2D2D2D] hover:bg-[#444] transition-colors">← Voltar ao início</Link>
        </div>
      </div>
    </div>
  );
}
