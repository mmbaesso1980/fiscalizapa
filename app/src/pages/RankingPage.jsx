import { useState } from "react";
import { Link } from "react-router-dom";
import { getRankColor, getRankColorSoft, getRankLabel } from "../lib/rankColor";

const MOCK_DEPUTIES = Array.from({ length: 40 }, (_, i) => ({
  rank:    i + 1,
  nome:    `Deputado ${i + 1}`,
  partido: ['PT','PL','MDB','PP','PSD','Uniao','Novo','PSOL','PDT','PSB'][i % 10],
  uf:      ['SP','RJ','MG','BA','RS','PR','GO','AM','PA','CE'][i % 10],
  score:   parseFloat((98 - i * 1.7).toFixed(1)),
  ceap:    `R$ ${(12000 + i * 1800).toLocaleString('pt-BR')}`,
}));

export default function RankingPage() {
  const [query, setQuery]       = useState('');
  const [filterUF, setFilterUF] = useState('');
  const ufs = [...new Set(MOCK_DEPUTIES.map(d => d.uf))].sort();
  const filtered = MOCK_DEPUTIES.filter(d => {
    const matchName = d.nome.toLowerCase().includes(query.toLowerCase());
    const matchUF   = filterUF ? d.uf === filterUF : true;
    return matchName && matchUF;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#2D2D2D', marginBottom: 6 }}>Ranking de Transparencia Parlamentar</h1>
        <p style={{ fontSize: 14, color: '#AAA', marginBottom: 24 }}>Score calculado automaticamente pelo motor ASMODEUS. Clique para ver o perfil completo.</p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Buscar deputado..." value={query} onChange={e => setQuery(e.target.value)}
            style={{ flex: 2, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: '1px solid #EDEBE8', fontSize: 14, background: '#fff', color: '#2D2D2D' }} />
          <select value={filterUF} onChange={e => setFilterUF(e.target.value)}
            style={{ flex: 1, minWidth: 120, padding: '10px 14px', borderRadius: 10, border: '1px solid #EDEBE8', fontSize: 14, background: '#fff', color: '#2D2D2D' }}>
            <option value="">Todos os estados</option>
            {ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(dep => {
            const color     = getRankColor(dep.rank);
            const colorSoft = getRankColorSoft(dep.rank);
            const { label } = getRankLabel(dep.rank);
            return (
              <Link key={dep.rank} to={`/politico/deputados/${dep.rank}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12, background: colorSoft, border: `1px solid ${color}33`, transition: 'transform 0.12s, box-shadow 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.07)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{dep.rank}o</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dep.nome}</div>
                    <div style={{ fontSize: 12, color: '#AAA' }}>{dep.partido} - {dep.uf}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color }}>{dep.score}</div>
                    <div style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: color + '22', color, fontWeight: 600 }}>{label}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 90 }}>
                    <div style={{ fontSize: 12, color: '#AAA' }}>CEAP</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2D2D' }}>{dep.ceap}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '48px 24px', color: '#AAA', fontSize: 14 }}>Nenhum deputado encontrado.</div>}
        <p style={{ marginTop: 24, fontSize: 12, color: '#CCC', textAlign: 'center' }}>Dados mockados. Integracao com API Camara em andamento.</p>
      </div>
    </div>
  );
}
