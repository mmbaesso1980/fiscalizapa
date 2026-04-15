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
    <div style={{ minHeight: '100vh', background: '#ffffff', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* HERO */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '40px 16px 36px' }}>
        <div style={{
          borderRadius: 20, textAlign: 'center',
          padding: 'clamp(28px, 5vw, 56px) clamp(16px, 4vw, 40px)',
          background: 'linear-gradient(135deg, #FEF3E2 0%, #FDF8F0 20%, #F0F7F2 50%, #EEF2F9 80%, #F5F0F8 100%)',
        }}>
          <p style={{ fontSize: 11, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#1B5E3B', fontWeight: 600, marginBottom: 14 }}>
            inteligência sobre o poder público
          </p>
          <h1 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 'clamp(24px, 5vw, 48px)', fontWeight: 600,
            color: '#3d2b1f', lineHeight: 1.15, letterSpacing: '-0.5px', marginBottom: 16,
          }}>
            Cada real público, cada<br />
            emenda, cada voto —<br />
            sob análise forense
          </h1>
          <p style={{ fontSize: 'clamp(13px, 2vw, 15px)', color: '#6b7280', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.7 }}>
            Rastreio de emendas parlamentares, gastos CEAP e votações
            de {MANDATOS_CAMARA} deputados federais com dados abertos.
            {rankingListCount > 0 ? ` ${rankingListCount} com nota publicada.` : ''}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/ranking" style={{
              padding: '12px 28px', borderRadius: 100,
              background: '#1B5E3B', color: '#fff',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}>
              Explorar ranking
            </Link>
            <a href="#ranking-section" style={{
              padding: '12px 28px', borderRadius: 100,
              background: 'transparent', color: '#1B5E3B',
              fontSize: 14, fontWeight: 500, textDecoration: 'none',
              border: '1.5px solid #1B5E3B',
            }}>
              Top 10 / Bottom 10
            </a>
          </div>
        </div>
      </section>

      <Galaxy3D />

      {/* TOP 10 / BOTTOM 10 */}
      <section id="ranking-section" style={{ maxWidth: 960, margin: '0 auto 48px', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, fontWeight: 600, color: '#3d2b1f' }}>Ranking dos Políticos (Câmara)</h2>
          <span style={{ fontSize: 12, color: '#AAA', fontStyle: 'italic', lineHeight: 1.5, textAlign: 'right', maxWidth: 320 }}>
            Posição e nota conforme{' '}
            <a href={RANKING_ORG_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: '#666', fontWeight: 600 }}>ranking.org.br</a>
            {rankingListCount > 0 ? ` · ${rankingListCount} deputados na lista` : ''}
            {' '}·{' '}
            <a href={RANKING_ORG_CRITERIA} target="_blank" rel="noopener noreferrer" style={{ color: '#666' }}>Metodologia ↗</a>
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#AAA', fontSize: 14 }}>Carregando ranking...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>🏆</span>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2E7F18' }}>Top 10 — Mais transparentes</h3>
              </div>
              {top10.map(dep => <DeputadoCard key={dep.id} dep={dep} totalRanking={gradientTotal} />)}
              <Link to="/ranking" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: '#AAA', textDecoration: 'none', fontWeight: 500 }}>
                Ver lista completa →
              </Link>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#C82538' }}>Bottom 10 — Maior risco</h3>
              </div>
              {bottom10.map(dep => <DeputadoCard key={dep.id} dep={dep} totalRanking={gradientTotal} />)}
              <Link to="/ranking" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: '#AAA', textDecoration: 'none', fontWeight: 500 }}>
                Ver ranking completo →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* STATS */}
      <div style={{ maxWidth: 760, margin: '0 auto 48px', padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        {[
          { n: String(MANDATOS_CAMARA), label: 'Mandatos na Câmara dos Deputados' },
          ...(rankingListCount > 0 ? [{ n: String(rankingListCount), label: 'Com nota publicada no ranking.org' }] : []),
          { n: '26',  label: 'Tabelas no banco de dados' },
          { n: '10+', label: 'APIs públicas integradas' },
          { n: 'IA',  label: 'Score e flags automáticos' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#eef5f0', borderRadius: 14, padding: '18px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1B5E3B', marginBottom: 4 }}>{s.n}</div>
            <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* COMPLIANCE DISCLAIMER */}
      <section style={{ maxWidth: 960, margin: '0 auto 48px', padding: '0 16px' }}>
        <div style={{ background: '#F8F8F6', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 10, border: '1px solid #E8E8E4' }}>
          <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1, color: '#6b7280' }}>ℹ</span>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.7 }}>
            Dados extraídos exclusivamente de fontes públicas oficiais:{' '}
            <a href="https://www.camara.leg.br" target="_blank" rel="noopener noreferrer" style={{ color: '#1B5E3B', fontWeight: 600, textDecoration: 'underline' }}>Câmara dos Deputados</a>,{' '}
            <a href="https://portaldatransparencia.gov.br" target="_blank" rel="noopener noreferrer" style={{ color: '#1B5E3B', fontWeight: 600, textDecoration: 'underline' }}>Portal da Transparência</a>{' '}
            e <a href={RANKING_ORG_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: '#1B5E3B', fontWeight: 600, textDecoration: 'underline' }}>ranking.org.br</a>.{' '}
            Análise automatizada de caráter informativo — não constitui acusação ou juízo de valor definitivo.{' '}
            <Link to="/metodologia" style={{ color: '#1B5E3B', fontWeight: 600, textDecoration: 'underline' }}>Ver metodologia completa.</Link>
          </p>
        </div>
      </section>

      {/* LOGIN */}
      {!user && (
        <section style={{ maxWidth: 440, margin: '0 auto 80px', padding: '0 24px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '36px 32px', border: '1px solid #EDEBE8', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', color: '#2D2D2D', marginBottom: 6 }}>
              {authMode === 'choose' ? 'Acesse o TransparênciaBR' : authMode === 'register' ? 'Criar conta' : 'Entrar'}
            </h3>
            <p style={{ fontSize: 13, color: '#AAA', textAlign: 'center', marginBottom: 22 }}>Consultas gratuitas disponíveis. Dossiês por crédito.</p>
            {authError && (
              <div style={{ background: '#FFF0F0', border: '1px solid #FFAAAA', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#C82538' }}>
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
                  style={btn('#1B5E3B')}
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
                  style={btn('#24292E')}
                >
                  Entrar com GitHub
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0' }}>
                  <div style={{ flex: 1, height: 1, background: '#EDEBE8' }} />
                  <span style={{ fontSize: 12, color: '#AAA' }}>ou</span>
                  <div style={{ flex: 1, height: 1, background: '#EDEBE8' }} />
                </div>
                <button onClick={() => setAuthMode('email')} style={btn('#374151')}>Entrar com Email</button>
                <p style={{ textAlign: 'center', fontSize: 12, color: '#AAA', marginTop: 12 }}>
                  Novo?{' '}
                  <span onClick={() => setAuthMode('register')} style={{ color: '#2D2D2D', cursor: 'pointer', fontWeight: 600 }}>Criar conta grátis</span>
                </p>
              </>
            ) : (
              <form onSubmit={handleEmailSubmit}>
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputSt} />
                <input type="password" placeholder="Senha (min 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={inputSt} />
                <button type="submit" disabled={authLoading} style={btn('#2D2D2D')}>
                  {authLoading ? 'Aguarde...' : authMode === 'register' ? 'Criar Conta' : 'Entrar'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: '#AAA' }}>
                  <span onClick={() => setAuthMode(authMode === 'register' ? 'email' : 'register')} style={{ color: '#2D2D2D', cursor: 'pointer', fontWeight: 600 }}>
                    {authMode === 'register' ? 'Já tenho conta' : 'Criar conta grátis'}
                  </span>
                  {' · '}
                  <span onClick={() => { setAuthMode('choose'); setAuthError(''); }} style={{ cursor: 'pointer' }}>Voltar</span>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      <footer style={{ textAlign: 'center', padding: '32px 16px', fontSize: 13, color: '#9ca3af' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
          <Link to="/metodologia" style={{ color: '#6b7280', textDecoration: 'underline', fontSize: 12 }}>Metodologia</Link>
          <Link to="/mapa" style={{ color: '#6b7280', textDecoration: 'underline', fontSize: 12 }}>Mapa</Link>
          <Link to="/emendas" style={{ color: '#6b7280', textDecoration: 'underline', fontSize: 12 }}>Emendas</Link>
        </div>
        transparenciabr · dados 100% públicos · apartidário
      </footer>
    </div>
  );
}

const btn = (bg) => ({ display: 'block', width: '100%', padding: '12px', marginBottom: 10, background: bg, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' });
const inputSt = { display: 'block', width: '100%', padding: '11px 14px', marginBottom: 10, border: '1px solid #EDEBE8', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', color: '#2D2D2D', background: '#FAFAF8' };
