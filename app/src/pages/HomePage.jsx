import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const { user } = useAuth();
  const [deputados, setDeputados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDeputados = async () => {
      try {
        const ref = collection(db, 'deputados');
        const snap = await getDocs(ref);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.votos || 0) - (a.votos || 0));
        setDeputados(data);
      } catch (e) {
        console.error('Firestore error:', e);
        setError(e.message);
      }
      setLoading(false);
    };
    fetchDeputados();
  }, []);

  const login = () => signInWithPopup(auth, new GoogleAuthProvider());

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gradient-to-br from-indigo-900 to-purple-900 py-20 px-4 text-center">
        <h1 className="text-5xl font-extrabold mb-4">FiscalizaPA</h1>
        <p className="text-xl mb-2 max-w-2xl mx-auto">Plataforma de fiscalizacao e transparencia parlamentar do Para</p>
        <p className="text-indigo-200 mb-8">Monitore gastos, presenca e producao dos deputados com IA</p>
        <div className="flex gap-4 justify-center">
          {user ? (
            <Link to="/dashboard" className="bg-white text-indigo-700 px-6 py-3 rounded-lg font-bold hover:shadow-lg">Acessar Dashboard</Link>
          ) : (
            <button onClick={login} className="bg-white text-indigo-700 px-6 py-3 rounded-lg font-bold hover:shadow-lg">Entrar com Google</button>
          )}
          <Link to="/creditos" className="border border-white px-6 py-3 rounded-lg font-bold hover:bg-white/10">Ver Planos</Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto py-16 px-4">
        <h2 className="text-3xl font-bold mb-8 text-center">Ranking de Deputados - Para</h2>
        {loading && <p className="text-center text-gray-400">Carregando...</p>}
        {error && <p className="text-center text-red-400">Erro: {error}</p>}
        {!loading && !error && deputados.length === 0 && <p className="text-center text-yellow-400">Nenhum deputado encontrado</p>}
        <div className="grid gap-4">
          {deputados.map((d, i) => (
            <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 hover:border-indigo-500 transition">
              <div className="text-2xl font-bold text-indigo-400 w-10 text-center">#{i+1}</div>
              <div className="flex-1">
                <div className="font-bold text-lg">{d.nome}</div>
                <div className="text-sm text-gray-400">{d.partido}</div>
              </div>
              <div className="text-right">
                <div className="text-indigo-300 font-bold">{(d.votos || 0).toLocaleString('pt-BR')} votos</div>
                <div className="text-xs text-gray-500">{d.projetos || 0} projetos</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 py-16 px-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8 text-center">
          <div className="p-6"><div className="text-4xl mb-2">&#128269;</div><h3 className="font-bold text-lg mb-2">Transparencia Total</h3><p className="text-gray-400 text-sm">Acompanhe gastos e atividades parlamentares em tempo real</p></div>
          <div className="p-6"><div className="text-4xl mb-2">&#129302;</div><h3 className="font-bold text-lg mb-2">Analise com IA</h3><p className="text-gray-400 text-sm">Inteligencia artificial para analisar padroes e detectar anomalias</p></div>
          <div className="p-6"><div className="text-4xl mb-2">&#128202;</div><h3 className="font-bold text-lg mb-2">Dados Abertos</h3><p className="text-gray-400 text-sm">Informacoes publicas organizadas e acessiveis para todos</p></div>
        </div>
      </div>
    </div>
  );
}
