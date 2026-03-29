import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const fmt = (v) => {
  if (!v || v === "0,00" || v === "0.00") return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const Badge = ({ label, color = "bg-gray-100 text-gray-700" }) => (
  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${color}`}>{label}</span>
);

const critColors = {
  ALTA: "bg-red-100 text-red-700",
  MEDIA: "bg-yellow-100 text-yellow-700",
  BAIXA: "bg-green-100 text-green-700",
};

export default function EmendaPage() {
  const { id } = useParams();
  const [emenda, setEmenda] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const snap = await getDoc(doc(db, "emendas", id));
      if (snap.exists()) setEmenda({ id: snap.id, ...snap.data() });
      setLoading(false);
    })();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[#3d6b5e] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!emenda) return (
    <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Emenda não encontrada</h2>
        <p className="text-gray-500 mb-4">O código informado não corresponde a nenhuma emenda cadastrada.</p>
        <Link to="/dashboard" className="text-[#3d6b5e] underline font-medium">Voltar ao painel</Link>
      </div>
    </div>
  );

  const execRate = emenda.taxaExecucao != null ? Number(emenda.taxaExecucao) : null;

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-6 flex items-center gap-1">
          <Link to="/dashboard" className="hover:text-[#3d6b5e]">Painel</Link>
          <span>/</span>
          <span className="text-gray-800 font-medium">Emenda {emenda.codigo}</span>
        </nav>

        {/* Header Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Emenda {emenda.codigo}</h1>
              <p className="text-gray-500 text-sm">{emenda.tipo || "Tipo não informado"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {emenda.criticidade && (
                <Badge label={emenda.criticidade} color={critColors[emenda.criticidade] || "bg-gray-100 text-gray-700"} />
              )}
              {emenda.ano && <Badge label={`Ano ${emenda.ano}`} />}
              {emenda.uf && <Badge label={emenda.uf} color="bg-blue-50 text-blue-700" />}
            </div>
          </div>

          {/* Autor */}
          <div className="flex items-center gap-3 p-4 bg-[#f5f5f0] rounded-xl">
            <div className="w-10 h-10 rounded-full bg-[#3d6b5e] flex items-center justify-center text-white font-bold text-sm">
              {(emenda.autorNome || "?")[0]}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{emenda.autorNome || "Autor desconhecido"}</p>
              <p className="text-sm text-gray-500">
                {[emenda.autorPartido, emenda.autorUf].filter(Boolean).join(" - ")}
                {emenda.parlamentarId && (
                  <> · <Link to={`/politico/deputados_federais/${emenda.parlamentarId}`} className="text-[#3d6b5e] underline">Ver perfil</Link></>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Valores Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Valores da Emenda</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-[#f5f5f0] rounded-xl text-center">
              <p className="text-xs text-gray-500 mb-1">Empenhado</p>
              <p className="text-xl font-bold text-gray-900">{fmt(emenda.valorEmpenhado)}</p>
            </div>
            <div className="p-4 bg-[#f5f5f0] rounded-xl text-center">
              <p className="text-xs text-gray-500 mb-1">Liquidado</p>
              <p className="text-xl font-bold text-gray-900">{fmt(emenda.valorLiquidado)}</p>
            </div>
            <div className="p-4 bg-[#f5f5f0] rounded-xl text-center">
              <p className="text-xs text-gray-500 mb-1">Pago</p>
              <p className="text-xl font-bold text-[#3d6b5e]">{fmt(emenda.valorPago)}</p>
            </div>
          </div>

          {/* Execution bar */}
          {execRate != null && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Taxa de Execução</span>
                <span className="font-bold text-gray-900">{execRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="h-3 rounded-full transition-all"
                  style={{
                    width: `${Math.min(execRate, 100)}%`,
                    backgroundColor: execRate >= 70 ? "#3d6b5e" : execRate >= 40 ? "#d4a017" : "#dc2626",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Detalhes Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Detalhes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
            {[
              ["Localidade", emenda.localidade],
              ["IDH Local", emenda.idhLocal],
              ["Função", emenda.funcao],
              ["Subfunção", emenda.subfuncao],
              ["Programa", emenda.programa],
            ].filter(([, v]) => v != null && v !== "").map(([label, value]) => (
              <div key={label} className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        {emenda.alertas && emenda.alertas.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6 mb-6">
            <h2 className="text-lg font-bold text-red-700 mb-3">Alertas</h2>
            <ul className="space-y-2">
              {emenda.alertas.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-800 bg-red-50 p-3 rounded-lg">
                  <span className="mt-0.5">⚠️</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA Relatório IA */}
        <div className="bg-gradient-to-r from-[#1a2e44] to-[#2a4a6b] rounded-2xl p-6 text-white">
          <p className="text-xs tracking-widest text-gray-300 mb-2">RELATÓRIO IA TRANSPARENCIABR</p>
          <h3 className="text-xl font-bold mb-2">Análise completa desta emenda</h3>
          <p className="text-sm text-gray-300 mb-4">
            Cruzamento de dados, detecção de padrões suspeitos e fundamentação legal — gerado por IA em segundos.
          </p>
          <Link to="/creditos" className="inline-block bg-white text-[#1a2e44] font-semibold px-6 py-3 rounded-full text-sm hover:bg-gray-100 transition">
            Gerar Relatório IA
          </Link>
        </div>

      </div>
    </div>
  );
}
