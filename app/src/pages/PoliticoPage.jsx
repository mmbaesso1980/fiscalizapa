import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";

import GastosChart from "../components/GastosChart";
import EmendasAba from "../components/EmendasAba";
import ScorePilaresCard from "../components/ScorePilaresCard";
import PresencaSection from "../components/PresencaSection";
import ProjetosSection from "../components/ProjetosSection";
import AlertasFretamento from "../components/AlertasFretamento";
import NepotismoCard from "../components/NepotismoCard";
import VerbaGabineteSection from "../components/VerbaGabineteSection";
import EncaminhamentoEmendas from "../components/EncaminhamentoEmendas";

function fmt(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PoliticoPage({ user }) {
  const { colecao, id } = useParams();
  const navigate = useNavigate();
  const col = colecao || "deputados_federais";

  const [pol, setPol] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [emendas, setEmendas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    
    async function load() {
      setLoading(true);
      let nomeDoPolitico = "";

      const snap = await getDoc(doc(db, col, id));
      if (snap.exists()) {
        const data = snap.data();
        nomeDoPolitico = data.nome;
        setPol({ id: snap.id, ...data });
      }

      if (nomeDoPolitico) {
        try {
          const fns = getFunctions(undefined, "southamerica-east1");
          const getAuditoria = httpsCallable(fns, "getAuditoriaPolitico");
          
          const result = await getAuditoria({ 
            nome: nomeDoPolitico, 
            ano: 2024 
          });

          if (result.data && result.data.despesas && result.data.despesas.length > 0) {
            const gastosTraduzidos = result.data.despesas.map(g => ({
              id: g.urlDocumento || Math.random().toString(),
              valorLiquido: g.vlrLiquido || 0,
              tipoDespesa: g.txtDescricao || "Sem Categoria",
              fornecedorNome: g.txtFornecedor || "Desconhecido",
              dataDocumento: g.datEmissao || "",
              urlDocumento: g.urlDocumento || "",
              cnpjCpf: g.txtCNPJCPF || "",
              analiseForense: g.analise_forense || "🟢 MONITORAMENTO",
              isLocked: g.isLocked
            }));
            
            setGastos(gastosTraduzidos);
          }
        } catch (auditError) {
          console.error("Erro na ponte com BigQuery:", auditError);
        }
      }

      try {
        const eSnap = await getDocs(query(collection(db, "emendas"), where("parlamentarId", "==", id)));
        setEmendas(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.log("Emendas não carregadas", e); }

      setLoading(false);
    }
    load();
  }, [col, id]);

  const totalGastos = gastos.reduce((acc, g) => acc + g.valorLiquido, 0);
  const totalEmendas = emendas.reduce((acc, e) => acc + (Number(e.valorEmpenhado) || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] flex items-center justify-center">
        <div className="text-[#c9a84c] font-space animate-pulse text-xl tracking-widest">
          ESTABELECENDO CONEXÃO SEGURA COM BANCO DE DADOS OFICIAL...
        </div>
      </div>
    );
  }

  if (!pol) return <div className="p-10 text-white text-center">Dossiê não encontrado.</div>;

  return (
    <div className="min-h-screen bg-[#0B0B0F] text-[#e0e0e0] font-sans pb-20">
      
      <div className="border-b border-[#c9a84c]/20 bg-[#12121a] pt-10 pb-8 px-6 mb-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(#c9a84c 1px, transparent 1px)', backgroundSize: '100% 4px' }}></div>
        
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-6 relative z-10">
          <img 
            src={pol.urlFoto || pol.fotoUrl || "/placeholder-avatar.png"} 
            alt={pol.nome}
            className="w-28 h-28 rounded-full border-2 border-[#c9a84c] shadow-[0_0_20px_rgba(201,168,76,0.3)] object-cover" 
          />
          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl md:text-4xl font-bold font-space text-white tracking-tight uppercase">
              {pol.nome}
            </h1>
            <p className="text-[#8a8a9e] mt-1 text-sm tracking-widest uppercase">
              {pol.partido} • {pol.uf} | {pol.cargo || 'Deputado Federal'}
            </p>
            
            <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-3">
              <span className="bg-red-900/30 text-red-400 border border-red-500/50 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider animate-pulse flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Auditoria Ativa
              </span>
              <a href={`https://www.camara.leg.br/deputados/${id}`} target="_blank" rel="noopener noreferrer" 
                 className="border border-[#3d6b5e] text-[#5a9e8f] px-3 py-1 rounded text-xs font-bold uppercase hover:bg-[#3d6b5e]/20 transition-all">
                Fonte Oficial ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#12121a] border border-[#c9a84c]/30 rounded-xl p-5 shadow-lg">
              <div className="text-[#8a8a9e] text-xs uppercase tracking-widest mb-1">Gasto CEAP Auditado</div>
              <div className="text-2xl font-bold font-space text-[#c9a84c]">{fmt(totalGastos)}</div>
            </div>
            <div className="bg-[#12121a] border border-[#3d6b5e]/50 rounded-xl p-5 shadow-lg">
              <div className="text-[#8a8a9e] text-xs uppercase tracking-widest mb-1">Notas Fiscais</div>
              <div className="text-2xl font-bold font-space text-white">{gastos.length}</div>
            </div>
            <div className="bg-[#12121a] border border-[#3d6b5e]/50 rounded-xl p-5 shadow-lg">
              <div className="text-[#8a8a9e] text-xs uppercase tracking-widest mb-1">Total de Emendas</div>
              <div className="text-2xl font-bold font-space text-white">{fmt(totalEmendas)}</div>
            </div>
          </div>

          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6 shadow-lg relative">
            <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
              <h3 className="text-xl text-[#c9a84c] font-space font-bold flex items-center gap-2">
                <span>🔍</span> Dossiê de Notas Fiscais
              </h3>
            </div>

            <div className="space-y-3">
              {gastos.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">
                  Nenhuma anomalia ou gasto processado ainda.
                </div>
              ) : (
                gastos.slice(0, 15).map(g => (
                  <div key={g.id} className={`flex justify-between items-center p-4 rounded-lg transition-all ${
                    g.isLocked 
                    ? "bg-red-900/10 border-l-4 border-red-600 cursor-pointer hover:bg-red-900/20" 
                    : "bg-white/5 border-l-4 border-[#3d6b5e] hover:bg-white/10"
                  }`}
                  onClick={() => g.isLocked && navigate('/creditos')}
                  >
                    <div className={g.isLocked ? "blur-[3px] select-none" : ""}>
                      <p className={`font-bold text-sm ${g.isLocked ? "text-red-400" : "text-white"}`}>
                        {g.isLocked ? "FORNECEDOR EM SIGILO" : g.fornecedorNome}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{g.tipoDespesa}</p>
                    </div>
                    
                    <div className="text-right">
                      <p className={`font-space font-bold ${g.isLocked ? "text-red-400" : "text-[#5a9e8f]"}`}>
                        {fmt(g.valorLiquido)}
                      </p>
                      {g.isLocked ? (
                        <button className="text-[10px] bg-[#c9a84c] text-black px-3 py-1.5 rounded mt-2 font-bold hover:bg-white transition-colors">
                          🔓 VER PROVA (1 CRÉDITO)
                        </button>
                      ) : (
                        g.urlDocumento && (
                          <a href={g.urlDocumento} target="_blank" rel="noopener noreferrer" 
                             className="text-[10px] text-gray-500 underline mt-2 block hover:text-white">
                            Nota Oficial
                          </a>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {gastos.length > 0 && (
            <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
               <GastosChart data={gastos} />
            </div>
          )}

        </div>

        <div className="space-y-8">
          
          {pol.scorePilares && (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
              <ScorePilaresCard scorePilares={pol.scorePilares} />
            </div>
          )}

          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
            <h3 className="text-lg text-white font-bold mb-4 border-b border-gray-800 pb-2">Rastro de Emendas</h3>
            <EmendasAba deputadoId={id} colecao={col} nomeDeputado={pol.nome} />
          </div>
          
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8 space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6 shadow-lg">
            <h3 className="text-lg text-white font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
              <span className="text-[#c9a84c]">🏛️</span> Assiduidade em Plenário
            </h3>
            <PresencaSection politico={pol} colecao={col} politicoId={id} />
          </div>

          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6 shadow-lg">
            <h3 className="text-lg text-white font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
              <span className="text-[#c9a84c]">📚</span> Produção Legislativa
            </h3>
            <ProjetosSection deputadoId={id} colecao={col} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {gastos.length > 0 && (
            <div className="bg-[#12121a] rounded-xl border border-red-900/30 p-6 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-900/10 rounded-full blur-3xl"></div>
              <h3 className="text-lg text-red-400 font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2 relative z-10">
                <span className="animate-pulse">✈️</span> Radar de Fretamento
              </h3>
              <div className="relative z-10">
                <AlertasFretamento gastos={gastos} politico={pol} />
              </div>
            </div>
          )}

          <div className="bg-[#12121a] rounded-xl border border-[#3d6b5e]/30 p-6 shadow-lg">
            <h3 className="text-lg text-[#5a9e8f] font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
              <span>🧬</span> Monitor de Nepotismo Cruzado
            </h3>
            <NepotismoCard deputadoId={id} colecao={col} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6 shadow-lg">
            <h3 className="text-lg text-white font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
              <span className="text-[#c9a84c]">🏢</span> Folha do Gabinete
            </h3>
            <VerbaGabineteSection colecao={col} politicoId={id} idCamara={pol.idCamara || id} />
          </div>

          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6 shadow-lg">
            <h3 className="text-lg text-white font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
              <span className="text-[#c9a84c]">📨</span> Rastreio de Convênios
            </h3>
            <EncaminhamentoEmendas politicoId={id} nomeAutor={pol.nome} />
          </div>
        </div>
        
        <div className="text-center pb-10">
           <Link to="/" className="inline-block py-3 px-8 rounded-lg font-bold text-black bg-[#c9a84c] hover:bg-white transition-colors">
              ← Retornar ao Terminal Central
           </Link>
        </div>

      </div>
    </div>
  );
}
EOF
