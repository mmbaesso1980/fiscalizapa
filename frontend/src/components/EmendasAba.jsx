import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

function fmt(v) {
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  if (isNaN(n) || n === 0) return "–";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function safeNum(v) {
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export default function EmendasAba({ deputadoId, colecao, nomeDeputado }) {
  const [emendas, setEmendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [rastreamento, setRastreamento] = useState({});

  useEffect(() => {
    if (!deputadoId) return;
    async function load() {
      setLoading(true);
      try {
        // Read from NEW emendas collection (not the existing subcollection)
        const snap = await getDocs(collection(db, "emendas"));
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const mine = all.filter(e => e.parlamentarId === deputadoId || e.autorId === deputadoId);
        mine.sort((a, b) => (b.valorEmpenhado || b.valor || 0) - (a.valorEmpenhado || a.valor || 0));
        setEmendas(mine);
      } catch (err) {
        console.log("EmendasAba: colecao emendas ainda nao disponivel", err.message);
      }
      setLoading(false);
    }
    load();
  }, [deputadoId]);

  async function loadRastreamento(emendaId) {
    if (rastreamento[emendaId]) {
      setExpanded(expanded === emendaId ? null : emendaId);
      return;
    }
    try {
      // Load municipio_compras linked to this emenda
      const cSnap = await getDocs(collection(db, "municipio_compras"));
      const compras = cSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.emendaId === emendaId);
      // Load fornecedor relations
      const fSnap = await getDocs(collection(db, "relacoes_parlamentar_fornecedor"));
      const fornRel = fSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.emendaId === emendaId);
      setRastreamento(prev => ({ ...prev, [emendaId]: { compras, fornRel } }));
    } catch (err) {
      console.log("Rastreamento nao disponivel", err.message);
      setRastreamento(prev => ({ ...prev, [emendaId]: { compras: [], fornRel: [] } }));
    }
    setExpanded(emendaId);
  }

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>Carregando emendas parlamentares...</div>;
  }

  if (emendas.length === 0) {
    return (
      <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>Nenhuma emenda encontrada na base de dados enriquecida.</p>
        <p style={{ fontSize: '11px', marginTop: '8px' }}>Os dados de emendas estao sendo coletados gradualmente. Em breve estarao disponiveis.</p>
        {nomeDeputado && (
          <a href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(nomeDeputado)}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: '12px', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'var(--accent-green)', color: '#fff', textDecoration: 'none' }}>
            Consultar no Portal da Transparencia
          </a>
        )}
      </div>
    );
  }

  const totalEmpenhado = emendas.reduce((s, e) => s + safeNum(e.valorEmpenhado ?? e.valor), 0);
  const totalPago      = emendas.reduce((s, e) => s + safeNum(e.valorPago), 0);
  const municipios = [...new Set(emendas.map(e => e.municipioNome).filter(Boolean))];

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-gold)' }}>{emendas.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>EMENDAS</div>
        </div>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-orange)' }}>{fmt(totalEmpenhado)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>TOTAL EMPENHADO</div>
        </div>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-green)' }}>{fmt(totalPago)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>TOTAL PAGO</div>
        </div>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{municipios.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>MUNICIPIOS</div>
        </div>
      </div>

      {/* Emendas list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {emendas.map(e => {
          const isExpanded = expanded === e.id;
          const rast = rastreamento[e.id];
          return (
            <div key={e.id} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
              <div
                onClick={() => loadRastreamento(e.id)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                    {e.municipioNome || 'N/A'} {e.uf ? `- ${e.uf}` : ''}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    {e.objetoResumo || e.funcao || e.programa || ''}
                    {e.status ? ` | ${e.status}` : ''}
                    {e.ano ? ` | ${e.ano}` : ''}
                  </p>
                  {e.favorecido && <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>Favorecido: {e.favorecido}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)', fontSize: '15px' }}>{fmt(e.valorEmpenhado ?? e.valor)}</span>
                  {safeNum(e.valorPago) > 0 && <p style={{ fontSize: '11px', color: 'var(--accent-green)', margin: '2px 0 0' }}>Pago: {fmt(e.valorPago)}</p>}
                  {(e.linkPortal || e.urlPortal) && (
                    <a href={e.linkPortal || e.urlPortal} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginTop: 2 }}>
                      🔗 Fonte ↗
                    </a>
                  )}
                </div>
              </div>
              {/* Rastreamento expandido */}
              {isExpanded && rast && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
                  {rast.compras.length === 0 && rast.fornRel.length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rastreamento de compras municipais ainda nao disponivel para esta emenda.</p>
                  )}
                  {rast.compras.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Compras Municipais Vinculadas:</p>
                      {rast.compras.map((c, i) => (
                        <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border-light)' }}>
                          {c.fornecedor || c.empresa || 'N/A'} - {fmt(c.valor)} {c.cnpj ? `| CNPJ: ${c.cnpj}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {rast.fornRel.length > 0 && (
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-red)', marginBottom: '6px' }}>Relacoes Fornecedor-Parlamentar:</p>
                      {rast.fornRel.map((f, i) => (
                        <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 0' }}>
                          {f.fornecedorNome || f.cnpj || 'N/A'} - {f.tipo || 'vinculo detectado'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
