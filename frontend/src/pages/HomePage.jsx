import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

// ─── Cor da bolinha: verde (#2E7F18) → vermelho (#C82538) ─────────────────────
function getRankColor(rank, total = 513) {
  const pct = Math.min(Math.max((rank - 1) / (total - 1), 0), 1);
  const r = Math.round(46  + pct * (200 - 46));
  const g = Math.round(127 - pct * (127 - 37));
  const b = Math.round(24  + pct * (56  - 24));
  return `rgb(${r},${g},${b})`;
}

// ─── Bolinha com gradiente radial 3D premium ──────────────────────────────────
function RankBall({ rank }) {
  const color = getRankColor(rank);
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

// ─── Formata score ─────────────────────────────────────────────────────────
function fmtScore(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '–';
  return num.toFixed(2);
}

// ─── Card de linha do ranking ─────────────────────────────────────────────────
function DeputadoCard({ dep }) {
  const color = getRankColor(dep.rank_externo || dep.rank || 1, 513);
  const soft  = color.replace('rgb', 'rgba').replace(')', ',0.08)');
  const nome  = dep.nome || '–';
  return (
    <Link to={`/politico/ranking_externo/${dep.id}`} style={{ textDecoration: 'none', display: 'block' }}>
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
        <RankBall rank={dep.rank_externo || dep.rank || 1} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nome}
          </div>
          <div style={{ fontSize: 11, color: '#999' }}>{dep.partido || '–'} · {dep.uf || '–'}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color }}>{fmtScore(dep.score || dep.nota_ranking_org)}</div>
          <div style={{ fontSize: 10, color: '#BBB', marginTop: 2 }}>ranking.org.br</div>
        </div>
      </div>
    </Link>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
export default function HomePage({ user, login, loginWithGitHub, loginWithEmail, registerWithEmail }) {
  const [top10,    setTop10]    = useState([]);
  const [bottom10, setBottom10] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [authMode,    setAuthMode]    = useState('choose');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [authError,   setAuthError]   = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    async function fetchRanking() {
      try {
        // ── Lê de ranking_externo (seed ranking.org.br 2025) ──────────────
        const col = collection(db, 'ranking_externo');

        // Top 10: maior score
        const qTop    = query(col, orderBy('score', 'desc'), limit(10));
        const snapTop = await getDocs(qTop);
        setTop10(snapTop.docs.map((doc, i) => ({ id: doc.id, rank: i + 1, ...doc.data() })));

        // Bottom 10: menor score
        const qBot    = query(col, orderBy('score', 'asc'), limit(10));
        const snapBot = await getDocs(qBot);
        setBottom10(snapBot.docs.map((doc, i) => ({ id: doc.id, rank: 513 - i, ...doc.data() })));
      } catch (err) {
        console.error('Erro ao buscar ranking:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, []);

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
    <div style={{ minHeight: '100vh', background: '#FAFAF8', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* HERO */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '64px 24px 44px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#A8D8B0', fontWeight: 600, marginBottom: 14 }}>
          inteligência sobre o poder público
        </p>
        <h1 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 700, color: '#2D2D2D', lineHeight: 1.1, marginBottom: 16, letterSpacing: '-1px' }}>
          Cada real gasto por <br />
          <span style={{ background: 'linear-gradient(90deg,#FBD87F,#F7B98B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            513 deputados
          </span>{' '}em foco
        </h1>
        <p style={{ fontSize: 15, color: '#666', maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.7 }}>
          Análise de CEAP, emendas e atividade parlamentar. Flags de risco, dossiês e relatórios prontos.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/ranking" style={{ padding: '12px 24px', borderRadius: 100, background: '#2D2D2D', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Ver ranking completo
          </Link>
          <a href="#ranking-section" style={{ padding: '12px 24px', borderRadius: 100, background: 'transparent', color: '#2D2D2D', fontSize: 14, fontWeight: 500, textDecoration: 'none', border: '1.5px solid #DEDBD6' }}>
            Top 10 / Bottom 10
          </a>
        </div>
      </section>

      {/* STATS */}
      <div style={{ maxWidth: 760, margin: '0 auto 52px', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        {[
          { n: '513', label: 'Deputados federais monitorados' },
          { n: '26',  label: 'Tabelas no banco de dados' },
          { n: '10+', label: 'APIs públicas integradas' },
          { n: 'IA',  label: 'Score e flags automáticos' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '18px 16px', textAlign: 'center', border: '1px solid #EDEBE8' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#2D2D2D', marginBottom: 4 }}>{s.n}</div>
            <div style={{ fontSize: 12, color: '#AAA', lineHeight: 1.4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* TOP 10 / BOTTOM 10 */}
      <section id="ranking-section" style={{ maxWidth: 900, margin: '0 auto 64px', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2D2D2D' }}>Ranking de Transparência Parlamentar</h2>
          <a
            href="https://ranking.org.br/ranking/politicos"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: '#AAA', fontStyle: 'italic', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#2D2D2D'}
            onMouseLeave={e => e.currentTarget.style.color = '#AAA'}
          >
            Índice: ranking.org.br ↗
          </a>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#AAA', fontSize: 14 }}>Carregando ranking...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 24 }}>
            {/* TOP 10 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>🏆</span>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2E7F18' }}>Top 10 — Mais transparentes</h3>
              </div>
              {top10.map(dep => <DeputadoCard key={dep.id} dep={dep} />)}
              <Link to="/ranking" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: '#AAA', textDecoration: 'none', fontWeight: 500 }}>
                Ver todos os 513 →
              </Link>
            </div>

            {/* BOTTOM 10 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#C82538' }}>Bottom 10 — Maior risco</h3>
              </div>
              {bottom10.map(dep => <DeputadoCard key={dep.id} dep={dep} />)}
              <Link to="/ranking" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: '#AAA', textDecoration: 'none', fontWeight: 500 }}>
                Ver ranking completo →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* AVISO DE METODOLOGIA */}
      <section style={{ maxWidth: 900, margin: '-40px auto 56px', padding: '0 24px' }}>
        <div style={{ background: '#FBF7E8', border: '1px solid #F0E4A0', borderRadius: 10, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <p style={{ fontSize: 12, color: '#7A6A20', margin: 0, lineHeight: 1.6 }}>
            <strong>Índice temporário:</strong> O ranking exibido é baseado no{' '}
            <a href="https://ranking.org.br/ranking/politicos" target="_blank" rel="noopener noreferrer" style={{ color: '#7A6A20', fontWeight: 600 }}>ranking.org.br</a>.
            Em breve, substituiremos pelo nosso próprio índice com análise forense de CEAP, emendas e atividade parlamentar.
          </p>
        </div>
      </section>

      {/* PRODUTOS */}
      <section style={{ maxWidth: 900, margin: '0 auto 64px', padding: '0 24px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2D2D2D', marginBottom: 8 }}>O que você pode comprar</h2>
        <p style={{ fontSize: 14, color: '#AAA', marginBottom: 24 }}>Pague por aquilo que precisa. Sem assinatura obrigatória.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {[
            { icon: '📋', title: 'Dossiê CEAP Básico',     price: 'R$ 9,90',          desc: 'Resumo de gastos, top fornecedores e 5 flags principais.',                           badge: 'Popular'  },
            { icon: '🔥', title: 'Dossiê CEAP Matador',    price: 'R$ 39,90',         desc: 'Análise forense completa com todos os recibos, gráficos e PDF para denúncia.',      badge: 'Premium'  },
            { icon: '💬', title: 'Pergunta ao Agente IA',  price: 'R$ 2,00/pergunta', desc: 'Consulte o agente IA com dados parlamentares. Resposta baseada em dados oficiais.', badge: 'IA'       },
            { icon: '📦', title: 'Módulos avulsos',        price: 'Emendas, Gabinete',desc: 'Emendas R$14,90 · Gabinete R$14,90 · Super Relatório R$79,90.',                     badge: 'Modular'  },
          ].map((p, i) => (
            <div key={i}
              style={{ background: '#fff', borderRadius: 14, padding: '22px 18px', border: '1px solid #EDEBE8', position: 'relative', transition: 'box-shadow 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              {p.badge && (
                <span style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: p.badge === 'Premium' ? '#FBD87F' : p.badge === 'IA' ? '#9ECFE8' : '#A8D8B0', color: '#2D2D2D' }}>
                  {p.badge}
                </span>
              )}
              <div style={{ fontSize: 28, marginBottom: 10 }}>{p.icon}</div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2D2D2D', marginBottom: 6 }}>{p.title}</h3>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#2D2D2D', marginBottom: 8 }}>{p.price}</div>
              <p style={{ fontSize: 12, color: '#AAA', lineHeight: 1.6 }}>{p.desc}</p>
            </div>
          ))}
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
                <button onClick={async () => { setAuthError(''); try { await login(); } catch(e) { setAuthError(e.message); } }} style={btn('#DB4437')}>Entrar com Google</button>
                <button onClick={async () => { setAuthError(''); try { await loginWithGitHub(); } catch(e) { setAuthError(e.message); } }} style={btn('#24292E')}>Entrar com GitHub</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0' }}>
                  <div style={{ flex: 1, height: 1, background: '#EDEBE8' }} />
                  <span style={{ fontSize: 12, color: '#AAA' }}>ou</span>
                  <div style={{ flex: 1, height: 1, background: '#EDEBE8' }} />
                </div>
                <button onClick={() => setAuthMode('email')} style={btn('#2D2D2D')}>Entrar com Email</button>
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

      <footer style={{ textAlign: 'center', padding: '24px', fontSize: 12, color: '#CCC', borderTop: '1px solid #EDEBE8' }}>
        transparenciabr · dados 100% públicos · metodologia aberta · apartidário
      </footer>
    </div>
  );
}

const btn = (bg) => ({ display: 'block', width: '100%', padding: '12px', marginBottom: 10, background: bg, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' });
const inputSt = { display: 'block', width: '100%', padding: '11px 14px', marginBottom: 10, border: '1px solid #EDEBE8', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', color: '#2D2D2D', background: '#FAFAF8' };
