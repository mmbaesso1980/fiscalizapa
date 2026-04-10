/**
 * RankingPage.jsx — Ranking de Transparência Parlamentar
 *
 * Posição e nota: Ranking dos Políticos (ranking.org.br), cruzados com deputados_federais.
 * Cores: getRiskColor() de colorUtils.js — transição HSL verde→vermelho.
 * Preparado para 513 deputados federais.
 */

import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  loadRankingOrgExternoMap,
  lookupRankingOrgExterno,
  mergeDeputadoRankingOrg,
  RANKING_ORG_PAGE,
  RANKING_ORG_CRITERIA,
} from "../utils/rankingOrg";
import {
  getRiskColor,
  getRiskColorAlpha,
  getRiskColorDark,
  getRiskLabel,
} from "../utils/colorUtils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(val) {
  const n = parseFloat(String(val ?? "").replace(/\./g, "").replace(",", "."));
  if (isNaN(n) || n === 0) return "–";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtScore(val) {
  const n = parseFloat(val ?? 0);
  return isNaN(n) ? "–" : n.toFixed(1);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/60 animate-pulse">
      <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-2/5 rounded bg-gray-200" />
        <div className="h-2.5 w-1/4 rounded bg-gray-100" />
      </div>
      <div className="h-5 w-12 rounded bg-gray-200" />
      <div className="h-4 w-20 rounded bg-gray-100 hidden sm:block" />
    </div>
  );
}

// ─── Card de deputado ─────────────────────────────────────────────────────────
function DeputadoRow({ dep, total }) {
  const rankNum = dep.rank_externo != null ? dep.rank_externo : Math.min(total, Math.floor(total * 0.85));
  const color      = getRiskColor(rankNum, total);
  const colorAlpha = getRiskColorAlpha(rankNum, total, 0.08);
  const colorDark  = getRiskColorDark(rankNum, total);
  const { label }  = getRiskLabel(rankNum, total);
  const rankLabel  = dep.rank_externo != null ? String(dep.rank_externo) : "–";

  return (
    <Link
      to={`/politico/deputados_federais/${dep.id}`}
      style={{ textDecoration: "none" }}
      className="group block"
    >
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl
                   transition-all duration-150
                   hover:-translate-x-0.5 hover:shadow-md"
        style={{
          background: colorAlpha,
          border: `1px solid ${color}28`,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = `0 4px 20px ${color}28`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {/* Orb de rank */}
        <span
          className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center
                     text-white text-[10px] font-bold"
          style={{
            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5) 0%, transparent 55%), ${color}`,
            border: `2px solid ${colorDark}`,
            boxShadow: `0 3px 10px ${color}55, inset 0 1px 2px rgba(255,255,255,0.3)`,
          }}
        >
          {rankLabel}
        </span>

        {/* Nome + partido/UF */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: "#2D2D2D" }}
          >
            {dep.nome}
          </p>
          <p className="text-xs" style={{ color: "#AAA" }}>
            {dep.partido} · {dep.uf}
          </p>
        </div>

        {/* Nota ranking.org */}
        <div className="text-right shrink-0">
          <span
            className="text-base font-bold tabular-nums"
            style={{ color }}
          >
            {fmtScore(dep.nota_ranking_org)}
          </span>
          <span
            className="block text-[9px] font-semibold px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap"
            style={{ background: `${color}18`, color }}
          >
            {label}
          </span>
        </div>

        {/* CEAP — oculto em mobile */}
        <div className="text-right shrink-0 min-w-[96px] hidden sm:block">
          <p className="text-[10px]" style={{ color: "#CCC" }}>CEAP total</p>
          <p className="text-xs font-semibold tabular-nums" style={{ color: "#555" }}>
            {fmtBRL(dep.gastosCeapTotal)}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
const SEL_STYLE = {
  flex: 1,
  minWidth: 110,
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #EDEBE8",
  fontSize: 13,
  background: "rgba(255,255,255,0.8)",
  color: "#2D2D2D",
  backdropFilter: "blur(8px)",
  outline: "none",
};

export default function RankingPage() {
  const [deputies,   setDeputies]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filterUF,   setFilterUF]   = useState("");
  const [filterPart, setFilterPart] = useState("");
  const [externalTotal, setExternalTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const { map, total: extTotal } = await loadRankingOrgExternoMap(db);
        const snap = await getDocs(collection(db, "deputados_federais"));
        if (cancelled) return;
        const data = snap.docs.map((docSnap) => {
          const raw = docSnap.data();
          const base = {
            id: docSnap.id,
            nome: raw.nome || raw.nomeCompleto || docSnap.id,
            partido: raw.partido || "–",
            uf: raw.uf || "–",
            gastosCeapTotal: raw.gastosCeapTotal || raw.totalGasto || 0,
          };
          const ext = lookupRankingOrgExterno(map, base.nome);
          const m = mergeDeputadoRankingOrg(base, ext);
          return {
            ...m,
            rank: m.rank_externo ?? 9999,
            nota_ranking_org: m.nota_ranking_org ?? 0,
          };
        });
        data.sort((a, b) => {
          const ra = a.rank_externo ?? 9999;
          const rb = b.rank_externo ?? 9999;
          if (ra !== rb) return ra - rb;
          return String(a.nome).localeCompare(String(b.nome), "pt-BR");
        });
        setDeputies(data);
        if (!cancelled && extTotal) setExternalTotal(extTotal);
      } catch (err) {
        console.error("Ranking — erro Firestore:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const ufs      = useMemo(() => [...new Set(deputies.map(d => d.uf))].filter(Boolean).sort(), [deputies]);
  const partidos = useMemo(() => [...new Set(deputies.map(d => d.partido))].filter(Boolean).sort(), [deputies]);

  const filtered = useMemo(() => deputies.filter(d => {
    const q = search.toLowerCase();
    return (
      d.nome.toLowerCase().includes(q) &&
      (filterUF   ? d.uf      === filterUF   : true) &&
      (filterPart ? d.partido === filterPart : true)
    );
  }), [deputies, search, filterUF, filterPart]);

  const colorTotal = externalTotal || deputies.length || 513;
  const comPosicao = useMemo(
    () => deputies.filter((d) => d.rank_externo != null).length,
    [deputies],
  );

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontSize: 26, fontWeight: 700, color: "#2D2D2D",
            fontFamily: "'Space Grotesk', sans-serif", marginBottom: 6,
          }}>
            Ranking dos Políticos (Câmara)
          </h1>
          <p style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}>
            {loading
              ? "Carregando…"
              : (
                <>
                  Posição e nota conforme{" "}
                  <a href={RANKING_ORG_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: "#666", fontWeight: 600 }}>
                    ranking.org.br
                  </a>
                  {" "}({colorTotal} na lista oficial · {comPosicao} cruzados com perfis locais).{" "}
                  <a href={RANKING_ORG_CRITERIA} target="_blank" rel="noopener noreferrer" style={{ color: "#999" }}>
                    Metodologia ↗
                  </a>
                </>
              )}
          </p>

          {/* Barra de gradiente decorativa */}
          <div style={{
            marginTop: 12, height: 4, borderRadius: 99,
            background: "linear-gradient(to right, hsl(120,90%,42%), hsl(60,95%,44%), hsl(0,90%,48%))",
            maxWidth: 320, opacity: 0.7,
          }} />
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Buscar deputado…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              ...SEL_STYLE,
              flex: 3,
              minWidth: 200,
              paddingLeft: 14,
            }}
          />
          <select value={filterUF}   onChange={e => setFilterUF(e.target.value)}   style={SEL_STYLE}>
            <option value="">Todos os estados</option>
            {ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
          <select value={filterPart} onChange={e => setFilterPart(e.target.value)} style={SEL_STYLE}>
            <option value="">Todos os partidos</option>
            {partidos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Lista */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {loading
            ? Array.from({ length: 12 }).map((_, i) => <RowSkeleton key={i} />)
            : filtered.map(dep => (
                <DeputadoRow key={dep.id} dep={dep} total={colorTotal} />
              ))}
        </div>

        {/* Vazio */}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: "center", padding: "48px 24px", color: "#AAA", fontSize: 14 }}>
            Nenhum deputado encontrado.
          </p>
        )}

        {/* Rodapé */}
        {!loading && deputies.length > 0 && (
          <p style={{ marginTop: 20, fontSize: 11, color: "#CCC", textAlign: "center" }}>
            {filtered.length} de {deputies.length} · verde = melhor posição no ranking · vermelho = pior posição
          </p>
        )}
      </div>
    </div>
  );
}
