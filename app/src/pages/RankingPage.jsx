import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "react-router-dom";
import {
  calcularScoreBrutoTransparenciaBR,
  normalizarScoresPorKim,
  classificarScoreTransparenciaBR
} from "../utils/indiceTransparenciaBR";

const PLACEHOLDER_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23ddd'/%3E%3Ccircle cx='40' cy='30' r='14' fill='%23bbb'/%3E%3Cellipse cx='40' cy='70' rx='24' ry='18' fill='%23bbb'/%3E%3C/svg%3E";

export default function RankingPage() {
  const [deputados, setDeputados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('idx');
  const [sortDir, setSortDir] = useState('desc');
  const [filtroPartido, setFiltroPartido] = useState('');
  const [filtroUf, setFiltroUf] = useState('');

  useEffect(() => {
    getDocs(collection(db, "deputados_federais")).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.nome);
      const normalized = normalizarScoresPorKim(list);
      normalized.sort((a, b) => (b.idx || 0) - (a.idx || 0));
      setDeputados(normalized);
      setLoading(false);
    }).catch(err => {
      console.error('Erro ao carregar ranking:', err);
      setLoading(false);
    });
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
              <th onClick={() => toggleSort('idx')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Indice{arrow('idx')}</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Classe</th>
              <th onClick={() => toggleSort('totalGastos')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>Gastos CEAP{arrow('totalGastos')}</th>
              <th onClick={() => toggleSort('presencaScore')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Presenca{arrow('presencaScore')}</th>
              <th onClick={() => toggleSort('proposicoesScore')} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>Proposicoes{arrow('proposicoesScore')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => {
              const v = classificarScoreTransparenciaBR(d.idx);
              const idCamara = d.idCamara || d.id;
              const foto = d.urlFoto || (idCamara ? `https://www.camara.leg.br/internet/deputado/bandep/${idCamara}.jpg` : null);
              const idxColor = d.idx >= 80 ? 'var(--accent-green)' : d.idx >= 50 ? 'var(--accent-orange, #f59e0b)' : 'var(--accent-red)';
              return (
                <tr key={d.id}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(61,107,94,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.15s' }}>
                  <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>{i + 1}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <Link to={`/politico/deputados_federais/${d.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {foto && <img src={foto} alt={d.nome} onError={e => { e.target.src = PLACEHOLDER_AVATAR; }} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                      {d.nome}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '13px' }}>{d.partido || '?'} - {d.uf || '?'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '700', color: idxColor }}>
                    {d.idx != null ? d.idx : '-'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <span style={{ color: idxColor, fontWeight: '600', fontSize: '12px' }}>{v?.label || '-'}</span>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {d.totalGastos ? `R$ ${(d.totalGastos/1000).toFixed(0)}k` : '-'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {d.presencaScore != null ? d.presencaScore.toFixed(1) : (d.presenca != null ? d.presenca.toFixed(1) : '-')}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {d.proposicoesScore != null ? d.proposicoesScore.toFixed(1) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Nenhum deputado encontrado com os filtros selecionados.
        </div>
      )}
    </div>
  );
}
