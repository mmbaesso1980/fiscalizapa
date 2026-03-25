import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "react-router-dom";

function classColor(cls) {
  if (!cls) return 'var(--text-muted)';
  const c = (cls || '').toUpperCase();
  if (c === 'A' || c === 'B' || c === 'EXCELENTE' || c === 'BOM') return 'var(--accent-green)';
  if (c === 'C' || c === 'REGULAR') return 'var(--accent-gold)';
  return 'var(--accent-red)';
}

export default function RankingPage() {
  const [deputados, setDeputados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('scoreDisplay');
  const [sortDir, setSortDir] = useState('desc');
  const [filtroPartido, setFiltroPartido] = useState('');
  const [filtroUf, setFiltroUf] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(collection(db, "deputados_federais"));
        const list = [];
        snap.docs.forEach(d => {
          const data = d.data();
          // Use scoreFinal if available, otherwise fall back to scoreBruto
          const scoreDisplay = data.scoreFinalTransparenciaBR ?? data.scoreBrutoTransparenciaBR ?? null;
          if (scoreDisplay != null && data.nome) {
            list.push({
              id: d.id,
              nome: data.nome || 'Deputado ' + d.id,
              partido: data.partido || data.siglaPartido || '',
              uf: data.uf || data.estado || data.siglaUf || '',
              fotoUrl: data.fotoUrl || data.urlFoto || '',
              idCamara: data.idCamara || d.id,
              scoreDisplay,
              scoreFinalTransparenciaBR: data.scoreFinalTransparenciaBR ?? null,
              scoreBrutoTransparenciaBR: data.scoreBrutoTransparenciaBR ?? null,
              classificacaoTransparenciaBR: data.classificacaoTransparenciaBR ?? null,
              economiaScore: data.pilares ? (data.pilares.economiaScore ?? null) : null,
              presencaScore: data.pilares ? (data.pilares.presencaScore ?? null) : null,
              proposicoesScore: data.pilares ? (data.pilares.proposicoesScore ?? null) : null,
              defesasPlenarioScore: data.pilares ? (data.pilares.defesasPlenarioScore ?? null) : null,
              processosScore: data.processosScore ?? null,
            });
          }
        });
        setDeputados(list);
      } catch (err) {
        console.error('Erro ao carregar ranking:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const partidos = [...new Set(deputados.map(d => d.partido).filter(Boolean))].sort();
  const ufs = [...new Set(deputados.map(d => d.uf).filter(Boolean))].sort();

  const filtered = deputados
    .filter(d => !filtroPartido || d.partido === filtroPartido)
    .filter(d => !filtroUf || d.uf === filtroUf)
    .sort((a, b) => {
      const va = a[sortKey] ?? -999;
      const vb = b[sortKey] ?? -999;
      return sortDir === 'desc' ? vb - va : va - vb;
    });

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const arrow = (key) => sortKey === key ? (sortDir === 'desc' ? ' \u25BC' : ' \u25B2') : '';

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Carregando ranking...</div>
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>Ranking TransparenciaBR</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '14px' }}>
        Score consolidado de {filtered.length} parlamentares baseado em 5 pilares
      </p>

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

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
              <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>#</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Deputado</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Partido/UF</th>
              <th onClick={() => toggleSort('scoreDisplay')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Score{arrow('scoreDisplay')}</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Classe</th>
              <th onClick={() => toggleSort('economiaScore')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Economia{arrow('economiaScore')}</th>
              <th onClick={() => toggleSort('presencaScore')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Presenca{arrow('presencaScore')}</th>
              <th onClick={() => toggleSort('proposicoesScore')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Proposicoes{arrow('proposicoesScore')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(61,107,94,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.15s' }}>
                <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>{i + 1}</td>
                <td style={{ padding: '12px 8px' }}>
                  <Link to={`/politico/${d.idCamara}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: '500' }}>
                    {d.fotoUrl && <img src={d.fotoUrl} alt={d.nome} style={{ width: '28px', height: '28px', borderRadius: '50%', marginRight: '8px', verticalAlign: 'middle', objectFit: 'cover' }} />}
                    {d.nome}
                  </Link>
                </td>
                <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '13px' }}>{d.partido} - {d.uf}</td>
                <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '700', color: classColor(d.classificacaoTransparenciaBR) }}>
                  {d.scoreDisplay != null ? d.scoreDisplay.toFixed(1) : '-'}
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  <span style={{ color: classColor(d.classificacaoTransparenciaBR), fontWeight: '600', fontSize: '12px' }}>
                    {d.classificacaoTransparenciaBR || '-'}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{d.economiaScore != null ? d.economiaScore.toFixed(1) : '-'}</td>
                <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{d.presencaScore != null ? d.presencaScore.toFixed(1) : '-'}</td>
                <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{d.proposicoesScore != null ? d.proposicoesScore.toFixed(1) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Nenhum deputado com score calculado encontrado. Verifique se o script run-ingest-score-transparencia.js foi executado.
        </div>
      )}
    </div>
  );
}
