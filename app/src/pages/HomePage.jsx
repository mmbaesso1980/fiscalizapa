import { useState } from "react";
import { Link } from "react-router-dom";

export default function HomePage({ user, login, loginWithGitHub, loginWithEmail, registerWithEmail }) {
  const [authMode, setAuthMode] = useState("choose"); // "choose" | "email" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      if (authMode === "register") {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err) {
      const msg = err.code === "auth/user-not-found" ? "Usuario nao encontrado"
        : err.code === "auth/wrong-password" ? "Senha incorreta"
        : err.code === "auth/email-already-in-use" ? "Email ja cadastrado"
        : err.code === "auth/weak-password" ? "Senha muito fraca (min 6 caracteres)"
        : err.code === "auth/invalid-email" ? "Email invalido"
        : err.message || "Erro ao autenticar";
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogle = async () => {
    setAuthError("");
    try { await login(); } catch (e) { setAuthError(e.message || "Erro ao entrar com Google"); }
  };

  const handleGitHub = async () => {
    setAuthError("");
    try { await loginWithGitHub(); } catch (e) { setAuthError(e.message || "Erro ao entrar com GitHub"); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Hero */}
      <section style={{ maxWidth: '900px', margin: '0 auto', padding: '80px 24px 60px', display: 'flex', gap: '48px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Esquerda: texto */}
        <div className="animate-fadeInUp" style={{ flex: '1 1 340px', minWidth: 280, textAlign: 'left' }}>
          <p style={{ fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--accent-gold)', marginBottom: '16px', fontWeight: 500 }}>Dados publicos, analise independente</p>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, marginBottom: '20px' }}>
            Desmascarando o poder<br />
            <span style={{ color: 'var(--accent-green)' }}>com transparencia</span>
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '28px' }}>
            Fiscalize gastos, emendas e padroes suspeitos de todos os deputados federais do Brasil. Dados 100% oficiais, analisados com metodo aberto.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {user ? (
              <Link to="/dashboard" style={{ padding: '13px 28px', borderRadius: '8px', background: 'var(--accent-green)', color: '#fff', fontSize: '15px', fontWeight: 600, textDecoration: 'none' }}>Ir para o painel</Link>
            ) : (
              <Link to="/ranking" style={{ padding: '13px 28px', borderRadius: '8px', background: 'var(--accent-green)', color: '#fff', fontSize: '15px', fontWeight: 600, textDecoration: 'none' }}>Ver ranking nacional</Link>
            )}
            <a href="#como" style={{ padding: '13px 28px', borderRadius: '8px', border: '1.5px solid var(--border)', color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500, textDecoration: 'none' }}>Como funciona</a>
          </div>
        </div>

        {/* Direita: painel de login (so para nao logados) */}
        {!user && (
          <div style={{ flex: '0 0 320px', background: 'var(--bg-card, #fff)', borderRadius: 16, padding: '28px 24px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: '1px solid var(--border-light)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, textAlign: 'center', color: 'var(--text-primary)' }}>
              {authMode === "choose" ? "Acesse o FiscalizaPA" : authMode === "register" ? "Criar conta" : "Entrar com email"}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 20 }}>Gratis. Sem cartao de credito.</p>

            {authError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>{authError}</div>
            )}

            {authMode === "choose" ? (
              <>
                <button onClick={handleGoogle} style={btnStyle("#db4437")} disabled={authLoading}>
                  <span style={{ marginRight: 8 }}>G</span> Entrar com Google
                </button>
                <button onClick={handleGitHub} style={btnStyle("#24292e")} disabled={authLoading}>
                  <span style={{ marginRight: 8 }}>&#128049;</span> Entrar com GitHub
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-light, #e5e7eb)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ou</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-light, #e5e7eb)' }} />
                </div>
                <button onClick={() => setAuthMode("email")} style={btnStyle("#3d6b5e")} disabled={authLoading}>
                  Entrar com Email / Senha
                </button>
                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
                  Novo?{" "}
                  <span onClick={() => setAuthMode("register")} style={{ color: '#3d6b5e', cursor: 'pointer', fontWeight: 600 }}>Criar conta gratis</span>
                </p>
              </>
            ) : (
              <form onSubmit={handleEmailSubmit}>
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
                <input type="password" placeholder="Senha (min 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={inputStyle} />
                <button type="submit" style={btnStyle("#3d6b5e")} disabled={authLoading}>
                  {authLoading ? "Aguarde..." : authMode === "register" ? "Criar Conta" : "Entrar"}
                </button>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span onClick={() => setAuthMode(authMode === "register" ? "email" : "register")} style={{ color: '#3d6b5e', cursor: 'pointer', fontWeight: 600 }}>
                    {authMode === "register" ? "Ja tenho conta" : "Criar conta gratis"}
                  </span>
                  {" | "}
                  <span onClick={() => { setAuthMode("choose"); setAuthError(""); }} style={{ color: '#888', cursor: 'pointer' }}>Voltar</span>
                </div>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Stats */}
      <div style={{ maxWidth: '800px', margin: '0 auto 60px', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
        {[
          { n: '513', label: 'Deputados federais', sub: 'monitorados' },
          { n: '12.000+', label: 'Despesas CEAP', sub: 'analisadas' },
          { n: '17', label: 'Sinais de risco', sub: 'calculados por perfil' },
          { n: 'IA', label: 'Analise automatica', sub: 'com metodo aberto' }
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '20px 16px', textAlign: 'center', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-green)', marginBottom: 4 }}>{s.n}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Como funciona */}
      <section id="como" style={{ maxWidth: '800px', margin: '0 auto 80px', padding: '0 24px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 32, fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>Como funciona</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          {[
            { icon: '1', title: 'Dados oficiais', desc: 'Coletamos automaticamente gastos, emendas e atividade parlamentar das APIs oficiais da Camara e Portal da Transparencia.' },
            { icon: '2', title: 'Analise de risco', desc: 'Algoritmos identificam padroes atipicos: gastos acima da media, concentracao em poucos fornecedores, baixa presenca.' },
            { icon: '3', title: 'Dossie para acao', desc: 'Gere relatorios prontos para MP, TCU e CGU. Apartidario, tecnico e baseado apenas nos dados.' }
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '24px 20px', border: '1px solid var(--border-light)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, marginBottom: 12 }}>{s.icon}</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px', fontSize: '13px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-light)' }}>
        TransparenciaBR — Dados 100% publicos, metodologia aberta. Apartidario.
      </footer>
    </div>
  );
}

const btnStyle = (bg) => ({
  display: 'block', width: '100%', padding: '12px',
  marginBottom: 10, background: bg, color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 14,
  fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.2s'
});

const inputStyle = {
  display: 'block', width: '100%', padding: '10px 12px',
  marginBottom: 10, border: '1px solid #ccc', borderRadius: 8,
  fontSize: 14, boxSizing: 'border-box'
};
