import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

const UFS = ["","AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const colMap = { federais:"deputados_federais", estaduais_pa:"deputados", senadores:"senadores", governadores:"governadores", distritais:"deputados_distritais" };
const tabs = [
  { id:"federais", label:"Dep. Federais", count:513 },
  { id:"estaduais_pa", label:"Dep. Estaduais PA", count:41 },
  { id:"senadores", label:"Senadores", count:81 },
  { id:"governadores", label:"Governadores", count:27 },
  { id:"distritais", label:"Distritais DF", count:24 },
];

export default function DashboardPage({ user }) {
  const [tab, setTab] = useState("federais");
  const [politicos, setPoliticos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ufFilter, setUfFilter] = useState("");

  useEffect(() => { loadData(); }, [tab]);

  async function loadData() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, colMap[tab]));
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.votos || 0) - (a.votos || 0));
      setPoliticos(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const filtered = politicos.filter(p => {
    if (search && !p.nome?.toLowerCase().includes(search.toLowerCase())) return false;
    if (ufFilter && p.uf !== ufFilter) return false;
    return true;
  });

  const ufCounts = {};
  politicos.forEach(p => { if(p.uf) ufCounts[p.uf] = (ufCounts[p.uf]||0)+1; });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pt-4">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-6"><h1 className="text-3xl font-black">Dashboard</h1><p className="text-gray-500 text-sm">Fiscalizacao critica de todos os politicos do Brasil</p></div>
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {tabs.map(t => (<button key={t.id} onClick={() => {setTab(t.id);setUfFilter("");setSearch("");}} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${tab===t.id ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500" : "bg-gray-900 text-gray-500 border border-gray-800 hover:border-gray-600"}`}>{t.label} ({t.count})</button>))}
        </div>
        <div className="flex gap-3 mb-6 flex-wrap">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome..." className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm flex-1 min-w-[200px] focus:border-emerald-500 focus:outline-none" />
          <select value={ufFilter} onChange={e=>setUfFilter(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none cursor-pointer">
            <option value="">Todos os Estados ({politicos.length})</option>
            {UFS.filter(u=>u&&ufCounts[u]).map(u => <option key={u} value={u}>{u} ({ufCounts[u]})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-emerald-400">{filtered.length}</div><div className="text-xs text-gray-500">Politicos</div></div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-red-400">R$ {(filtered.reduce((s,p)=>s+(p.gastos_total||0),0)/1e6).toFixed(1)}M</div><div className="text-xs text-gray-500">Total Gastos CEAP</div></div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-amber-400">{filtered.reduce((s,p)=>s+(p.emendas_total||0),0)}</div><div className="text-xs text-gray-500">Emendas</div></div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-cyan-400">{filtered.reduce((s,p)=>s+(p.projetos||0),0)}</div><div className="text-xs text-gray-500">Projetos de Lei</div></div>
        </div>
        {loading ? (<div className="flex justify-center py-20"><div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.slice(0,60).map(p => (
              <Link key={p.id} to={`/politico/${colMap[tab]}/${p.id}`} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-emerald-500/50 transition group">
                <div className="flex items-center gap-3">
                  {p.foto ? <img src={p.foto} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-gray-700 group-hover:border-emerald-500" /> : <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-xl">{p.nome?.[0]}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white group-hover:text-emerald-400 truncate">{p.nome}</div>
                    <div className="text-xs text-gray-500">{p.partido} {p.uf ? "- "+p.uf : ""} | {p.cargo||"Deputado"}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2 text-xs flex-wrap">
                  {p.gastos_total > 0 && <span className="bg-red-500/10 text-red-400 px-2 py-1 rounded">R$ {(p.gastos_total/1e3).toFixed(0)}k gastos</span>}
                  {p.votos > 0 && <span className="bg-gray-800 text-gray-400 px-2 py-1 rounded">{p.votos?.toLocaleString("pt-BR")} votos</span>}
                  {p.presenca > 0 && <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">{p.presenca}% pres.</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
        {filtered.length > 60 && <p className="text-center text-gray-500 text-sm py-4">Mostrando 60 de {filtered.length} resultados</p>}
      </div>
    </div>
  );
}
