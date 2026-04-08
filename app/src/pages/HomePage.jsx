import { useState } from "react";
import { Link } from "react-router-dom";

function getRankColor(rank, total = 513) {
  const pct = Math.min(Math.max((rank - 1) / (total - 1), 0), 1);
  const r = Math.round(46  + pct * (200 - 46));
  const g = Math.round(127 - pct * (127 - 37));
  const b = Math.round(24  + pct * (56  - 24));
  return `rgb(${r},${g},${b})`;
}

const MOCK_TOP10 = [
  { rank: 1,  nome: 'Tabata Amaral',     partido: 'PSB',          uf: 'SP', score: '98.4', ceap: 'R$ 12.300' },
  { rank: 2,  nome: 'Kim Kataguiri',     partido: 'Uniao',        uf: 'SP', score: '97.1', ceap: 'R$ 18.500' },
  { rank: 3,  nome: 'Tiago Mitraud',     partido: 'Novo',         uf: 'MG', score: '96.8', ceap: 'R$  9.800' },
  { rank: 4,  nome: 'Adriana Ventura',   partido: 'Novo',         uf: 'SP', score: '96.2', ceap: 'R$ 14.200' },
  { rank: 5,  nome: 'Marcel Van Hattem', partido: 'Novo',         uf: 'RS', score: '95.9', ceap: 'R$ 11.100' },
  { rank: 6,  nome: 'Luisa Canziani',    partido: 'PSD',          uf: 'PR', score: '95.3', ceap: 'R$ 16.700' },
  { rank: 7,  nome: 'Felipe Rigoni',     partido: 'Solidariedade',uf: 'ES', score: '94.8', ceap: 'R$ 13.900' },
  { rank: 8,  nome: 'Camilo Capiberibe', partido: 'PSB',          uf: 'AP', score: '94.5', ceap: 'R$ 20.400' },
  { rank: 9,  nome: 'Natalia Bonavides', partido: 'PSOL',         uf: 'RN', score: '94.1', ceap: 'R$ 17.600' },
  { rank: 10, nome: 'Erika Kokay',       partido: 'PT',           uf: 'DF', score: '93.8', ceap: 'R$ 15.200' },
];

const MOCK_BOTTOM10 = [
  { rank: 513, nome: 'Dep. Alfa',    partido: 'PL',          uf: 'RJ', score: '12.3', ceap: 'R$ 98.400' },
  { rank: 512, nome: 'Dep. Beta',    partido: 'MDB',         uf: 'BA', score: '15.7', ceap: 'R$ 94.100' },
  { rank: 511, nome: 'Dep. Gama',    partido: 'PP',          uf: 'GO', score: '18.2', ceap: 'R$ 91.300' },
  { rank: 510, nome: 'Dep. Delta',   partido: 'Republicanos',uf: 'SP', score: '21.4', ceap: 'R$ 88.700' },
  { rank: 509, nome: 'Dep. Epsilon', partido: 'PSD',         uf: 'MT', score: '23.9', ceap: 'R$ 86.200' },
  { rank: 508, nome: 'Dep. Zeta',    partido: 'PTB',         uf: 'AM', score: '26.1', ceap: 'R$ 83.500' },
  { rank: 507, nome: 'Dep. Eta',     partido: 'PDT',         uf: 'CE', score: '28.5', ceap: 'R$ 81.100' },
  { rank: 506, nome: 'Dep. Theta',   partido: 'PL',          uf: 'MG', score: '30.2', ceap: 'R$ 79.800' },
  { rank: 505, nome: 'Dep. Iota',    partido: 'Solidariedade',uf:'PA', score: '32.7', ceap: 'R$ 77.400' },
  { rank: 504, nome: 'Dep. Kappa',   partido: 'Avante',      uf: 'PE', score: '35.1', ceap: 'R$ 74.900' },
];

function DeputadoCard({ dep }) {
  const color = getRankColor(dep.rank);
  return (
    <Link to="/ranking" style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: `${color}11`, border: `1px solid ${color}33`, marginBottom: 6, transition: 'transform 0.15s', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateX(3px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>{dep.rank}o</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dep.nome}</div>
          <div style={{ fontSize: 11, color: '#AAA' }}>{dep.partido} - {dep.uf}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color }}>{dep.score}</div>
          <div style={{ fontSize: 10, color: '#BBB' }}>CEAP {dep.ceap}</div>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage({ user, login, loginWithGitHub, loginWithEmail, registerWithEmail }) {
  const [authMode, setAuthMode] = useState('choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

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
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>

      {/* HERO */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '64px 24px 44px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#A8D8B0', fontWeight: 600, marginBottom: 14 }}>inteligencia sobre o poder publico</p>
        <h1 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 700, color: '#2D2D2D', lineHeight: 1.1, marginBottom: 16, letterSpacing: '-1px' }}>
          Cada real gasto por <br />
          <span style={{ background: 'linear-gradient(90deg,#FBD87F,#F7B98B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>513 deputados</span> em foco
        </h1>
        <p style={{ fontSize: 15, color: '#666', maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.7 }}>
          Analise automatica de CEAP, emendas e atividade parlamentar. Flags de risco, dossies e relatorios prontos.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/ranking" style={{ padding: '12px 24px', borderRadius: 100, background: '#2D2D2D', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Ver ranking completo</Link>
          <a href="#ranking-section" style={{ padding: '12px 24px', borderRadius: 100, background: 'transparent', color: '#2D2D2D', fontSize: 14, fontWeight: 500, textDecoration: 'none', border: '1.5px solid #DEDBD6' }}>Top 10 / Bottom 10</a>
        </div>
      </section>

      {/* STATS */}
      <div style={{ maxWidth: 760, margin: '0 auto 52px', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        {[
          { n: '513', label: 'Deputados federais monitorados' },
          { n: '26',  label: 'Tabelas no banco de dados' },
          { n: '10+', label: 'APIs publicas integradas' },
          { n: 'IA',  label: 'Score e flags automaticos' },
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
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2D2D2D' }}>Ranking de Transparencia Parlamentar</h2>
          <span style={{ fontSize: 12, color: '#CCC', fontStyle: 'italic' }}>Fonte: APIs Camara + score ASMODEUS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>&#127942;</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2E7F18' }}>Top 10 - Mais transparentes</h3>
            </div>
            {MOCK_TOP10.map(dep => <DeputadoCard key={dep.rank} dep={dep} />)}
            <Link to="/ranking" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: '#AAA', textDecoration: 'none', fontWeight: 500 }}>Ver todos os 513</Link>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>&#9888;&#65039;</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#C82538' }}>Bottom 10 - Maior risco</h3>
            </div>
            {MOCK_BOTTOM10.map(dep => <DeputadoCard key={dep.rank} dep={dep} />)}
            <Link to="/ranking" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: '#AAA', textDecoration: 'none', fontWeight: 500 }}>Ver ranking completo</Link>
          </div>
        </div>
      </section>

      {/* PRODUTOS */}
      <section style={{ maxWidth: 900, margin: '0 auto 64px', padding: '0 24px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2D2D2D', marginBottom: 8 }}>O que voce pode comprar</h2>
        <p style={{ fontSize: 14, color: '#AAA', marginBottom: 24 }}>Pague por aquilo que precisa. Sem assinatura obrigatoria.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {[
            { icon: '&#128203;', title: 'Dossie CEAP Basico',     price: 'R$ 9,90',         desc: 'Resumo de gastos, top fornecedores e 5 flags principais.',                              badge: 'Popular' },
            { icon: '&#128293;', title: 'Dossie CEAP Matador',    price: 'R$ 39,90',        desc: 'Analise forense completa com todos os recibos, graficos e PDF para denuncia.',          badge: 'Premium' },
            { icon: '&#128172;', title: 'Pergunta ao Asmodeus',   price: 'R$ 2,00/pergunta',desc: 'Consulte o agente IA com dados parlamentares. Resposta baseada em dados oficiais.',     badge: 'IA'      },
            { icon: '&#128230;', title: 'Modulos avulsos',        price: 'Emendas, Gabinete',desc: 'Emendas R$14,90 - Gabinete R$14,90 - Super Relatorio R$79,90.',                      badge: 'Modular' },
          ].map((p, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '22px 18px', border: '1px solid #EDEBE8', position: 'relative', transition: 'box-shadow 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              {p.badge && <span style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: p.badge === 'Premium' ? '#FBD87F' : p.badge === 'IA' ? '#9ECFE8' : '#A8D8B0', color: '#2D2D2D' }}>{p.badge}</span>}
              <div style={{ fontSize: 28, marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: p.icon }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2D2D2D', marginBottom: 6 }}>{p.title}</h3>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#2D2D2D', marginBottom: 8 }}>{p.price}</div>
              <p style={{ fontSize: 12, color: '#AAA', lineHeight: 1.6 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BLOCO LOGIN */}
      {!user && (
        <section style={{ maxWidth: 440, margin: '0 auto 80px', padding: '0 24px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '36px 32px', border: '1px solid #EDEBE8', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', color: '#2D2D2D', marginBottom: 6 }}>
              {authMode === 'choose' ? 'Acesse o FiscalizaBR' : authMode === 'register' ? 'Criar conta' : 'Entrar'}
            </h3>
            <p style={{ fontSize: 13, color: '#AAA', textAlign: 'center', marginBottom: 22 }}>Consultas gratuitas disponiveis. Dossies por credito.</p>
            {authError && <div style={{ background: '#FFF0F0', border: '1px solid #FFAAAA', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#C82538' }}>{authError}</div>}
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
                <p style={{ textAlign: 'center', fontSize: 12, color: '#AAA', marginTop: 12 }}>Novo? <span onClick={() => setAuthMode('register')} style={{ color: '#2D2D2D', cursor: 'pointer', fontWeight: 600 }}>Criar conta gratis</span></p>
              </>
            ) : (
              <form onSubmit={handleEmailSubmit}>
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputSt} />
                <input type="password" placeholder="Senha (min 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={inputSt} />
                <button type="submit" disabled={authLoading} style={btn('#2D2D2D')}>{authLoading ? 'Aguarde...' : authMode === 'register' ? 'Criar Conta' : 'Entrar'}</button>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: '#AAA' }}>
                  <span onClick={() => setAuthMode(authMode === 'register' ? 'email' : 'register')} style={{ color: '#2D2D2D', cursor: 'pointer', fontWeight: 600 }}>
                    {authMode === 'register' ? 'Ja tenho conta' : 'Criar conta gratis'}
                  </span>
                  {' - '}
                  <span onClick={() => { setAuthMode('choose'); setAuthError(''); }} style={{ cursor: 'pointer' }}>Voltar</span>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      <footer style={{ textAlign: 'center', padding: '24px', fontSize: 12, color: '#CCC', borderTop: '1px solid #EDEBE8' }}>
        transparenciabr - dados 100% publicos - metodologia aberta - apartidario
      </footer>
    </div>
  );
}

const btn = (bg) => ({ display: 'block', width: '100%', padding: '12px', marginBottom: 10, background: bg, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' });
const inputSt = { display: 'block', width: '100%', padding: '11px 14px', marginBottom: 10, border: '1px solid #EDEBE8', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', color: '#2D2D2D', background: '#FAFAF8' };
