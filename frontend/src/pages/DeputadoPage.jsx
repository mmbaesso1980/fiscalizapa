import { useParams } from "react-router-dom";
import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export default function DeputadoPage({ user }) {
  const { nome } = useParams();
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analisar = async () => {
    if (!user) return setError("Faca login primeiro");
    setLoading(true); setError(null);
    try {
      const consume = httpsCallable(functions, "consumeCredit");
      const res = await consume();
      if (!res.data.ok) { setError("Sem creditos. " + (res.data.reason || "")); setLoading(false); return; }
      setAiResult("Analise IA consumiu 1 credito (" + res.data.source + "). Integracao com Gemini em breve.");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">{decodeURIComponent(nome)}</h2>
      <p className="text-gray-500 mb-6">Deputado Estadual do Para</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4 text-center"><div className="text-sm text-gray-500">Presenca</div><div className="text-xl font-bold">--</div></div>
        <div className="bg-gray-50 rounded-lg p-4 text-center"><div className="text-sm text-gray-500">Proposicoes</div><div className="text-xl font-bold">--</div></div>
        <div className="bg-gray-50 rounded-lg p-4 text-center"><div className="text-sm text-gray-500">Gastos</div><div className="text-xl font-bold">--</div></div>
        <div className="bg-gray-50 rounded-lg p-4 text-center"><div className="text-sm text-gray-500">Nota</div><div className="text-xl font-bold">--</div></div>
      </div>
      <button onClick={analisar} disabled={loading} className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
        {loading ? "Analisando..." : "Analisar com IA (1 credito)"}
      </button>
      {error && <div className="mt-4 bg-red-50 text-red-700 p-3 rounded">{error}</div>}
      {aiResult && <div className="mt-4 bg-green-50 text-green-700 p-3 rounded">{aiResult}</div>}
    </div>
  );
}
