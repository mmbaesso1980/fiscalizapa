import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

export default function PoliticoPage() {
  const { colecao, id } = useParams();
  const [pol, setPol] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [emendas, setEmendas] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState("gastos");

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, colecao, id));
      if (snap.exists()) setPol({ id: snap.id, ...snap.data() });
      const gSnap = await getDocs(collection(db, colecao, id, "gastos"));
      setGastos(gSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const eSnap = await getDocs(collection(db, colecao, id, "emendas"));
      setEmendas(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    })();
  }, [colecao, id]);

  async function runAI() {
    setAnalyzing(true);
    try {
      const fns = getFunctions(undefined, "southamerica-east1");
      const analyze = httpsCallable(fns, "analyzeDeputado");
      const r = await analyze({ deputadoId: id, colecao });
      setAnalysis(r.data.analysis);
    } catch (e) { setAnalysis("Erro: " + e.message); }
    setAnalyzing(false);
  }

  if (!pol) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  const gastosPorCat = {};
  gastos.forEach(g => { gastosPorCat[g.categoria] = (gastosPorCat[g.categoria] || 0) + g.valor; });
  const catSorted = Object.entries(gastosPorCat).sort((a, b) => b[1] - a[1]);
  const maxCat = catSorted[0]?.[1] || 1;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pt-4">
      <div className="max-w-5xl mx-auto px-4">
        <Link to="/dashboard" className="text-gray-500 hover:text-white text-sm mb-4 inline-block">&larr; Voltar</Link>
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            {pol.foto ? <img src={pol.foto} alt="" className="w-20 h-20 rounded-2xl object-cover" /> : <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-3xl font-black text-emerald-400">{pol.nome?.[0]}</div>}
            <div className="flex-1">
              <h1 className="text-2xl font-black">{pol.nome}</h1>
              <p className="text-gray-400">{pol.partido} {pol.uf ? "- " + pol.uf : ""} | {pol.cargo}</p>
              <div className="flex gap-6 mt-3">
                <div><span className="text-red-400 font-bold">R$ {((pol.gastos_total || 0)/1000).toFixed(0)}k</span><span className="text-gray-600 text-xs ml-1">gastos</span></div>
                <div><span className="text-amber-400 font-bold">R$ {((pol.emendas_total || 0)/1000).toFixed(0)}k</span><span className="text-gray-600 text-xs ml-1">emendas</span></div>
                {pol.presenca > 0 && <div><span className="text-emerald-400 font-bold">{pol.presenca}%</span><span className="text-gray-600 text-xs ml-1">presenca</span></div>}
                {pol.projetos > 0 && <div><span className="text-cyan-400 font-bold">{pol.projetos}</span><span className="text-gray-600 text-xs ml-1">projetos</span></div>}
              </div>
            </div>
            <button onClick={runAI} disabled={analyzing} className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-black px-5 py-2.5 rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-emerald-500/25 transition disabled:opacity-50">
              {analyzing ? "Analisando..." : "Analisar com IA"}
            </button>
          </div>
        </div>

        {analysis && <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 mb-6"><h3 className="text-emerald-400 font-bold mb-3">Analise da IA FiscalizaBR</h3><div className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{analysis}</div></div>}

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("gastos")} className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === "gastos" ? "bg-red-500/20 text-red-400" : "bg-gray-900 text-gray-500"}`}>Gastos ({gastos.length})</button>
          <button onClick={() => setTab("emendas")} className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === "emendas" ? "bg-amber-500/20 text-amber-400" : "bg-gray-900 text-gray-500"}`}>Emendas ({emendas.length})</button>
          <button onClick={() => setTab("categorias")} className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === "categorias" ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-900 text-gray-500"}`}>Por Categoria</button>
        </div>

        {tab === "gastos" && <div className="space-y-2">{gastos.slice(0,50).map(g => <div key={g.id} className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-3 flex justify-between items-center"><div><div className="text-sm font-medium">{g.categoria}</div><div className="text-xs text-gray-600">{g.mes} | {g.descricao}</div></div><div className="text-red-400 font-bold text-sm">R$ {g.valor?.toFixed(2)}</div></div>)}</div>}

        {tab === "emendas" && <div className="space-y-2">{emendas.map(e => <div key={e.id} className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-3 flex justify-between items-center"><div><div className="text-sm font-medium">{e.tipo} - {e.municipio}</div><div className="text-xs text-gray-600">{e.beneficiario} | {e.status}</div></div><div className="text-amber-400 font-bold text-sm">R$ {e.valor?.toFixed(2)}</div></div>)}</div>}

        {tab === "categorias" && <div className="space-y-3">{catSorted.map(([cat, val]) => <div key={cat} className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4"><div className="flex justify-between mb-2"><span className="text-sm font-medium">{cat}</span><span className="text-red-400 font-bold text-sm">R$ {val.toFixed(2)}</span></div><div className="w-full bg-gray-800 rounded-full h-2"><div className="bg-gradient-to-r from-red-500 to-red-400 h-2 rounded-full" style={{width: (val/maxCat*100) + "%"}} /></div></div>)}</div>}
      </div>
    </div>
  );
}
