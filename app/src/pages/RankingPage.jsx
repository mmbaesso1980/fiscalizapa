import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getRankColor, getRankColorSoft, getRankLabel } from "../lib/rankColor";

function fmtBRL(val) {
  const num = parseFloat(String(val || '').replace(/\./g, '').replace(',', '.'));
  if (isNaN(num) || num === 0) return '–';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RankingPage() {
  const [deputies,   setDeputies]  = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [query2,     setQuery2]    = useState('');
  const [filterUF,   setFilterUF]  = useState('');
  const [filterPart, setFilterPart]= useState('');
  const [total,      setTotal]     = useState(0);

  useEffect(() => {
    async function fetchAll() {
      try {
        const col  = collection(db, 'deputados_federais');
        const q    = query(col, orderBy('score', 'desc'));
        const snap = await getDocs(q);
        const data = snap.docs.map((doc, i) => ({
          id:             doc.id,
          rank:           i + 1,
          nome:           doc.data().nome || doc.data().nomeCompleto || doc.id,
          partido:        doc.data().partido || '–',
          uf:             doc.data().uf || '–',
          score:          parseFloat(doc.data().score || doc.data().indice_transparenciabr || 0),
          gastosCeapTotal: doc.data().gastosCeapTotal || doc.data().totalGasto || 0,
        }));
        setDeputies(data);
        setTotal(data.length);
      } catch (err) {
        console.error('Erro Firestore:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const ufs      = [...new Set(deputies.map(d => d.uf))].filter(Boolean).sort();
  const partidos = [...new Set(deputies.map(d => d.partido))].filter(Boolean).sort();

  const filtered = deputies.filter(d => {
    const matchName = d.nome.toLowerCase().includes(query2.toLowerCase());
    const matchUF   = filterUF   ? d.uf      === filterUF   : true;
    const matchPart = filterPart ? d.partido === filterPart : true;
    return matchName && matchUF && matchPart;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#2D2D2D', marginBottom: 6 }}>
            Ranking de Transparência Parlamentar
          </h1>
          <p style={{ fontSize: 14, color: '#999' }}>
            {loading ? 'Carregando...' : `${total} deputados federais · dados públicos da Câmara dos Deputados`}
          </p>
        </div>

        {/* FILTROS */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Buscar deputado..."
            value={query2}
            onChange={e => setQuery2(e.target.value)}
            style={{ flex: 3, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: '1px solid #EDEBE8', fontSize: 14, background: '#fff', color: '#2D2D2D', outline: 'none' }}
          />
          <select value={filterUF}   onChange={e => setFilterUF(e.target.value)}   style={selSt}>
            <option value="">Todos os estados</option>
            {ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
          <select value={filterPart} onChange={e => setFilterPart(e.target.value)} style={selSt}>
            <option value="">Todos os partidos</option>
            {partidos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* LISTA */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px', color: '#AAA', fontSize: 15 }}>Carregando deputies...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(dep => {
              const color     = getRankColor(dep.rank);
              const colorSoft = getRankColorSoft(dep.rank);
              const { label } = getRankLabel(dep.rank);
              const [r, g, b] = color.match(/\d+/g).map(Number);
              const borderC   = `rgb(${Math.round(r * 0.78)},${Math.round(g * 0.78)},${Math.round(b * 0.78)})`;
              return (
                /* ROTA CORRIGIDA: /politico/deputados_federais/:id */
                <Link key={dep.id} to={`/politico/deputados_federais/${dep.id}`} style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 16px', borderRadius: 12,
                      background: colorSoft, border: `1px solid ${color}33`,
                      transition: 'transform 0.12s, box-shadow 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${color}22`; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <span style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.45) 0%, transparent 55%), ${color}`,
                      border: `2px solid ${borderC}`,
                      boxShadow: `0 3px 10px ${color}55, inset 0 1px 2px rgba(255,255,255,0.3)`,
                    }}>
                      {dep.rank}º
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dep.nome}</div>
                      <div style={{ fontSize: 12, color: '#AAA' }}>{dep.partido} · {dep.uf}</div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color }}>{dep.score}</div>
                      <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: color + '22', color, fontWeight: 600, marginTop: 2 }}>{label}</div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 100 }}>
                      <div style={{ fontSize: 11, color: '#CCC', marginBottom: 2 }}>CEAP total</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2D2D', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(dep.gastosCeapTotal)}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#AAA', fontSize: 14 }}>Nenhum deputado encontrado.</div>
        )}

        {!loading && (
          <p style={{ marginTop: 24, fontSize: 12, color: '#CCC', textAlign: 'center' }}>
            {filtered.length} de {total} deputados
          </p>
        )}
      </div>
    </div>
  );
}

const selSt = { flex: 1, minWidth: 110, padding: '10px 14px', borderRadius: 10, border: '1px solid #EDEBE8', fontSize: 14, background: '#fff', color: '#2D2D2D' };
