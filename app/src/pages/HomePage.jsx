import { Link } from "react-router-dom";

export default function HomePage({ user, login }) {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 text-white px-4">
      <h1 className="text-5xl font-extrabold mb-4 text-center">FiscalizaPA</h1>
      <p className="text-xl mb-2 text-center max-w-2xl">Plataforma de fiscalizacao e transparencia parlamentar do estado do Para</p>
      <p className="text-indigo-200 mb-8 text-center">Monitore gastos, presenca e producao dos deputados estaduais com inteligencia artificial</p>
      <div className="flex gap-4">
        {user ? (
          <Link to="/dashboard" className="bg-white text-indigo-700 px-6 py-3 rounded-lg font-bold hover:bg-indigo-50 shadow-lg">Acessar Dashboard</Link>
        ) : (
          <button onClick={login} className="bg-white text-indigo-700 px-6 py-3 rounded-lg font-bold hover:bg-indigo-50 shadow-lg">Entrar com Google</button>
        )}
      </div>
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl">
        <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">41</div>
          <div className="text-sm text-indigo-200">Deputados Monitorados</div>
        </div>
        <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">R$ 0</div>
          <div className="text-sm text-indigo-200">Gastos Analisados</div>
        </div>
        <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">IA</div>
          <div className="text-sm text-indigo-200">Analise Inteligente</div>
        </div>
      </div>
    </div>
  );
}
