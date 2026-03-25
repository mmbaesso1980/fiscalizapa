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

function PilarRow({ label, valA, valB }) {
  const colorA = valA != null ? (valA >= 7 ? 'var(--accent-green)' : valA >= 4 ? 'var(--accent-gold)' : 'var(--accent-red)') : 'var(--text-muted)';
  const colorB = valB != null ? (valB >= 7 ? 'var(--accent-green)' : valB >= 4 ? 'var(--accent-gold)' : 'var(--accent-red)') : 'var(--text-muted)';
  return (
    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
      <td style={{ padding: '10px 12px', fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)' }}>{label}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontFamily: 'Space Grotesk', color: colorA }}>{valA != null ? valA.toFixed(1) : '-'}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontFamily: 'Space Grotesk', color: colorB }}>{valB != null ? valB.toFixed(1) : '-'}</td>
    </tr>
  );
}

export default function ComparadorPage() {
  const [deputados, setDeputados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // deputados_federais has both basic info AND scores
        const snap = await getDocs(collection(db, "deputados_federais"));
        const list = [];
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.nome) {
            list.push({
              id: d.id,
              nome: data.nome || '',
              partido: data.partido || data.siglaPartido || '',
              uf: data.uf || data.estado || data.siglaUf || '',
              fotoUrl: data.fotoUrl || data.urlFoto || '',
              idCamara: data.idCamara || d.id,
              scoreFinalTransparenciaBR: data.scoreFinalTransparenciaBR ?? null,
              scoreBrutoTransparenciaBR: data.scoreBrutoTransparenciaBR ?? null,
              classificacaoTransparenciaBR: data.classificacaoTransparenciaBR ?? null,
              economiaScore: data.pilares ? data.pilares.economiaScore : null,
              presencaScore: data.pilares ? data.pilares.presencaScore : null,
              proposicoesScore: data.pilares ? data.pilares.proposicoesScore : null,
              defesasPlenarioScore: data.pilares ? data.pilares.defesasPlenarioScore : null,
              processosScore: data.processosScore ?? null,
            });
          }
        });
        list.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        setDeputados(list);
      } catch (err) {
        console.error('Erro ao carregar comparador:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const depA = deputados.find(d => d.id === idA);
  const depB = deputados.find(d => d.id === idB);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Carregando deputados...</div>
  );

  const selectStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>Comparador de Deputados</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '28px', fontSize: '14px' }}>Compare dois parlamentares lado a lado nos 5 pilares</p>

      {/* Seletores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Deputado A</div>
          <select value={idA} onChange={e => setIdA(e.target.value)} style={selectStyle}>
            <option value="">Selecione...</option>
            {deputados.map(d => <option key={d.id} value={d.id}>{d.nome} ({d.partido}-{d.uf})</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Deputado B</div>
          <select value={idB} onChange={e => setIdB(e.target.value)} style={selectStyle}>
            <option value="">Selecione...</option>
            {deputados.map(d => <option key={d.id} value={d.id}>{d.nome} ({d.partido}-{d.uf})</option>)}
          </select>
        </div>
      </div>

      {/* Comparacao */}
      {depA && depB && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--bg-secondary)' }}>
            <div style={{ padding: '20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pilar</div>
            <div style={{ padding: '20px', textAlign: 'center' }}>
              {depA.fotoUrl && <img src={depA.fotoUrl} alt={depA.nome} onError={e => { e.target.src = '/placeholder-avatar.png'; }} style={{ width: '44px', height: '44px', borderRadius: '50%', marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />}
              <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>{depA.nome}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{depA.partido}-{depA.uf}</div>
              <div style={{ marginTop: '6px', fontWeight: '700', fontSize: '20px', color: classColor(depA.classificacaoTransparenciaBR) }}>
                {depA.scoreFinalTransparenciaBR != null ? depA.scoreFinalTransparenciaBR.toFixed(1) : '-'}
              </div>
              <span style={{ color: classColor(depA.classificacaoTransparenciaBR), fontWeight: '600', fontSize: '12px' }}>{depA.classificacaoTransparenciaBR || '-'}</span>
            </div>
            <div style={{ padding: '20px', textAlign: 'center' }}>
              {depB.fotoUrl && <img src={depB.fotoUrl} alt={depB.nome} onError={e => { e.target.src = '/placeholder-avatar.png'; }} style={{ width: '44px', height: '44px', borderRadius: '50%', marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />}
              <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>{depB.nome}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{depB.partido}-{depB.uf}</div>
              <div style={{ marginTop: '6px', fontWeight: '700', fontSize: '20px', color: classColor(depB.classificacaoTransparenciaBR) }}>
                {depB.scoreFinalTransparenciaBR != null ? depB.scoreFinalTransparenciaBR.toFixed(1) : '-'}
              </div>
              <span style={{ color: classColor(depB.classificacaoTransparenciaBR), fontWeight: '600', fontSize: '12px' }}>{depB.classificacaoTransparenciaBR || '-'}</span>
            </div>
          </div>

          {/* Tabela pilares */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <tbody>
              <PilarRow label="Score Final" valA={depA.scoreFinalTransparenciaBR} valB={depB.scoreFinalTransparenciaBR} />
              <PilarRow label="Economia" valA={depA.economiaScore} valB={depB.economiaScore} />
              <PilarRow label="Presenca" valA={depA.presencaScore} valB={depB.presencaScore} />
              <PilarRow label="Proposicoes" valA={depA.proposicoesScore} valB={depB.proposicoesScore} />
              <PilarRow label="Defesas Plenario" valA={depA.defesasPlenarioScore} valB={depB.defesasPlenarioScore} />
              <PilarRow label="Processos" valA={depA.processosScore} valB={depB.processosScore} />
            </tbody>
          </table>

          {/* Links */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '16px' }}>
            <Link to={`/politico/${depA.idCamara}`} style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: '8px', background: 'var(--accent-green)', color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: '13px' }}>Ver dossie completo</Link>
            <Link to={`/politico/${depB.idCamara}`} style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: '8px', background: 'var(--accent-green)', color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: '13px' }}>Ver dossie completo</Link>
          </div>
        </div>
      )}

      {(!depA || !depB) && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '14px' }}>
          Selecione dois deputados acima para comparar seus indicadores.
        </div>
      )}
    </div>
  );
}
