import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Galaxy3D from "../components/Galaxy3D";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  loadRankingOrgExternoMap,
  lookupRankingOrgExterno,
  lookupRankingOrgExternoById,
  mergeDeputadoRankingOrg,
  rankingOrgMapToSortedList,
  MANDATOS_CAMARA,
  RANKING_ORG_PAGE,
  RANKING_ORG_CRITERIA,
} from "../utils/rankingOrg";

function getRankColor(rank, total = MANDATOS_CAMARA) {
  const pct = Math.min(Math.max((rank - 1) / (total - 1), 0), 1);
  const r = Math.round(46  + pct * (200 - 46));
  const g = Math.round(127 - pct * (127 - 37));
  const b = Math.round(24  + pct * (56  - 24));
  return `rgb(${r},${g},${b})`;
}

function RankBall({ rank, total = MANDATOS_CAMARA }) {
  const color = getRankColor(rank, total);
  const [r, g, b] = color.match(/\d+/g).map(Number);
  const borderColor = `rgb(${Math.round(r*0.78)},${Math.round(g*0.78)},${Math.round(b*0.78)})`;
  return (
    <span style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 10, fontWeight: 700,
      background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.45) 0%, transparent 55%), ${color}`,
      border: `2px solid ${borderColor}`,
      boxShadow: `0 2px 8px ${color}55, inset 0 1px 2px rgba(255,255,255,0.3)`,
    }}>
      {rank}º
    </span>
  );
}

function fmtScore(val) {
  if (val == null || val === '') return '—';
  const num = parseFloat(val);
  if (isNaN(num)) return '—';
  return num.toFixed(2);
}

function DeputadoCard({ dep, totalRanking }) {
  const total = totalRanking || MANDATOS_CAMARA;
  const color = getRankColor(dep.rank_externo || dep.rank || 1, total);
  const soft  = color.replace('rgb', 'rgba').replace(')', ',0.08)');
  const nome  = dep.nome || dep.nomeCompleto || '–';
  const isSeedOnly = String(dep.id || '').startsWith('seed-');
  const extUrl = dep.ranking_org?.perfilPath
    ? `https://ranking.org.br${dep.ranking_org.perfilPath}`
    : RANKING_ORG_PAGE;

  const inner = (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 12,
          background: soft, border: `1px solid ${color}33`,
          marginBottom: 6, transition: 'transform 0.15s, box-shadow 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(3px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${color}22`; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        <RankBall rank={dep.rank_externo || dep.rank || 1} total={total} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nome}
          </div>
          <div style={{ fontSize: 11, color: '#999' }}>{dep.partido || '–'} · {dep.uf || '–'}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color }}>
            {dep.ranking_org?.semNotaPublicada ? '—' : fmtScore(dep.nota_ranking_org ?? dep.ranking_org?.nota)}
          </div>
          <div style={{ fontSize: 10, color: '#BBB', marginTop: 2 }}>
            {dep.ranking_org?.semNotaPublicada ? 'Sem nota na fonte' : 'Nota · Ranking dos Políticos'}
          </div>
        </div>
      </div>
  );

  if (isSeedOnly) {
    return (
      <a href={extUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
        {inner}
      </a>
    );
  }

  return (
    <Link to={`/dossie/${dep.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      {inner}
    </Link>
  );
}

export default function HomePage({ user, login, loginWithGitHub, loginWithEmail, registerWithEmail }) {
  const [top10,    setTop10]    = useState([]);
  const [bottom10, setBottom10] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [rankingListCount, setRankingListCount] = useState(0);
  const [totalDeputados, setTotalDeputados] = useState(MANDATOS_CAMARA);
  const [authMode,    setAuthMode]    = useState('choose');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [authError,   setAuthError]   = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    async function fetchRanking() {
      try {
        const { map, mapByIdCamara, listCount, mandatosNoSeed: ms } = await loadRankingOrgExternoMap(db);
        setRankingListCount(listCount || 0);
        const sortedExt = rankingOrgMapToSortedList(map);
        const totalExt = sortedExt.length || ms || MANDATOS_CAMARA;
        setTotalDeputados(totalExt);

        const fromSeed = sortedExt.map((ext) => {
          const idCamara = ext.idCamara != null && Number.isFinite(Number(ext.idCamara))
            ? String(ext.idCamara)
            : `seed-${ext.rank_externo}`;
          return mergeDeputadoRankingOrg(
            { id: idCamara, nome: ext.nome_ranking_org, partido: ext.partido, uf: ext.uf },
            ext,
          );
        });

        const col = collection(db, "deputados_federais");
        const snap = await getDocs(col);
        snap.docs.forEach((d) => {
          const base = { id: d.id, ...d.data() };
          const raw = d.data();
          const idC = raw.idCamara != null ? Number(raw.idCamara) : Number(d.id);
          const ext =
            lookupRankingOrgExterno(map, base.nome || base.nomeCompleto) ||
            (Number.isFinite(idC) ? lookupRankingOrgExternoById(mapByIdCamara, idC) : null);
          if (!ext) return;
          const merged = mergeDeputadoRankingOrg(base, ext);
          const idx = sortedExt.findIndex((e) => e.rank_externo === ext.rank_externo);
          if (idx !== -1) fromSeed[idx] = { ...merged, id: String(d.id) };
        });

        const top = fromSeed.slice(0, 10);
        const bottom = fromSeed.length >= 10
          ? fromSeed.slice(-10).reverse()
          : [...fromSeed].reverse().slice(0, 10);

        setTop10(top);
        setBottom10(bottom);
      } catch (err) {
        console.error('Erro ao buscar ranking:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, []);

  // Limpa tbr_auth_redirect se usuário já está logado na home
  useEffect(() => {
    if (!user) return;
    try {
      const saved = sessionStorage.getItem("tbr_auth_redirect");
      if (saved && saved.startsWith("/") && saved !== "/login") {
        sessionStorage.removeItem("tbr_auth_redirect");
      }
    } catch { /* noop */ }
  }, [user]);

  const gradientTotal = totalDeputados;

  const handleEmailSubmit = async (e) => {
    e.preventDefault(); setAuthError(''); setAuthLoading(true);
    try {
      if (authMode === 'register') await registerWithEmail(email, password);
      else await loginWithEmail(email, password);
    } catch (err) {
      setAuthError(err.message || 'Erro ao autenticar');
    } finally { setAuthLoading(false); }
  };

  return (
    <div className="min-h-screen font-inter bg-transparent">

      {/* HERO */}
      <section className="max-w-[960px] mx-auto pt-10 px-4 pb-9">
        <div className="rounded-[20px] text-center px-[clamp(16px,4vw,40px)] py-[clamp(28px,5vw,56px)]" style={{ background: 'linear-gradient(135deg, #FEF3E2 0%, #FDF8F0 20%, #F0F7F2 50%, #EEF2F9 80%, #F5F0F8 100%)' }}>
          <p className="text-[11px] tracking-[2.5px] uppercase text-[#1B5E3B] font-semibold mb-3.5">
            inteligência sobre o poder público
          </p>
          <h1 className="font-fraunces text-[clamp(24px,5vw,48px)] font-semibold text-[#3d2b1f] leading-[1.15] tracking-[-0.5px] mb-4">
            Cada real público, cada<br />
            emenda, cada voto —<br />
            sob análise forense
          </h1>
          <p className="text-[clamp(13px,2vw,15px)] text-gray-500 max-w-[480px] mx-auto mb-6 leading-relaxed">
            Rastreio de emendas parlamentares, gastos CEAP e votações de {MANDATOS_CAMARA} deputados federais com dados abertos.
            {rankingListCount > 0 ? ` ${rankingListCount} com nota publicada.` : ''}
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link to="/ranking" className="px-7 py-3 rounded-full bg-[#1B5E3B] text-white font-semibold text-sm hover:bg-emerald-800 transition-colors">
              Explorar ranking
            </Link>
            <a href="#ranking-section" className="px-7 py-3 rounded-full border-[1.5px] border-[#1B5E3B] text-[#1B5E3B] font-medium text-sm hover:bg-emerald-50 transition-colors">
              Top 10 / Bottom 10
            </a>
          </div>
        </div>
      </section>

      <Galaxy3D />

      {/* TOP 10 / BOTTOM 10 */}
      <section id="ranking-section" className="max-w-[960px] mx-auto mb-12 px-4">
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
          <h2 className="font-fraunces text-xl font-semibold text-[#3d2b1f]">Ranking dos Políticos (Câmara)</h2>
          <span className="text-xs text-[#AAA] italic leading-relaxed text-right max-w-[320px]">
            Posição e nota conforme{' '}
            <a href={RANKING_ORG_PAGE} target="_blank" rel="noopener noreferrer" className="text-[#666] font-semibold">ranking.org.br</a>
            {rankingListCount > 0 ? ` · ${rankingListCount} deputados na lista` : ''}
            {' '}·{' '}
            <a href={RANKING_ORG_CRITERIA} target="_blank" rel="noopener noreferrer" className="text-[#666]">Metodologia ↗</a>
          </span>
        </div>

        {loading ? (
          <div className="text-center p-12 text-[#AAA] text-sm">Carregando ranking...</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3.5">
                <span className="text-lg">🏆</span>
                <h3 className="text-[15px] font-bold text-[#2E7F18]">Top 10 — Mais transparentes</h3>
              </div>
              {top10.map(dep => <DeputadoCard key={dep.id} dep={dep} totalRanking={gradientTotal} />)}
              <Link to="/ranking" className="block text-center mt-3 text-[13px] text-[#AAA] no-underline font-medium hover:text-gray-700">
                Ver lista completa →
              </Link>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3.5">
                <span className="text-lg">⚠️</span>
                <h3 className="text-[15px] font-bold text-[#C82538]">Bottom 10 — Maior risco</h3>
              </div>
              {bottom10.map(dep => <DeputadoCard key={dep.id} dep={dep} totalRanking={gradientTotal} />)}
              <Link to="/ranking" className="block text-center mt-3 text-[13px] text-[#AAA] no-underline font-medium hover:text-gray-700">
                Ver ranking completo →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* STATS */}
      <div className="max-w-[760px] mx-auto mb-12 px-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {[
          { n: String(MANDATOS_CAMARA), label: 'Mandatos na Câmara dos Deputados' },
          ...(rankingListCount > 0 ? [{ n: String(rankingListCount), label: 'Com nota publicada no ranking.org' }] : []),
          { n: '26',  label: 'Tabelas no banco de dados' },
          { n: '10+', label: 'APIs públicas integradas' },
          { n: 'IA',  label: 'Score e flags automáticos' },
        ].map((s, i) => (
          <div key={i} className="bg-[#eef5f0] rounded-[14px] py-[18px] px-3.5 text-center">
            <div className="text-[26px] font-bold text-[#1B5E3B] mb-1">{s.n}</div>
            <div className="text-[11px] text-gray-500 leading-relaxed">{s.label}</div>
          </div>
        ))}
      </div>

      {/* COMPLIANCE DISCLAIMER */}
      <section className="max-w-[960px] mx-auto mb-12 px-4">
        <div className="bg-[#F8F8F6] rounded-xl py-3.5 px-4 flex items-start gap-2.5 border border-[#E8E8E4]">
          <span className="text-sm shrink-0 mt-0.5 text-gray-500">ℹ</span>
          <p className="text-xs text-gray-500 m-0 leading-relaxed">
            Dados extraídos exclusivamente de fontes públicas oficiais:{' '}
            <a href="https://www.camara.leg.br" target="_blank" rel="noopener noreferrer" className="text-[#1B5E3B] font-semibold underline">Câmara dos Deputados</a>,{' '}
            <a href="https://portaldatransparencia.gov.br" target="_blank" rel="noopener noreferrer" className="text-[#1B5E3B] font-semibold underline">Portal da Transparência</a>{' '}
            e <a href={RANKING_ORG_PAGE} target="_blank" rel="noopener noreferrer" className="text-[#1B5E3B] font-semibold underline">ranking.org.br</a>.{' '}
            Análise automatizada de caráter informativo — não constitui acusação ou juízo de valor definitivo.{' '}
            <Link to="/metodologia" className="text-[#1B5E3B] font-semibold underline">Ver metodologia completa.</Link>
          </p>
        </div>
      </section>

      {/* LOGIN */}
      {!user && (
        <section className="max-w-[440px] mx-auto mb-20 px-6">
          <div className="bg-white rounded-[20px] py-9 px-8 border border-[#EDEBE8] shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
            <h3 className="text-xl font-bold text-center text-[#2D2D2D] mb-1.5">
              {authMode === 'choose' ? 'Acesse o TransparênciaBR' : authMode === 'register' ? 'Criar conta' : 'Entrar'}
            </h3>
            <p className="text-[13px] text-[#AAA] text-center mb-5">Consultas gratuitas disponíveis. Dossiês por crédito.</p>
            {authError && (
              <div className="bg-[#FFF0F0] border border-[#FFAAAA] rounded-lg py-2.5 px-3.5 mb-3.5 text-[13px] text-[#C82538]">
                {authError}
              </div>
            )}
            {authMode === 'choose' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    try { sessionStorage.setItem("tbr_auth_redirect", "/"); } catch { /* noop */ }
                    login();
                  }}
                  className="block w-full p-3 mb-2.5 bg-[#1B5E3B] text-white border-none rounded-xl text-sm font-semibold cursor-pointer hover:bg-emerald-800 transition-colors"
                >
                  Entrar com Google
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    try { sessionStorage.setItem("tbr_auth_redirect", "/"); } catch { /* noop */ }
                    loginWithGitHub();
                  }}
                  className="block w-full p-3 mb-2.5 bg-[#24292E] text-white border-none rounded-xl text-sm font-semibold cursor-pointer hover:bg-gray-800 transition-colors"
                >
                  Entrar com GitHub
                </button>
                <div className="flex items-center gap-2 my-3.5">
                  <div className="flex-1 h-px bg-[#EDEBE8]" />
                  <span className="text-xs text-[#AAA]">ou</span>
                  <div className="flex-1 h-px bg-[#EDEBE8]" />
                </div>
                <button onClick={() => setAuthMode('email')} className="block w-full p-3 mb-2.5 bg-[#374151] text-white border-none rounded-xl text-sm font-semibold cursor-pointer hover:bg-gray-700 transition-colors">Entrar com Email</button>
                <p className="text-center text-xs text-[#AAA] mt-3">
                  Novo?{' '}
                  <span onClick={() => setAuthMode('register')} className="text-[#2D2D2D] cursor-pointer font-semibold hover:underline">Criar conta grátis</span>
                </p>
              </>
            ) : (
              <form onSubmit={handleEmailSubmit}>
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="block w-full py-2.5 px-3.5 mb-2.5 border border-[#EDEBE8] rounded-xl text-sm text-[#2D2D2D] bg-[#FAFAF8] focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
                <input type="password" placeholder="Senha (min 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="block w-full py-2.5 px-3.5 mb-2.5 border border-[#EDEBE8] rounded-xl text-sm text-[#2D2D2D] bg-[#FAFAF8] focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
                <button type="submit" disabled={authLoading} className="block w-full p-3 mb-2.5 bg-[#2D2D2D] text-white border-none rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 hover:bg-gray-800 transition-colors">
                  {authLoading ? 'Aguarde...' : authMode === 'register' ? 'Criar Conta' : 'Entrar'}
                </button>
                <div className="text-center mt-2.5 text-xs text-[#AAA]">
                  <span onClick={() => setAuthMode(authMode === 'register' ? 'email' : 'register')} className="text-[#2D2D2D] cursor-pointer font-semibold hover:underline">
                    {authMode === 'register' ? 'Já tenho conta' : 'Criar conta grátis'}
                  </span>
                  {' · '}
                  <span onClick={() => { setAuthMode('choose'); setAuthError(''); }} className="cursor-pointer hover:underline">Voltar</span>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      <footer className="text-center py-8 px-4 text-[13px] text-gray-400">
        <div className="flex justify-center gap-5 mb-2.5 flex-wrap">
          <Link to="/metodologia" className="text-gray-500 underline text-xs">Metodologia</Link>
          <Link to="/mapa" className="text-gray-500 underline text-xs">Mapa</Link>
          <Link to="/emendas" className="text-gray-500 underline text-xs">Emendas</Link>
        </div>
        transparenciabr · dados 100% públicos · apartidário
      </footer>
    </div>
  );
}
