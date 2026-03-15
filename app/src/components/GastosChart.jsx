import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * GastosChart - Graficos interativos de gastos parlamentares
 * Usa CSS puro (sem dependencia de chart library)
 * Issue #6
 */

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1"
];

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(value);
}

// Bar Chart Component
function BarChart({ data, labelKey, valueKey, title, color = "#3b82f6" }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0));

  return (
    <div className="bg-white rounded-xl shadow p-4 mb-6">
      <h3 className="text-lg font-bold mb-4">{title}</h3>
      <div className="space-y-2">
        {data.map((item, i) => {
          const val = item[valueKey] || 0;
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs w-32 truncate text-right">{item[labelKey]}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-6 relative">
                <div
                  className="h-6 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                />
              </div>
              <span className="text-xs font-mono w-28 text-right">{formatCurrency(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Donut/Pie Chart (CSS-only)
function DonutChart({ data, labelKey, valueKey, title }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0);
  let cumulative = 0;
  const segments = data.map((d, i) => {
    const pct = total > 0 ? ((d[valueKey] || 0) / total) * 100 : 0;
    const start = cumulative;
    cumulative += pct;
    return { ...d, pct, start, color: COLORS[i % COLORS.length] };
  });

  const gradient = segments
    .map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(", ");

  return (
    <div className="bg-white rounded-xl shadow p-4 mb-6">
      <h3 className="text-lg font-bold mb-4">{title}</h3>
      <div className="flex items-center gap-6">
        <div
          className="w-40 h-40 rounded-full flex-shrink-0"
          style={{
            background: `conic-gradient(${gradient})`,
            position: "relative",
          }}
        >
          <div className="absolute inset-6 bg-white rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-center">{formatCurrency(total)}</span>
          </div>
        </div>
        <div className="space-y-1">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s[labelKey]}</span>
              <span className="font-mono">{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main GastosChart component
export default function GastosChart({ politicoId, tipo = "deputados_federais" }) {
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("categoria"); // categoria | mensal | top

  useEffect(() => {
    if (!politicoId) return;
    loadDespesas();
  }, [politicoId]);

  async function loadDespesas() {
    setLoading(true);
    try {
      const ref = collection(db, "politicos", politicoId, "despesas");
      const snap = await getDocs(ref);
      const items = snap.docs.map(d => d.data());
      setDespesas(items);
    } catch (err) {
      console.error("Erro ao carregar despesas:", err);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-xl h-48 flex items-center justify-center">
        <span className="text-gray-400">Carregando graficos...</span>
      </div>
    );
  }

  if (despesas.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
        Nenhuma despesa encontrada para este politico.
      </div>
    );
  }

  // Agrupar por categoria
  const byCategoria = {};
  despesas.forEach(d => {
    const cat = d.tipoDespesa || d.categoria || "Outros";
    byCategoria[cat] = (byCategoria[cat] || 0) + (d.valor || d.valorDocumento || 0);
  });
  const categoriaData = Object.entries(byCategoria)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Agrupar por mes
  const byMes = {};
  despesas.forEach(d => {
    const mes = d.mes ? `${d.ano || ""}-${String(d.mes).padStart(2, "0")}` : "N/A";
    byMes[mes] = (byMes[mes] || 0) + (d.valor || d.valorDocumento || 0);
  });
  const mensalData = Object.entries(byMes)
    .map(([mes, total]) => ({ mes, total }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-12);

  // Top fornecedores
  const byFornecedor = {};
  despesas.forEach(d => {
    const f = d.fornecedor || d.nomeFornecedor || "N/I";
    byFornecedor[f] = (byFornecedor[f] || 0) + (d.valor || d.valorDocumento || 0);
  });
  const fornecedorData = Object.entries(byFornecedor)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const totalGeral = despesas.reduce((s, d) => s + (d.valor || d.valorDocumento || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Analise de Gastos</h2>
          <p className="text-sm text-gray-500">
            Total: {formatCurrency(totalGeral)} em {despesas.length} despesas
          </p>
        </div>
        <div className="flex gap-1">
          {["categoria", "mensal", "fornecedor"].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                view === v
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      {view === "categoria" && (
        <>
          <DonutChart data={categoriaData} labelKey="nome" valueKey="total" title="Gastos por Categoria" />
          <BarChart data={categoriaData} labelKey="nome" valueKey="total" title="Detalhamento por Categoria" />
        </>
      )}

      {view === "mensal" && (
        <BarChart data={mensalData} labelKey="mes" valueKey="total" title="Evolucao Mensal de Gastos" />
      )}

      {view === "fornecedor" && (
        <BarChart data={fornecedorData} labelKey="nome" valueKey="total" title="Top 10 Fornecedores" />
      )}
    </div>
  );
}
