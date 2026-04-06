import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../lib/firebase";

import GastosChart from "../components/GastosChart";
import EmendasAba from "../components/EmendasAba";
import ScorePilaresCard from "../components/ScorePilaresCard";
import PresencaSection from "../components/PresencaSection";
import ProjetosSection from "../components/ProjetosSection";
import AlertasFretamento from "../components/AlertasFretamento";
import NepotismoCard from "../components/NepotismoCard";
import VerbaGabineteSection from "../components/VerbaGabineteSection";
import EncaminhamentoEmendas from "../components/EncaminhamentoEmendas";

function fmtMoney(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDespesa(item, index) {
  return {
    id:
      item?.id ||
      item?.urlDocumento ||
      `${item?.txtFornecedor || "fornecedor"}-${item?.datEmissao || index}-${index}`,
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

  if (text.includes("VERMELHO") || text.includes("CRÍT") || text.includes("CRIT")) {
    return "text-red-400";
  }

  if (text.includes("AMARELO") || text.includes("ALERTA")) {
    return "text-yellow-400";
  }

  return "text-emerald-400";
}

function StatCard({ label, value, accent = "gold" }) {
  const accentMap = {
    gold: "border-[#c9a84c]/30 text-[#c9a84c]",
    teal: "border-[#3d6b5e]/50 text-[#5a9e8f]",
    white: "border-gray-700 text-white",
  };

  return (
    <div className={`bg-[#12121a] border rounded-xl p-5 shadow-lg ${accentMap[accent] || accentMap.white}`}>
      <div className="text-[#8a8a9e] text-xs uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-2xl font-bold font-space ${accentMap[accent]?.split(" ").pop() || "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, tone = "default" }) {
  const toneClasses =
    tone === "danger"
      ? "bg-[#12121a] rounded-xl border border-red-900/30 p-6 shadow-lg relative overflow-hidden"
      : tone === "teal"
      ? "bg-[#12121a] rounded-xl border border-[#3d6b5e]/30 p-6 shadow-lg"
      : "bg-[#12121a] rounded-xl border border-gray-800 p-6 shadow-lg";

  const titleClasses =
    tone === "danger"
      ? "text-lg text-red-400 font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2 relative z-10"
      : tone === "teal"
      ? "text-lg text-[#5a9e8f] font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2"
      : "text-lg text-white font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2";

  return (
    <div className={toneClasses}>
      {tone === "danger" && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-900/10 rounded-full blur-3xl" />
      )}
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
          if (isMounted) {
            setPol(null);
            setGastos([]);
            setEmendas([]);
            setPageError("Dossiê não encontrado.");
            setLoading(false);
          }
          return;
        }

        const data = snap.data();
        const politico = { id: snap.id, ...data };

        if (isMounted) {
          setPol(politico);
        }

        const nomeDoPolitico = data?.nome || "";
        const promises = [];

        if (nomeDoPolitico) {
          promises.push(
            (async () => {
              try {
                const functions = getFunctions(undefined, "southamerica-east1");
                const getAuditoriaPolitico = httpsCallable(functions, "getAuditoriaPolitico");
                const result = await getAuditoriaPolitico({
                  nome: nomeDoPolitico,
                  ano: 2024,
                });

                const despesas = safeArray(result?.data?.despesas).map(normalizeDespesa);

                if (isMounted) {
                  setGastos(despesas);
                }
              } catch (error) {
                console.error("Erro ao carregar auditoria do político:", error);
                if (isMounted) {
                  setGastos([]);
                  setAuditError("Auditoria forense temporariamente indisponível.");
                }
              }
            })()
          );
        } else if (isMounted) {
          setGastos([]);
        }

        promises.push(
          (async () => {
            try {
              const emendasRef = collection(db, "emendas");
              const emendasQuery = query(emendasRef, where("parlamentarId", "==", id));
              const eSnap = await getDocs(emendasQuery);

              if (isMounted) {
                setEmendas(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
              }
            } catch (error) {
              console.error("Erro ao carregar emendas:", error);
              if (isMounted) {
                setEmendas([]);
              }
            }
          })()
        );

        await Promise.all(promises);

        if (isMounted) {
          setLoading(false);
        }
      } catch (error) {
        console.error("Erro geral ao carregar página do político:", error);
        if (isMounted) {
          setPol(null);
          setGastos([]);
          setEmendas([]);
          setPageError("Não foi possível carregar o dossiê no momento.");
          setLoading(false);
        }
      }
    }

    loadPoliticoPage();

    return () => {
      isMounted = false;
    };
  }, [col, id]);

  const totalGastos = useMemo(
    () => gastos.reduce((acc, item) => acc + Number(item?.valorLiquido || 0), 0),
    [gastos]
  );

  const totalEmendas = useMemo(
    () => emendas.reduce((acc, item) => acc + Number(item?.valorEmpenhado || 0), 0),
    [emendas]
  );

  const qtdNotas = gastos.length;
  const foto = getFotoPolitico(pol);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] flex items-center justify-center px-6">
        <div className="text-[#c9a84c] font-space animate-pulse text-center text-lg md:text-xl tracking-widest">
          ESTABELECENDO CONEXÃO SEGURA COM O NÚCLEO A.S.M.O.D.E.U.S...
        </div>
      </div>
    );
  }

  if (pageError || !pol) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-xl">
          <h1 className="text-2xl md:text-3xl font-bold font-space text-[#c9a84c] mb-3">
            Dossiê indisponível
          </h1>
          <p className="text-gray-400 mb-6">{pageError || "Dossiê não encontrado."}</p>
          <Link
            to="/"
            className="inline-block py-3 px-8 rounded-lg font-bold text-black bg-[#c9a84c] hover:bg-white transition-colors"
          >
            ← Retornar ao Terminal Central
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0F] text-[#e0e0e0] font-sans pb-20">
      <div className="border-b border-[#c9a84c]/20 bg-[#12121a] pt-10 pb-8 px-6 mb-8 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: "linear-gradient(#c9a84c 1px, transparent 1px)",
            backgroundSize: "100% 4px",
          }}
        />
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-6 relative z-10">
          <img
            src={foto}
            alt={pol.nome}
            className="w-28 h-28 rounded-full border-2 border-[#c9a84c] shadow-[0_0_20px_rgba(201,168,76,0.3)] object-cover bg-[#0f0f14]"
          />

          <div className="text-center md:text-left flex-1">
            <p className="text-[11px] tracking-[0.35em] uppercase text-[#c9a84c] mb-2">
              Núcleo A.S.M.O.D.E.U.S.
            </p>

            <h1 className="text-3xl md:text-4xl font-bold font-space text-white tracking-tight uppercase">
              {pol.nome}
            </h1>

            <p className="text-[#8a8a9e] mt-1 text-sm tracking-widest uppercase">
              {pol.partido} • {pol.uf} | {getCargoPolitico(pol)}
            </p>

            <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-3">
              <span className="bg-red-900/30 text-red-400 border border-red-500/50 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider animate-pulse flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Auditoria Ativa
              </span>

              <a
                href={`https://www.camara.leg.br/deputados/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[#3d6b5e] text-[#5a9e8f] px-3 py-1 rounded text-xs font-bold uppercase hover:bg-[#3d6b5e]/20 transition-all"
              >
                Fonte Oficial ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Gasto CEAP Auditado" value={fmtMoney(totalGastos)} accent="gold" />
            <StatCard label="Notas Fiscais" value={qtdNotas} accent="white" />
            <StatCard label="Total de Emendas" value={fmtMoney(totalEmendas)} accent="teal" />
          </div>

          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6 shadow-lg relative">
            <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
              <h3 className="text-xl text-[#c9a84c] font-space font-bold flex items-center gap-2">
                <span>🔍</span>
                Dossiê de Notas Fiscais
              </h3>
            </div>

            {auditError ? (
              <div className="mb-4 rounded-lg border border-yellow-700/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
                {auditError}
              </div>
            ) : null}

            <div className="space-y-3">
              {gastos.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">
                  Nenhuma despesa auditada disponível para exibição.
                </div>
              ) : (
                gastos.slice(0, 15).map((g) => (
                  <div
                    key={g.id}
                    className={`flex justify-between items-center gap-4 p-4 rounded-lg transition-all ${
                      g.isLocked
                        ? "bg-red-900/10 border-l-4 border-red-600 cursor-pointer hover:bg-red-900/20"
                        : "bg-white/5 border-l-4 border-[#3d6b5e] hover:bg-white/10"
                    }`}
                    onClick={() => {
                      if (g.isLocked) navigate("/creditos");
                    }}
                  >
                    <div className={`min-w-0 ${g.isLocked ? "blur-[3px] select-none" : ""}`}>
                      <p className={`font-bold text-sm truncate ${g.isLocked ? "text-red-400" : "text-white"}`}>
                        {g.isLocked ? "FORNECEDOR EM SIGILO" : g.fornecedorNome}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{g.tipoDespesa}</p>
                      <p className={`text-[11px] mt-1 font-semibold uppercase tracking-wide ${getStatusTone(g.analiseForense)}`}>
                        {g.analiseForense}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`font-space font-bold ${g.isLocked ? "text-red-400" : "text-[#5a9e8f]"}`}>
                        {fmtMoney(g.valorLiquido)}
                      </p>

                      {g.isLocked ? (
                        <button
                          type="button"
                          className="text-[10px] bg-[#c9a84c] text-black px-3 py-1.5 rounded mt-2 font-bold hover:bg-white transition-colors"
                        >
                          🔓 VER PROVA (1 CRÉDITO)
                        </button>
                      ) : g.urlDocumento ? (
                        <a
                          href={g.urlDocumento}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-gray-500 underline mt-2 block hover:text-white"
                        >
                          Nota Oficial
                        </a>
                      ) : (
                        <span className="text-[10px] text-gray-600 mt-2 block">Sem nota pública</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {gastos.length > 0 ? (
            <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
              <GastosChart data={gastos} />
            </div>
          ) : null}
        </div>

        <div className="space-y-8">
          {pol.scorePilares ? (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
              <ScorePilaresCard scorePilares={pol.scorePilares} />
            </div>
          ) : null}

          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
            <h3 className="text-lg text-white font-bold mb-4 border-b border-gray-800 pb-2">
              Rastro de Emendas
            </h3>
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
              <div className="text-sm text-gray-400">
                Sem despesas suficientes para análise de fretamento nesta consulta.
              </div>
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
          <Link
            to="/"
            className="inline-block py-3 px-8 rounded-lg font-bold text-black bg-[#c9a84c] hover:bg-white transition-colors"
          >
            ← Retornar ao Terminal Central
          </Link>
        </div>
      </div>
    </div>
  );
}
