import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import MapaBrasil from "../components/MapaBrasil";

const UFS = ["","AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const COLECOES = [
  { key: "deputados_federais", label: "Dep. Federais" },
  { key: "deputados", label: "Dep. Estaduais PA" },
  { key: "senadores", label: "Senadores" },
  { key: "governadores", label: "Governadores" },
  { key: "deputados_distritais", label: "Distritais DF" }
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

  useEffect(() => {
    setLoading(true);
    getDocs(collection(db, colecao)).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
      setPoliticos(list);
      setLoading(false);
    });
  }, [colecao]);

  const filtered = politicos.filter(p => {
    if (busca && !p.nome?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (uf && p.uf !== uf) return false;
    return true;
  });

  const politicoCounts = useMemo(() => {
    const counts = {};
    politicos.forEach(p => {
      if (p.uf) counts[p.uf] = (counts[p.uf] || 0) + 1;
    });
    return counts;
  }, [politicos]);

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>Painel de Fiscalizacao</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {filtered.length} politicos &middot; Ordenados por nivel de risco
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {COLECOES.map(c => (
          <button key={c.key} onClick={() => setColecao(c.key)} style={{
            padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
            border: colecao === c.key ? '1px solid var(--accent-green)' : '1px solid var(--border-light)',
            background: colecao === c.key ? 'var(--accent-green)' : 'var(--bg-card)',
            color: colecao === c.key ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer', transition: 'all 0.2s'
          }}>{c.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar politico..."
          value={busca} onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, padding: '10px 14px', fontSize: '14px', minWidth: '180px' }}
        />
        <select value={uf} onChange={e => setUf(e.target.value)} style={{ padding: '10px 14px', fontSize: '14px', minWidth: '100px' }}>
          <option value="">Todos UFs</option>
          {UFS.filter(Boolean).map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <button onClick={() => setShowMap(v => !v)} style={{
          padding: '10px 16px', fontSize: '13px', fontWeight: 500,
          border: showMap ? '1px solid var(--accent-green)' : '1px solid var(--border-light)',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          background: showMap ? 'var(--accent-green)' : 'var(--bg-card)',
          color: showMap ? '#fff' : 'var(--text-secondary)', transition: 'all 0.2s'
        }}>
          Mapa
        </button>
      </div>

      {showMap && (
        <MapaBrasil
          selectedEstado={uf}
          onEstadoSelect={(estado) => setUf(estado || "")}
          politicoCounts={politicoCounts}
        />
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.slice(0, 100).map((p, i) => {
            const risk = riskLevel(p.score);
            return (
              <Link key={p.id} to={"/politico/" + colecao + "/" + p.id}
                className="card-hover"
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 18px', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card)', textDecoration: 'none',
                  color: 'var(--text-primary)'
                }}>
                {/* Ranking */}
                <div style={{
                  width: '32px', textAlign: 'center',
                  fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)'
                }}>#{i+1}</div>

                {/* Photo */}
                <img src={p.fotoUrl || p.foto || ''} alt="" style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  objectFit: 'cover', background: 'var(--bg-secondary)',
                  border: '2px solid var(--border-light)'
                }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {p.partido} - {p.uf} | {p.cargo || colecao.replace('_', ' ')}
                  </div>
                </div>

                {/* Score */}
                {p.score != null && (
                  <div style={{ textAlign: 'center', minWidth: '50px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Space Grotesk', color: p.score >= 60 ? 'var(--accent-red)' : p.score >= 30 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{p.score}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>score</div>
                  </div>
                )}

                {/* Risk Badge */}
                {p.score != null && (
                  <span className={risk.cls} style={{
                    padding: '4px 10px', borderRadius: '12px',
                    fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap'
                  }}>{risk.label}</span>
                )}

                {/* Arrow */}
                <span style={{ color: 'var(--text-muted)', fontSize: '18px' }}>&rsaquo;</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
