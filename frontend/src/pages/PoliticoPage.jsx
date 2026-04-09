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

function fmtMoney(value) {
  const n = parseFloat(String(value ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  if (isNaN(n)) return "–";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDespesa(item, index) {
  return {
    id: item?.id || item?.urlDocumento || `${item?.txtFornecedor || "fornecedor"}-${item?.datEmissao || index}-${index}`,
    valorLiquido: Number(item?.vlrLiquido || item?.valorLiquido || 0),
    tipoDespesa: item?.txtDescricao || item?.tipoDespesa || "Sem categoria",
    fornecedorNome: item?.txtFornecedor || item?.fornecedorNome || "Desconhecido",
    dataDocumento: item?.datEmissao || item?.dataDocumento || "",
    urlDocumento: item?.urlDocumento || "",
    cnpjCpf: item?.txtCNPJCPF || item?.cnpjCpf || "",
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
  const [loading, setLoading] = useState(true);
  const [auditError, setAuditError] = useState("");
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let isMounted = true;
    async function loadPoliticoPage() {
      try {
        setLoading(true);
        setPageError("");
        setAuditError("");
        window.scrollTo({ top: 0, behavior: "smooth" });

        const snap = await getDoc(doc(db, col, id));
        if (!snap.exists()) {
          if (isMounted) { setPol(null); setGastos([]); setEmendas([]); setPageError("Deputado não encontrado."); setLoading(false); }
          return;
        }

        const data = snap.data();
        const politico = { id: snap.id, ...data };
        if (isMounted) setPol(politico);

        const nomeDoPolitico = data?.nome || "";
        const promises = [];

        if (nomeDoPolitico) {
          promises.push((async () => {
            try {
              const getAuditoriaPolitico = httpsCallable(functions, "getAuditoriaPolitico");
              const result = await getAuditoriaPolitico({ nome: nomeDoPolitico, ano: 2024 });
              const despesas = safeArray(result?.data?.despesas).map(normalizeDespesa);
              if (isMounted) setGastos(despesas);
            } catch (error) {
              console.error("Erro ao carregar auditoria:", error);
              if (isMounted) { setGastos([]); setAuditError("Auditoria forense temporariamente indisponível."); }
            }
          })());
        } else if (isMounted) setGastos([]);

        promises.push((async () => {
          try {
            const emendasRef = collection(db, "emendas");
            const emendasQuery = query(emendasRef, where("parlamentarId", "==", id));
            const eSnap = await getDocs(emendasQuery);
            if (isMounted) setEmendas(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
          } catch (error) {
            console.error("Erro ao carregar emendas:", error);
            if (isMounted) setEmendas([]);
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

  const totalGastos  = useMemo(() => gastos.reduce((acc, item) => acc + Number(item?.valorLiquido || 0), 0), [gastos]);
  const totalEmendas = useMemo(() => emendas.reduce((acc, item) => acc + Number(item?.valorEmpenhado || 0), 0), [emendas]);
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
      {/* ── HEADER A.S.M.O.D.E.U.S. ── */}
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
              A.S.M.O.D.E.U.S. · Dossiê Parlamentar · Dados Abertos
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
              {pol.score != null && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 99,
                  background: "#FBF7E8", color: "#92400E", border: "1px solid #F0E4A0",
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}>
                  Score {parseFloat(pol.score ?? pol.indice_transparenciabr ?? 0).toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

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
            <div className="flex justify-between items-center mb-6 border-b border-[#EDEBE8] pb-4">
              <h3 className="text-xl text-[#2D2D2D] font-space font-bold flex items-center gap-2">
                <span>🔍</span>Dossiê de Notas Fiscais
              </h3>
              <a href={`https://portaldatransparencia.gov.br/verbas-indenizatorias/consulta?nome=${encodeURIComponent(pol.nome)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-[#6b7280] border border-[#EDEBE8] rounded-md px-3 py-1 hover:bg-[#f9fafb] transition-colors no-underline">
                🔗 Portal da Transparência ↗
              </a>
            </div>
            {auditError && (
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">{auditError}</div>
            )}
            <div className="space-y-3">
              {gastos.length === 0 ? (
                <div className="text-center py-10 text-[#9ca3af] text-sm">Nenhuma despesa auditada disponível para exibição.</div>
              ) : (
                gastos.slice(0, 15).map((g) => (
                  <div key={g.id}
                    className={`flex justify-between items-center gap-4 p-4 rounded-lg border transition-all ${
                      g.isLocked ? "bg-red-50 border-red-200 cursor-pointer hover:bg-red-100" : "bg-[#FAFAF8] border-[#EDEBE8] hover:bg-[#f3f4f6]"
                    }`}
                    onClick={() => { if (g.isLocked) navigate("/creditos"); }}
                  >
                    <div className={`min-w-0 ${g.isLocked ? "blur-[3px] select-none" : ""}`}>
                      <p className={`font-bold text-sm truncate ${g.isLocked ? "text-red-500" : "text-[#2D2D2D]"}`}>
                        {g.isLocked ? "FORNECEDOR EM SIGILO" : g.fornecedorNome}
                      </p>
                      <p className="text-xs text-[#9ca3af] mt-1">{g.tipoDespesa}</p>
                      <p className={`text-[11px] mt-1 font-semibold uppercase tracking-wide ${getStatusTone(g.analiseForense)}`}>{g.analiseForense}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-space font-bold ${g.isLocked ? "text-red-500" : "text-[#2E7F6E]"}`}>{fmtMoney(g.valorLiquido)}</p>
                      {g.isLocked ? (
                        <button type="button" className="text-[10px] bg-[#2D2D2D] text-white px-3 py-1.5 rounded mt-2 font-bold hover:bg-[#444] transition-colors">🔓 VER PROVA (1 CRÉDITO)</button>
                      ) : g.urlDocumento ? (
                        <a href={g.urlDocumento} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#6b7280] underline mt-2 block hover:text-[#2D2D2D]">🔗 Nota Oficial ↗</a>
                      ) : (
                        <span className="text-[10px] text-[#d1d5db] mt-2 block">Sem nota pública</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {gastos.length > 0 && (
            <div className="bg-white border border-[#EDEBE8] rounded-xl p-6 shadow-sm">
              <GastosChart data={gastos} />
            </div>
          )}
        </div>

        <div className="space-y-8">
          {pol.scorePilares && (
            <div className="bg-white rounded-xl border border-[#EDEBE8] overflow-hidden shadow-sm">
              <ScorePilaresCard scorePilares={pol.scorePilares} />
            </div>
          )}
          <div className="bg-white rounded-xl border border-[#EDEBE8] p-6 shadow-sm">
            <h3 className="text-lg text-[#2D2D2D] font-bold mb-4 border-b border-[#EDEBE8] pb-2">Rastro de Emendas</h3>
            <EmendasAba deputadoId={id} colecao={col} nomeDeputado={pol.nome} />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <SectionCard title="Assiduidade em Plenário" icon="🏛️">
            <PresencaSection politico={pol} colecao={col} politicoId={id} />
          </SectionCard>
          <SectionCard title="Produção Legislativa" icon="📚">
            <ProjetosSection deputadoId={id} colecao={col} />
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
