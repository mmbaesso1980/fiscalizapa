import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "react-router-dom";

function classColor(cls) {
  if (!cls) return 'var(--text-muted)';
  const c = (cls || '').toUpperCase();
  if (c === 'A' || c === 'B') return 'var(--accent-green)';
  if (c === 'C') return 'var(--accent-gold)';
  return 'var(--accent-red)';
}

export default function RankingPage() {
  const [deputados, setDeputados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('scoreFinalTransparenciaBR');
  const [sortDir, setSortDir] = useState('desc');
  const [filtroPartido, setFiltroPartido] = useState('');
  const [filtroUf, setFiltroUf] = useState('');

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, "politicos"));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDeputados(list);
      setLoading(false);
    }
    load();
  }, []);

  const partidos = [...new Set(deputados.map(d => d.partido || d.siglaPartido).filter(Boolean))].sort();
  const ufs = [...new Set(deputados.map(d => d.uf || d.estado || d.siglaUf).filter(Boolean))].sort();

  const filtered = deputados
    .filter(d => !filtroPartido || (d.partido || d.siglaPartido) === filtroPartido)
    .filter(d => !filtroUf || (d.uf || d.estado || d.siglaUf) === filtroUf)
    .filter(d => d.scoreFinalTransparenciaBR != null)
    .sort((a, b) => {
      const va = a[sortKey] ?? -999;
      const vb = b[sortKey] ?? -999;
      return sortDir === 'desc' ? vb - va : va - vb;
    });

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const arrow = (key) => sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';

  if (loading) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
      <div className="loading-spinner" />
      <p style={{ color: 'var(--text-muted)' }}>Carregando ranking...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Ranking TransparenciaBR</h1>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>
        Score consolidado de {filtered.length} parlamentares baseado em 5 pilares
      </p>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select value={filtroPartido} onChange={e => setFiltroPartido(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}>
          <option value="">Todos os partidos</option>
          {partidos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filtroUf} onChange={e => setFiltroUf(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}>
          <option value="">Todos os estados</option>
          {ufs.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
              <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'default' }}>#</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Deputado</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Partido/UF</th>
              <th onClick={() => toggleSort('scoreFinalTransparenciaBR')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Score{arrow('scoreFinalTransparenciaBR')}</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Classe</th>
              <th onClick={() => toggleSort('economiaScore')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Economia{arrow('economiaScore')}</th>
              <th onClick={() => toggleSort('presencaScore')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Presenca{arrow('presencaScore')}</th>
              <th onClick={() => toggleSort('proposicoesScore')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Proposicoes{arrow('proposicoesScore')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(61,107,94,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'Space Grotesk' }}>{i + 1}</td>
                <td style={{ padding: '10px 8px' }}>
                  <Link to={`/politico/deputados_federais/${d.idCamara || d.id}`} style={{ color: 'var(--accent-green)', textDecoration: 'none', fontWeight: 600 }}>
                    {d.nome}
                  </Link>
                </td>
                <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{d.partido || d.siglaPartido} - {d.uf || d.estado || d.siglaUf}</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontFamily: 'Space Grotesk', color: classColor(d.classificacaoTransparenciaBR) }}>
                  {d.scoreFinalTransparenciaBR != null ? d.scoreFinalTransparenciaBR.toFixed(1) : '-'}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: classColor(d.classificacaoTransparenciaBR) + '22', color: classColor(d.classificacaoTransparenciaBR) }}>
                    {d.classificacaoTransparenciaBR || '-'}
                  </span>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'Space Grotesk' }}>{d.economiaScore != null ? d.economiaScore.toFixed(1) : '-'}</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'Space Grotesk' }}>{d.presencaScore != null ? d.presencaScore.toFixed(1) : '-'}</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'Space Grotesk' }}>{d.proposicoesScore != null ? d.proposicoesScore.toFixed(1) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
          Nenhum deputado com score calculado. Execute o script run-calcular-indice.js primeiro.
        </p>
      )}
    </div>
  );
}
