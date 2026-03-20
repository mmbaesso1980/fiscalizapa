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

const KIM_ID_CAMARA = 204536;

function calcularIndiceTransparencia(p) {
  let raw = 0;
  const totalGastos = p.totalGastos || 0;
  const totalDespesas = p.totalDespesas || 0;
  const riskScore = p.score || p.riskScore || 0;
  const economiaScore = Math.max(0, 100 - Math.min((totalGastos / 800000) * 100, 100));
  const riskInvertido = Math.max(0, 100 - riskScore);
  const presencaScore = p.presencaScore || p.presenca || 50;
  const proposicoesScore = p.proposicoesScore || Math.min((totalDespesas > 0 ? 40 : 0) + 10, 50);
  const defesasScore = p.defesasPlenarioScore || 30;
  raw = (economiaScore * 0.40) + (riskInvertido * 0.25) + (presencaScore * 0.20) + (proposicoesScore * 0.10) + (defesasScore * 0.05);
  return Math.round(Math.max(0, Math.min(raw, 100)));
}

function normalizarPorKim(politicos) {
  const kim = politicos.find(p => Number(p.idCamara) === KIM_ID_CAMARA);
  if (!kim) return politicos;
  const kimRaw = calcularIndiceTransparencia(kim);
  if (kimRaw <= 0) return politicos;
  const fator = 100 / kimRaw;
  return politicos.map(p => {
    const raw = calcularIndiceTransparencia(p);
    const normalizado = Math.round(Math.min(raw * fator, 120));
    return { ...p, scoreTransparencia: normalizado };
  });
}

function transparenciaLevel(score) {
  if (score >= 80) return { label: "Otimo", cls: "risk-badge-low" };
  if (score >= 50) return { label: "Regular", cls: "risk-badge-medium" };
  return { label: "Ruim", cls: "risk-badge-high" };
}

function riskLevel(score) {
  if (!score || score < 30) return { label: "Baixo", cls: "risk-badge-low" };
  if (score < 60) return { label: "Medio", cls: "risk-badge-medium" };
  return { label: "Alto", cls: "risk-badge-high" };
}

function RankingCard({ p, rank, colecao, isTop }) {
  const level = transparenciaLevel(p.scoreTransparencia);
  const medalha = rank === 1 && isTop ? " " : "";
  return (
    <Link to={`/politico/${colecao}/${p.id}`} style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
      background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
      marginBottom: '6px', border: isTop ? '1px solid rgba(74,144,101,0.3)' : '1px solid rgba(200,50,50,0.2)',
      textDecoration: 'none', color: 'inherit', transition: 'border-color 0.2s'
    }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color: isTop ? 'var(--accent-green)' : 'var(--accent-red)', minWidth: '28px' }}>#{rank}</span>
      <img src={p.foto || p.urlFoto || p.fotoUrl || '/placeholder-avatar.png'} alt={p.nome} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { e.target.src = '/placeholder-avatar.png'; }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{medalha}{p.nome}</p>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.partido} - {p.uf}</p>
      </div>
      <div style={{ textAlign: 'center', minWidth: '44px' }}>
        <p style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Space Grotesk', color: isTop ? 'var(--accent-green)' : 'var(--accent-red)' }}>{p.scoreTransparencia}</p>
        <p style={{ fontSize: '9px', color: 'var(--text-muted)' }}>indice</p>
      </div>
      <span className={level.cls} style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>{level.label}</span>
    </Link>
  );
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
      const normalized = normalizarPorKim(list);
      normalized.sort((a, b) => (b.scoreTransparencia || 0) - (a.scoreTransparencia || 0));
      setPoliticos(normalized);
      setLoading(false);
    });
  }, [colecao, isReady]);

  const filtered = politicos.filter(p => {
    if (busca && !p.nome?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (uf && p.uf !== uf) return false;
    return true;
  });

  const top10 = useMemo(() => {
    const sorted = [...politicos].sort((a, b) => (b.scoreTransparencia || 0) - (a.scoreTransparencia || 0));
    return sorted.slice(0, 10);
  }, [politicos]);

  const bottom10 = useMemo(() => {
    const withScore = politicos.filter(p => p.scoreTransparencia != null && p.scoreTransparencia > 0);
    const sorted = [...withScore].sort((a, b) => (a.scoreTransparencia || 0) - (b.scoreTransparencia || 0));
    return sorted.slice(0, 10);
  }, [politicos]);

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
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{isReady ? `${filtered.length} politicos` : ''} · Indice TransparenciaBR (Kim Kataguiri = 100)</p>
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x1F6A7;</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Em Breve</h2>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto 16px' }}>
            Estamos coletando e analisando os dados de <strong>{currentCol?.label}</strong>.
          </p>
          <button onClick={() => setColecao('deputados_federais')} style={{ marginTop: '16px', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, background: 'var(--accent-green)', color: '#fff', border: 'none', cursor: 'pointer' }}>Ver Deputados Federais</button>
        </div>
      ) : (
        <>
          {/* Base Legal */}
          <div style={{ padding: '12px 16px', background: 'rgba(74,144,101,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: '20px', border: '1px solid rgba(74,144,101,0.2)' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong>Base legal:</strong> Art. 37 CF/88 (publicidade dos atos), Lei 12.527/2011 (LAI), dados 100% publicos da Camara dos Deputados. Indice apartidario calculado por criterios tecnicos objetivos: economia de cota (40%), processos/risco (25%), presenca (20%), proposicoes (10%), defesas em plenario (5%). Sem vinculacao ideologica ou partidaria.
            </p>
          </div>

          {/* Top 10 e Bottom 10 */}
          {!loading && top10.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              {/* Top 10 */}
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-green)', marginBottom: '12px', fontFamily: 'Space Grotesk' }}>Top 10 — Melhores Indices</h2>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>Deputados com maior indice de transparencia, economia e atividade parlamentar.</p>
                {top10.map((p, i) => <RankingCard key={p.id} p={p} rank={i+1} colecao={colecao} isTop={true} />)}
              </div>
              {/* Bottom 10 */}
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-red)', marginBottom: '12px', fontFamily: 'Space Grotesk' }}>Bottom 10 — Piores Indices</h2>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>Deputados com menor indice. Baseado em dados publicos oficiais, sem juizo de valor.</p>
                {bottom10.map((p, i) => <RankingCard key={p.id} p={p} rank={i+1} colecao={colecao} isTop={false} />)}
              </div>
            </div>
          )}

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

          {/* Ranking Completo */}
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', marginTop: '8px', fontFamily: 'Space Grotesk' }}>Ranking Completo</h2>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
            </div>
          ) : (
            <div>
              {filtered.slice(0, 100).map((p, i) => {
                const level = transparenciaLevel(p.scoreTransparencia);
                return (
                  <Link to={`/politico/${colecao}/${p.id}`} key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: '1px solid var(--border-light)', textDecoration: 'none', color: 'inherit', transition: 'border-color 0.2s' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', minWidth: '30px' }}>#{i+1}</span>
                    <img src={p.foto || p.urlFoto || p.fotoUrl || '/placeholder-avatar.png'} alt={p.nome} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { e.target.src = '/placeholder-avatar.png'; }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{p.nome}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.partido} - {p.uf} | {p.cargo || 'Deputado Federal'}</p>
                    </div>
                    {p.scoreTransparencia != null && (
                      <div style={{ textAlign: 'center', minWidth: '50px' }}>
                        <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'Space Grotesk', color: p.scoreTransparencia >= 80 ? 'var(--accent-green)' : p.scoreTransparencia >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)' }}>{p.scoreTransparencia}</p>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>indice</p>
                      </div>
                    )}
                    {p.scoreTransparencia != null && (
                      <span className={level.cls} style={{ padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{level.label}</span>
                    )}
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
