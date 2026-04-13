import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

function fmt(v) {
  if (!v) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

const MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function VerbaGabineteSection({ colecao, politicoId, idCamara }) {
  const [verbas, setVerbas] = useState([]);
  const [pessoal, setPessoal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('mensal');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const vSnap = await getDocs(collection(db, colecao, politicoId, "verbas_gabinete"));
        const vList = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        vList.sort((a, b) => (a.mes || 0) - (b.mes || 0));
        setVerbas(vList);

        const pSnap = await getDocs(collection(db, colecao, politicoId, "pessoal_gabinete"));
        setPessoal(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.log('Erro carregando verba gabinete:', e);
      }
      setLoading(false);
    }
    load();
  }, [colecao, politicoId]);

  const totalGasto = verbas.reduce((s, v) => s + (v.valorGasto || 0), 0);
  const totalDisponivel = verbas.reduce((s, v) => s + (v.valorDisponivel || 0), 0);
  const economia = totalDisponivel - totalGasto;
  const percentual = totalDisponivel > 0 ? ((totalGasto / totalDisponivel) * 100).toFixed(1) : '0';
  const maxGasto = Math.max(...verbas.map(v => v.valorDisponivel || 0), 1);

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '20px' }}>Carregando verba de gabinete...</p>;

  const hasData = verbas.length > 0 || pessoal.length > 0;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-orange)' }}>{fmt(totalGasto)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>TOTAL GASTO</div>
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-green)' }}>{fmt(economia)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>ECONOMIA</div>
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: Number(percentual) > 80 ? 'var(--accent-red)' : 'var(--accent-gold)' }}>{percentual}%</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>UTILIZADO</div>
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{pessoal.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>ASSESSORES</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['mensal', 'pessoal'].map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            border: subTab === t ? '1px solid var(--accent-green)' : '1px solid transparent',
            background: subTab === t ? 'var(--accent-green)' : 'transparent',
            color: subTab === t ? '#fff' : 'var(--text-secondary)'
          }}>{t === 'mensal' ? 'Gastos Mensais' : `Pessoal (${pessoal.length})`}</button>
        ))}
      </div>

      {/* Monthly expenses */}
      {subTab === 'mensal' && (
        <div>
          {verbas.length === 0 ? (
            <>
              <p style={{ color: 'var(--text-muted)' }}>Dados mensais de verba de gabinete nao encontrados no banco local.</p>
              <a href={`https://www.camara.leg.br/deputados/${idCamara}/verba-gabinete`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-green)' }}>Consultar no Portal da Camara</a>
            </>
          ) : (
            verbas.map(v => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ minWidth: '36px', fontWeight: 600, color: 'var(--text-primary)' }}>{MESES[v.mes] || v.mes}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '4px', height: '20px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{ width: `${((v.valorGasto || 0) / maxGasto) * 100}%`, background: 'var(--accent-orange)', borderRadius: '4px', minWidth: v.valorGasto > 0 ? '2px' : '0' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Disponivel: {fmt(v.valorDisponivel)} | Gasto: {fmt(v.valorGasto)} ({v.percentualUtilizado}%)
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--accent-orange)', whiteSpace: 'nowrap' }}>{fmt(v.valorGasto)}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pessoal */}
      {subTab === 'pessoal' && (
        <div>
          {pessoal.length === 0 ? (
            <>
              <p style={{ color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                Dados de pessoal do gabinete não estão neste painel. A API pública da Câmara não expõe a folha completa de assessores; consulte o Portal da Transparência (SIAPE) ou o site oficial do deputado.
              </p>
              <a href="https://portaldatransparencia.gov.br" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-green)', display: 'inline-flex', alignItems: 'center', minHeight: 44, marginRight: 12 }}>Portal da Transparência ↗</a>
              <a href={`https://www.camara.leg.br/deputados/${idCamara}/pessoal-gabinete`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-green)', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Página da Câmara ↗</a>
            </>
          ) : (
            pessoal.map((p, i) => (
              <div key={p.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-card)', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border-light)' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{p.nome}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{p.grupoFuncional} | {p.cargo} {p.periodo ? '| ' + p.periodo : ''}</p>
                </div>
                <span style={{ fontSize: '20px' }}>👤</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Links oficiais */}
      <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <a href={`https://www.camara.leg.br/deputados/${idCamara}/verba-gabinete`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--accent-green)' }}>🔗 Verba Gabinete (Camara)</a>
        <a href={`https://www.camara.leg.br/deputados/${idCamara}/pessoal-gabinete`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--accent-green)' }}>👥 Pessoal Gabinete (Camara)</a>
      </div>
    </div>
  );
}
