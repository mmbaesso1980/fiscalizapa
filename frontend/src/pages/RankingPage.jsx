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
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import {
  loadRankingOrgExternoMap,
  lookupRankingOrgExterno,
  lookupRankingOrgExternoById,
  mergeDeputadoRankingOrg,
  MANDATOS_CAMARA,
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
  if (val == null || val === "") return "—";
  const n = parseFloat(val);
  return isNaN(n) ? "—" : n.toFixed(2);
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
  const semMatch = dep.rank_externo == null;
  const semNota = !semMatch && (dep.nota_ranking_org == null || dep.ranking_org?.semNotaPublicada);
  const rankNum = semMatch ? Math.round((MANDATOS_CAMARA + 1) / 2) : dep.rank_externo;
  const color      = semMatch ? "#9ca3af" : getRiskColor(rankNum, total);
  const colorAlpha = semMatch ? "rgba(243,244,246,0.95)" : getRiskColorAlpha(rankNum, total, 0.08);
  const colorDark  = semMatch ? "#6b7280" : getRiskColorDark(rankNum, total);
  let label;
  if (semMatch) label = "Sem posição no seed";
  else if (semNota) label = "Ativo na Câmara · sem nota no ranking.org";
  else label = getRiskLabel(rankNum, total).label;
  const rankLabel  = semMatch ? "s/n" : String(dep.rank_externo);

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
          border: semMatch ? "1px solid #e5e7eb" : semNota ? `1px solid ${color}20` : `1px solid ${color}28`,
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
            {semMatch || semNota ? "—" : fmtScore(dep.nota_ranking_org)}
          </span>
          <span
            className="block text-[9px] font-semibold px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap"
            style={{
              background: semMatch ? "#f3f4f6" : semNota ? `${color}12` : `${color}18`,
              color: semMatch ? "#6b7280" : semNota ? "#57534e" : color,
            }}
          >
            {label}
          </span>
        </div>

        {/* Score plataforma (BigQuery) */}
        <div className="text-right shrink-0 min-w-[52px] hidden md:block">
          <p className="text-[10px]" style={{ color: "#CCC" }}>TBR</p>
          <p className="text-xs font-semibold tabular-nums" style={{ color: "#555" }}>
            {dep.score_plataforma != null ? Number(dep.score_plataforma).toFixed(1) : "—"}
          </p>
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

function parseBQMoney(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/\s/g, "").replace(/R\$\s?/gi, "");
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function RankingPage() {
  const [deputies,   setDeputies]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filterUF,   setFilterUF]   = useState("");
  const [filterPart, setFilterPart] = useState("");
  const [rankingListCount, setRankingListCount] = useState(0);
  const [mandatosSeed, setMandatosSeed] = useState(0);
  const [bqRows, setBqRows] = useState([]);

  const insightGastador = useMemo(() => {
    if (!bqRows.length) return null;
    let best = bqRows[0];
    let max = parseBQMoney(best?.totalGastos);
    for (const r of bqRows) {
      const t = parseBQMoney(r.totalGastos);
      if (t > max) {
        max = t;
        best = r;
      }
    }
    return max > 0 ? { row: best, total: max } : null;
  }, [bqRows]);

  const insightMaiorNota = useMemo(() => {
    if (!bqRows.length) return null;
    const sorted = [...bqRows].sort(
      (a, b) => (Number(b.notaTransparencia) || 0) - (Number(a.notaTransparencia) || 0),
    );
    const top = sorted[0];
    if (!top || top.notaTransparencia == null) return null;
    return top;
  }, [bqRows]);

  const insightMenorNota = useMemo(() => {
    if (!bqRows.length) return null;
    const withNote = bqRows.filter((r) => r.notaTransparencia != null && Number.isFinite(Number(r.notaTransparencia)));
    if (!withNote.length) return null;
    withNote.sort((a, b) => Number(a.notaTransparencia) - Number(b.notaTransparencia));
    return withNote[0];
  }, [bqRows]);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const [rankRes, orgRes, snap] = await Promise.all([
          httpsCallable(functions, "getRanking")({ limit: 513 }).catch((e) => {
            console.warn("getRanking:", e.message);
            return { data: { rows: [] } };
          }),
          loadRankingOrgExternoMap(db),
          getDocs(collection(db, "deputados_federais")),
        ]);
        if (cancelled) return;

        const rows = rankRes.data?.rows || [];
        setBqRows(rows);

        const bqByIdCamara = new Map();
        for (const r of rows) {
          const id = Number(r.idCamara);
          if (Number.isFinite(id)) bqByIdCamara.set(id, r);
        }

        const { map, mapByIdCamara, listCount, mandatosNoSeed } = orgRes;
        const data = snap.docs.map((docSnap) => {
          const raw = docSnap.data();
          const base = {
            id: docSnap.id,
            nome: raw.nome || raw.nomeCompleto || docSnap.id,
            partido: raw.partido || "–",
            uf: raw.uf || "–",
            gastosCeapTotal: raw.gastosCeapTotal || raw.totalGasto || 0,
          };
          const idC = raw.idCamara != null ? Number(raw.idCamara) : Number(docSnap.id);
          const ext =
            lookupRankingOrgExterno(map, base.nome) ||
            (Number.isFinite(idC) ? lookupRankingOrgExternoById(mapByIdCamara, idC) : null);
          const m = mergeDeputadoRankingOrg(base, ext);
          const bq = Number.isFinite(idC) ? bqByIdCamara.get(idC) : null;
          const scorePlat =
            bq?.notaTransparencia != null && Number.isFinite(Number(bq.notaTransparencia))
              ? Number(bq.notaTransparencia)
              : null;
          const ceapBq = parseBQMoney(bq?.totalGastos);
          return {
            ...m,
            rank: m.rank_externo ?? 9999,
            nota_ranking_org: m.nota_ranking_org ?? 0,
            score_plataforma: scorePlat,
            gastosCeapTotal: ceapBq > 0 ? ceapBq : m.gastosCeapTotal,
          };
        });
        data.sort((a, b) => {
          const ra = a.rank_externo ?? 9999;
          const rb = b.rank_externo ?? 9999;
          if (ra !== rb) return ra - rb;
          return String(a.nome).localeCompare(String(b.nome), "pt-BR");
        });
        setDeputies(data);
        setRankingListCount(listCount || 0);
        setMandatosSeed(mandatosNoSeed || 0);
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

  const colorTotal = MANDATOS_CAMARA;
  const comPosicao = useMemo(
    () => deputies.filter((d) => d.rank_externo != null).length,
    [deputies],
  );
  const semPosicao = deputies.length - comPosicao;
  const comNota = useMemo(
    () => deputies.filter((d) => d.nota_ranking_org != null && !d.ranking_org?.semNotaPublicada).length,
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
                  {" "}
                  (Seed: {mandatosSeed || MANDATOS_CAMARA} mandatos · {rankingListCount} com nota no ranking.org · {comNota} perfis com nota após cruzamento
                  {semPosicao > 0 ? ` · ${semPosicao} sem posição (id/nome)` : ""}).{" "}
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

        {/* Cards destaque (BigQuery) */}
        {!loading && bqRows.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 22 }}>
            {insightGastador && (
              <div style={{ background: "rgba(255,255,255,0.85)", border: "1px solid #EDEBE8", borderRadius: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Maior volume CEAP (auditoria)</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#2D2D2D", margin: "0 0 4px" }}>{insightGastador.row.nome || "—"}</p>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{fmtBRL(insightGastador.total)} · {insightGastador.row.partido} · {insightGastador.row.estado}</p>
              </div>
            )}
            {insightMaiorNota && (
              <div style={{ background: "rgba(255,255,255,0.85)", border: "1px solid #EDEBE8", borderRadius: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Maior nota TransparenciaBR</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#2D2D2D", margin: "0 0 4px" }}>{insightMaiorNota.nome || "—"}</p>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>Nota {Number(insightMaiorNota.notaTransparencia).toFixed(1)} · {insightMaiorNota.partido} · {insightMaiorNota.estado}</p>
              </div>
            )}
            {insightMenorNota && (!insightMaiorNota || String(insightMenorNota.idCamara) !== String(insightMaiorNota.idCamara)) && (
              <div style={{ background: "rgba(255,255,255,0.85)", border: "1px solid #EDEBE8", borderRadius: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Menor nota (atenção)</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#2D2D2D", margin: "0 0 4px" }}>{insightMenorNota.nome || "—"}</p>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>Nota {Number(insightMenorNota.notaTransparencia).toFixed(1)} · {insightMenorNota.partido} · {insightMenorNota.estado}</p>
              </div>
            )}
          </div>
        )}

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
