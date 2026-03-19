import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import MapaBrasil from "../components/MapaBrasil";

const UFS = ["","AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const COLECOES = [
  { key: "deputados_federais", label: "Dep. Federais", ready: true },
  { key: "deputados", label: "Dep. Estaduais PA", ready: false },
  { key: "senadores", label: "Senadores", ready: false },
  { key: "governadores", label: "Governadores", ready: false },
  { key: "deputados_distritais", label: "Distritais DF", ready: false }
];

function riskLevel(score) {
  if (!score || score < 30) return { label: "Baixo", cls: "risk-badge-low" };
  if (score < 60) return { label: "Medio", cls: "risk-badge-medium" };
  return { label: "Alto", cls: "risk-badge-high" };
}

function formatCurrency(v) {
  if (!v) return "R$ 0";
  if (v >= 1000000) return "R$ " + (v/1000000).toFixed(1) + "M";
  if (v >= 1000) return "R$ " + (v/1000).toFixed(0) + "k";
  return "R$ " + v.toFixed(0);
}

export default function DashboardPage({ user }) {
  const [colecao, setColecao] = useState("deputados_federais");
  const [politicos, setPoliticos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
  const [showMap, setShowMap] = useState(false);

  const currentCol = COLECOES.find(c => c.key === colecao);
  const isReady = currentCol?.ready !== false;

  useEffect(() => {
    if (!isReady) { setLoading(false); setPoliticos([]); return; }
    setLoading(true);
    getDocs(collection(db, colecao)).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
      setPoliticos(list);
      setLoading(false);
    });
  }, [colecao, isReady]);

  const filtered = politicos.filter(p => {
    if (busca && !p.nome?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (uf && p.uf !== uf) return false;
    return true;
  });

  const politicoCounts = useMemo(() => {
    const counts = {};
    politicos.forEach(p => { if (p.uf) counts[p.uf] = (counts[p.uf] || 0) + 1; });
    return counts;
  }, [politicos]);

  return (
    <div className="page-container" style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Space Grotesk' }}>Painel de Fiscalizacao</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{isReady ? `${filtered.length} politicos` : ''} · Ordenados por nivel de risco</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {COLECOES.map(c => (
          <button key={c.key} onClick={() => setColecao(c.key)} style={{
            padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
            border: colecao === c.key ? '1px solid var(--accent-green)' : '1px solid var(--border-light)',
            background: colecao === c.key ? 'var(--accent-green)' : 'var(--bg-card)',
            color: colecao === c.key ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
          }}>
            {c.label}
            {!c.ready && <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 700, background: 'rgba(255,193,7,0.2)', color: '#b8860b', verticalAlign: 'super' }}>EM BREVE</span>}
          </button>
        ))}
      </div>

      {/* Em Breve overlay */}
      {!isReady ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Em Breve</h2>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto 16px' }}>
            Estamos coletando e analisando os dados de <strong>{currentCol?.label}</strong>. Esta categoria estara disponivel em breve com analises completas de gastos, fornecedores e alertas.
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Enquanto isso, explore os <strong>Deputados Federais</strong> com dados completos de gastos da CEAP.</p>
          <button onClick={() => setColecao('deputados_federais')} style={{ marginTop: '16px', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, background: 'var(--accent-green)', color: '#fff', border: 'none', cursor: 'pointer' }}>Ver Deputados Federais</button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Buscar politico..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, padding: '10px 14px', fontSize: '14px', minWidth: '180px' }} />
            <select value={uf} onChange={e => setUf(e.target.value)} style={{ padding: '10px 14px', fontSize: '14px', minWidth: '100px' }}>
              <option value="">Todos UFs</option>
              {UFS.filter(Boolean).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <button onClick={() => setShowMap(v => !v)} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 500, border: showMap ? '1px solid var(--accent-green)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: showMap ? 'var(--accent-green)' : 'var(--bg-card)', color: showMap ? '#fff' : 'var(--text-secondary)', transition: 'all 0.2s' }}>Mapa</button>
          </div>

          {showMap && (
            <MapaBrasil onSelectEstado={(estado) => setUf(estado || "")} politicoCounts={politicoCounts} />
          )}

          {/* List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
            </div>
          ) : (
            <div>
              {filtered.slice(0, 100).map((p, i) => {
                const risk = riskLevel(p.score);
                return (
                  <Link to={`/politico/${colecao}/${p.id}`} key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: '1px solid var(--border-light)', textDecoration: 'none', color: 'inherit', transition: 'border-color 0.2s' }}>
                    {/* Ranking */}
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', minWidth: '30px' }}>#{i+1}</span>
                    {/* Photo */}
                    <img src={p.foto || p.urlFoto || '/placeholder-avatar.png'} alt={p.nome} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { e.target.src = '/placeholder-avatar.png'; }} />
                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{p.nome}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.partido} - {p.uf} | {p.cargo || colecao.replace('_', ' ')}</p>
                    </div>
                    {/* Score */}
                    {p.score != null && (
                      <div style={{ textAlign: 'center', minWidth: '50px' }}>
                        <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'Space Grotesk', color: p.score >= 60 ? 'var(--accent-red)' : p.score >= 30 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{p.score}</p>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>score</p>
                      </div>
                    )}
                    {/* Risk Badge */}
                    {p.score != null && (
                      <span className={risk.cls} style={{ padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{risk.label}</span>
                    )}
                    {/* Arrow */}
                    <span style={{ color: 'var(--text-muted)', fontSize: '18px' }}>›</span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
