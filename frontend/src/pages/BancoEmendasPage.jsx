import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "react-router-dom";

const fmt = (v) => {
  if (!v || v === "0,00" || v === "0.00") return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const critColors = {
  ALTA: "bg-red-100 text-red-700 border-red-200",
  MEDIA: "bg-yellow-100 text-yellow-700 border-yellow-200",
  BAIXA: "bg-green-100 text-green-700 border-green-200",
};

export default function BancoEmendasPage() {
  const [emendas, setEmendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroUf, setFiltroUf] = useState("");
  const [filtroCriticidade, setFiltroCriticidade] = useState("");
  const [filtroAno, setFiltroAno] = useState("");
  const [ordem, setOrdem] = useState("valor");
  const [page, setPage] = useState(0);
  const PER_PAGE = 25;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, "emendas"));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmendas(all);
      setLoading(false);
    })();
  }, []);

  const ufs = useMemo(() => [...new Set(emendas.map(e => e.uf).filter(Boolean))].sort(), [emendas]);
  const anos = useMemo(() => [...new Set(emendas.map(e => e.ano).filter(Boolean))].sort((a, b) => b - a), [emendas]);
  const criticidades = useMemo(() => [...new Set(emendas.map(e => e.criticidade).filter(Boolean))].sort(), [emendas]);

  const filtered = useMemo(() => {
    let list = emendas;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e =>
        (e.codigo || "").toLowerCase().includes(s) ||
        (e.autorNome || "").toLowerCase().includes(s) ||
        (e.localidade || "").toLowerCase().includes(s) ||
        (e.tipo || "").toLowerCase().includes(s)
      );
    }
    if (filtroUf) list = list.filter(e => e.uf === filtroUf);
    if (filtroCriticidade) list = list.filter(e => e.criticidade === filtroCriticidade);
    if (filtroAno) list = list.filter(e => String(e.ano) === filtroAno);

    if (ordem === "valor") list.sort((a, b) => (parseFloat(String(b.valorEmpenhado || 0).replace(/\./g, "").replace(",", ".")) || 0) - (parseFloat(String(a.valorEmpenhado || 0).replace(/\./g, "").replace(",", ".")) || 0));
    else if (ordem === "criticidade") {
      const ord = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
      list.sort((a, b) => (ord[a.criticidade] ?? 9) - (ord[b.criticidade] ?? 9));
    } else if (ordem === "execucao") list.sort((a, b) => (Number(a.taxaExecucao) || 0) - (Number(b.taxaExecucao) || 0));

    return list;
  }, [emendas, search, filtroUf, filtroCriticidade, filtroAno, ordem]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  useEffect(() => { setPage(0); }, [search, filtroUf, filtroCriticidade, filtroAno]);

  const totalEmpenhado = filtered.reduce((s, e) => {
    const v = typeof e.valorEmpenhado === "string" ? parseFloat(e.valorEmpenhado.replace(/\./g, "").replace(",", ".")) : (e.valorEmpenhado || 0);
    return s + (v || 0);
  }, 0);

  if (loading) return (
    <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[#3d6b5e] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Banco de Emendas</h1>
          <p className="text-gray-500">Consulte e filtre todas as emendas parlamentares rastreadas pela plataforma.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-[#3d6b5e]">{filtered.length}</p>
            <p className="text-xs text-gray-500 mt-1">Emendas</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-lg font-bold text-gray-900">{fmt(totalEmpenhado)}</p>
            <p className="text-xs text-gray-500 mt-1">Total Empenhado</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{ufs.length}</p>
            <p className="text-xs text-gray-500 mt-1">Estados</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{anos.length}</p>
            <p className="text-xs text-gray-500 mt-1">Anos</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Buscar por codigo, autor, local..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="col-span-1 sm:col-span-2 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3d6b5e]"
            />
            <select value={filtroUf} onChange={e => setFiltroUf(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Todos UFs</option>
              {ufs.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={filtroCriticidade} onChange={e => setFiltroCriticidade(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Criticidade</option>
              {criticidades.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Todos anos</option>
              {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-500">Ordenar:</span>
            {[["valor", "Maior valor"], ["criticidade", "Criticidade"], ["execucao", "Menor execução"]].map(([k, l]) => (
              <button key={k} onClick={() => setOrdem(k)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${ordem === k ? "bg-[#3d6b5e] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-3">
          {paged.map(e => (
            <Link key={e.id} to={`/emenda/${e.id}`}
              className="block bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-900 text-sm truncate">{e.codigo}</p>
                    {e.criticidade && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${critColors[e.criticidade] || "bg-gray-100 text-gray-600"}`}>
                        {e.criticidade}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{e.tipo || "Tipo nao informado"}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {e.autorNome || "Autor desconhecido"} · {[e.autorPartido, e.uf].filter(Boolean).join(" - ")} · {e.localidade || ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">{fmt(e.valorEmpenhado)}</p>
                  <p className="text-xs text-gray-500">Execução: {e.taxaExecucao != null ? `${e.taxaExecucao}%` : "N/A"}</p>
                  {e.alertas && e.alertas.length > 0 && (
                    <p className="text-[10px] text-red-600 mt-1">⚠ {e.alertas.length} alerta(s)</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-4 py-2 rounded-lg text-sm bg-white border border-gray-200 disabled:opacity-40">
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              {page + 1} de {totalPages}
            </span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-lg text-sm bg-white border border-gray-200 disabled:opacity-40">
              Próxima
            </button>
          </div>
        )}

        {/* CTA */}
        <div className="bg-gradient-to-r from-[#1a2e44] to-[#2a4a6b] rounded-2xl p-6 text-white mt-8">
          <p className="text-xs tracking-widest text-gray-300 mb-2">RELATÓRIO IA TRANSPARENCIABR</p>
          <h3 className="text-xl font-bold mb-2">Análise completa com inteligência artificial</h3>
          <p className="text-sm text-gray-300 mb-4">
            Cruzamento de dados, detecção de padrões suspeitos e fundamentação legal — tudo gerado por IA em segundos.
          </p>
          <Link to="/creditos" className="inline-block bg-white text-[#1a2e44] font-semibold px-6 py-3 rounded-full text-sm hover:bg-gray-100 transition">
            Gerar Relatório IA
          </Link>
        </div>

      </div>
    </div>
  );
}
