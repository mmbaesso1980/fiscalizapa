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
} from "../utils/rankingOrg";
import { anosCeapHistoricoCompleto } from "../utils/legislatura";

function fmtMoney(value) {
  const n = parseCamaraValorReais(value ?? 0);
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtEmendaMoney(value) {
  const n = parseCamaraValorReais(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "–";
  if (Math.abs(n) >= 1_000_000) {
    return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `R$ ${(n / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  }
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

const cardShell = {
  background: "#ffffff",
  borderRadius: "0.75rem",
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 2px 0 rgb(15 23 42 / 0.06)",
  padding: "20px 22px",
};

function StatCard({ label, value }) {
  return (
    <div style={{ ...cardShell, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div style={cardShell}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        {icon ? <span style={{ fontSize: 18 }}>{icon}</span> : null}
        <h3 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 16, fontWeight: 700, color: "#1e293b", margin: 0,
        }}>{title}</h3>
      </div>
      {children}
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
  const [ceapAnos, setCeapAnos] = useState(() => anosCeapHistoricoCompleto());
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

        const anosCeap = anosCeapHistoricoCompleto();
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
    <div className="min-h-screen bg-white text-[#1e293b] font-sans pb-20">
      <div style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff", paddingTop: 28, paddingBottom: 24, paddingLeft: 24, paddingRight: 24, marginBottom: 20 }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-5">
          <img
            src={foto}
            alt={pol.nome}
            style={{
              width: 88, height: 88, borderRadius: "50%", objectFit: "cover",
              border: "2px solid #e2e8f0", flexShrink: 0,
            }}
          />
          <div className="text-center md:text-left flex-1">
            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 700, color: "#1e293b",
              marginBottom: 8, letterSpacing: "-0.02em",
            }}>
              {pol.nome}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 10 }}>
              {[pol.partido, normalizeUF(pol.uf, pol.estado), getCargoPolitico(pol)].filter(Boolean).map((t) => (
                <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#f3f4f6", color: "#6b7280" }}>
                  {t}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              <a href={`https://www.camara.leg.br/deputados/${pol.idCamara ?? id}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 99, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", textDecoration: "none" }}>
                Fonte oficial ↗
              </a>
              {pol.ranking_org && (
                <a href={pol.ranking_org.perfilPath ? `https://ranking.org.br${pol.ranking_org.perfilPath}` : RANKING_ORG_PAGE} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 99, background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", textDecoration: "none" }}>
                  {pol.ranking_org.semNotaPublicada ? `Ranking #${pol.ranking_org.posicao} (seed)` : `Ranking #${pol.ranking_org.posicao} · ${Number(pol.ranking_org.nota).toFixed(2)}`}
                </a>
              )}
              {pol.score != null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <ScoreBadge score={parseFloat(pol.score)} size="sm" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 mb-4">
        <div style={{
          background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8,
          padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 12 }}>⚠️</span>
          <p style={{ fontSize: 11, color: "#92400e", margin: 0 }}>
            Análise por IA — pode conter erros. Verifique em{" "}
            <a href="https://portaldatransparencia.gov.br" target="_blank" rel="noopener noreferrer" style={{ color: "#92400e", fontWeight: 700, textDecoration: "underline" }}>
              Portal da Transparência ↗
            </a>
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 space-y-6">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <StatCard label="Gasto CEAP auditado" value={fmtMoney(totalGastos)} />
          <StatCard label="Notas fiscais" value={qtdNotas} />
          <StatCard label="Emendas" value={fmtEmendaMoney(totalEmendas)} />
          <StatCard label="Proposições" value={atividadeData?.totalProposicoes ?? "—"} />
        </div>

        {pol.scorePilares && (
          <div style={{ ...cardShell, padding: 0, overflow: "hidden" }}>
            <ScorePilaresCard scorePilares={pol.scorePilares} />
          </div>
        )}

        <SectionCard title="Dossiê de Notas Fiscais (CEAP)" icon="💰">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 pb-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
            <p className="text-[11px] text-[#6b7280] m-0">
              Anos {ceapAnos.length ? ceapAnos.slice().sort((a, b) => a - b).join(", ") : "—"} ·{" "}
              <a href="https://dadosabertos.camara.leg.br/swagger/api.html" target="_blank" rel="noopener noreferrer" className="underline text-[#6b7280]">API Câmara ↗</a>
            </p>
            <a href={`https://portaldatransparencia.gov.br/verbas-indenizatorias/consulta?nome=${encodeURIComponent(pol.nome)}`} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-[#15803d] font-semibold no-underline">Portal da Transparência ↗</a>
          </div>
          {auditError && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{auditError}</div>}
          {gastos.length === 0 ? (
            <p className="text-sm text-[#6b7280]">Nenhuma despesa CEAP retornada para este mandato.</p>
          ) : (
            <CreditGate custo={2} descricao="CEAP completo — deputado">
              <>
                <p className="text-[11px] text-[#6b7280] mb-3">
                  {Math.min(CEAP_LIST_MAX, gastos.length)} de {gastos.length} lançamentos · PDF oficial na Câmara.
                </p>
                {gastos.slice(0, CEAP_LIST_MAX).map((g) => (
                  <div key={g.id}
                    className={`flex justify-between items-center gap-4 p-3 rounded-lg border mb-2 ${g.isLocked ? "bg-red-50 border-red-200 cursor-pointer" : "bg-[#fafafa] border-[#e2e8f0]"}`}
                    onClick={() => { if (g.isLocked) navigate("/creditos"); }}
                  >
                    <div className={`min-w-0 ${g.isLocked ? "blur-[3px] select-none" : ""}`}>
                      {g.isLocked ? <p className="font-bold text-sm text-red-600">Fornecedor em sigilo</p> : g.fornecedorNome ? (
                        <p className="font-bold text-sm text-[#1e293b] truncate">{g.fornecedorNome}</p>
                      ) : <p className="text-sm text-gray-500 italic">Fornecedor não informado</p>}
                      <p className="text-xs text-[#9ca3af] mt-1">{g.anoRef ? `${g.anoRef} · ` : ""}{g.tipoDespesa}</p>
                      <p className={`text-[11px] mt-1 font-semibold uppercase ${getStatusTone(g.analiseForense)}`}>{g.analiseForense}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${g.isLocked ? "text-red-600" : "text-[#1B5E3B]"}`}>{fmtMoney(g.valorLiquido)}</p>
                      {g.isLocked ? (
                        <button type="button" className="text-[10px] bg-[#1B5E3B] text-white px-2 py-1 rounded mt-1 font-bold">Desbloquear</button>
                      ) : g.urlDocumento ? (
                        <a href={g.urlDocumento} target="_blank" rel="noopener noreferrer" className="inline-block text-[10px] font-bold text-white bg-[#15803D] px-2 py-1 rounded mt-1 no-underline" onClick={(e) => e.stopPropagation()}>PDF ↗</a>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-4 rounded-lg border border-[#e2e8f0] bg-[#fafafa]">
                  <GastosChart data={gastos} />
                </div>
              </>
            </CreditGate>
          )}
        </SectionCard>

        <SectionCard title="Rastro de Emendas" icon="📋">
          <CreditGate custo={1} descricao="Emendas do deputado">
            <EmendasAba deputadoId={id} nomeDeputado={pol.nome} emendasOverride={emendasOverride} totaisAgregadosOverride={emendasTotaisPortal} />
          </CreditGate>
        </SectionCard>

        <SectionCard title="Motor Forense TransparenciaBR" icon="🔬">
          <ForensicDashboard idCamara={pol.idCamara || id} nome={pol.nome} cpf={pol.cpf} preview />
        </SectionCard>

        <SectionCard title="Análise Forense Detalhada" icon="🛡️">
          <CreditGate custo={3} descricao="Alertas forenses detalhados">
            <ForensicDashboard idCamara={pol.idCamara || id} nome={pol.nome} cpf={pol.cpf} />
          </CreditGate>
        </SectionCard>

        <SectionCard title="Atividade Parlamentar" icon="📊">
          <CreditGate custo={2} descricao="Atividade parlamentar completa">
            <AtividadeParlamentarSection deputadoId={id} idCamara={pol.idCamara || id} nome={pol.nome} colecao={col} />
          </CreditGate>
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SectionCard title="Assiduidade em Plenário" icon="🏛️">
            <PresencaSection politico={pol} colecao={col} politicoId={id} />
          </SectionCard>
          <SectionCard title="Produção Legislativa" icon="📚">
            <ProjetosSection deputadoId={id} idCamara={pol.idCamara || id} colecao={col} />
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SectionCard title="Monitor de Nepotismo Cruzado" icon="🧬">
            <NepotismoCard deputadoId={id} colecao={col} />
          </SectionCard>
          <SectionCard title="Folha do Gabinete" icon="🏢">
            <VerbaGabineteSection colecao={col} politicoId={id} idCamara={pol.idCamara || id} />
          </SectionCard>
        </div>

        <SectionCard title="Rastreio de Convênios" icon="📨">
          <EncaminhamentoEmendas politicoId={id} nomeAutor={pol.nome} />
        </SectionCard>

        <div className="text-center pb-10">
          <Link to="/" style={{
            display: "inline-block", padding: "10px 24px", borderRadius: 8, fontWeight: 700, color: "#fff",
            background: "#1B5E3B", textDecoration: "none", fontSize: 14,
          }}>← Voltar ao início</Link>
        </div>
      </div>
    </div>
  );
}
