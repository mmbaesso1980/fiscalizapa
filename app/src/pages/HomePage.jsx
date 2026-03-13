import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useState, useEffect } from "react";

function StatCard({ value, label, icon }) {
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-all duration-300 hover:scale-105">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-3xl font-black text-white mb-1">{value}</div>
      <div className="text-sm text-gray-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function DeputadoCard({ dep, rank }) {
  const medal = null;
  return (
    <Link to={`/deputado/${dep.id}`} className="group block">
      <div className={`relative bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-5 flex items-center gap-4 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 ${rank <= 3 ? "ring-1 ring-emerald-500/20" : ""}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${rank <= 3 ? "bg-gradient-to-br from-emerald-500 to-cyan-500 text-white" : "bg-gray-800 text-gray-400"}`}>
          {medal || rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white group-hover:text-emerald-400 transition-colors truncate">{dep.nome}</div>
          <div className="text-xs text-gray-500">{dep.partido} | Para</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-emerald-400 font-bold text-sm">{(dep.votos || 0).toLocaleString("pt-BR")}</div>
          <div className="text-[10px] text-gray-600">votos</div>
        </div>
        <svg className="w-4 h-4 text-gray-600 group-hover:text-emerald-400 transition flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const [deputados, setDeputados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "deputados"));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.votos || 0) - (a.votos || 0));
        setDeputados(data);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const login = () => signInWithPopup(auth, new GoogleAuthProvider());
  const totalGastos = deputados.reduce((s, d) => s + (d.gastos || 0), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-transparent to-cyan-900/20" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-4 py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-xs font-medium uppercase tracking-wider">Plataforma ativa</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black mb-4 bg-gradient-to-r from-white via-emerald-200 to-cyan-200 bg-clip-text text-transparent leading-tight">FiscalizaBR</h1>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-4">Fiscalizacao parlamentar com inteligencia artificial</p>
          <p className="text-sm text-gray-500 max-w-xl mx-auto mb-10">Monitore gastos publicos, emendas, presenca e producao legislativa dos deputados do Para em tempo real</p>
          <div className="flex flex-wrap gap-4 justify-center">
            {user ? (
              <Link to="/dashboard" className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-black px-8 py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-emerald-500/25 transition-all">Acessar Dashboard</Link>
            ) : (
              <button onClick={login} className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-black px-8 py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-emerald-500/25 transition-all">Entrar com Google</button>
            )}
            <Link to="/creditos" className="border border-gray-700 text-gray-300 px-8 py-3.5 rounded-xl font-bold hover:bg-white/5 transition-all">Ver Planos</Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-4 -mt-8 mb-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon="🏛️" value={deputados.length || "..."} label="Deputados" />
          <StatCard icon="💰" value={totalGastos > 0 ? "R$ " + (totalGastos/1e6).toFixed(1) + "M" : "R$ 0"} label="Gastos Monitorados" />
          <StatCard icon="🤖" value="IA" label="Analise Inteligente" />
          <StatCard icon="📡" value="24/7" label="Monitoramento" />
        </div>
      </div>

      {/* Ranking */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-black">Ranking de Deputados</h2>
            <p className="text-gray-500 text-sm mt-1">Deputados estaduais do Para ordenados por votos</p>
          </div>
          <Link to="/dashboard" className="text-emerald-400 text-sm font-medium hover:underline">Ver todos &rarr;</Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {deputados.slice(0, 10).map((d, i) => <DeputadoCard key={d.id} dep={d} rank={i + 1} />)}
          </div>
        )}
      </div>

      {/* Features */}
      <div className="border-t border-gray-800/50 bg-gradient-to-b from-transparent to-gray-900/30">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <h3 className="text-2xl font-bold text-center mb-12">Por que usar o FiscalizaBR?</h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-8 hover:border-emerald-500/30 transition-all">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-2xl mb-4">🔍</div>
              <h4 className="font-bold text-lg mb-2">FiscalizaBR Total</h4>
              <p className="text-gray-400 text-sm leading-relaxed">Acompanhe gastos, emendas parlamentares e atividades legislativas com dados atualizados</p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-8 hover:border-emerald-500/30 transition-all">
              <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center text-2xl mb-4">🧠</div>
              <h4 className="font-bold text-lg mb-2">IA para Analise</h4>
              <p className="text-gray-400 text-sm leading-relaxed">Inteligencia artificial analisa padroes de gastos, detecta anomalias e gera relatorios automaticos</p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-8 hover:border-emerald-500/30 transition-all">
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-2xl mb-4">📊</div>
              <h4 className="font-bold text-lg mb-2">Dados Abertos</h4>
              <p className="text-gray-400 text-sm leading-relaxed">Informacoes publicas organizadas e acessiveis para cidadaos, jornalistas e pesquisadores</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-gray-500 text-sm">FiscalizaBR &copy; 2025 - Fiscalizacao parlamentar com IA</div>
          <div className="flex gap-6 text-gray-500 text-sm">
            <Link to="/creditos" className="hover:text-white transition">Planos</Link>
            <Link to="/dashboard" className="hover:text-white transition">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
