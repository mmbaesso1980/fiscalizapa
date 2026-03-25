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
        // Read basic info from deputados_federais
        const depSnap = await getDocs(collection(db, "deputados_federais"));
        const depMap = {};
        depSnap.docs.forEach(d => {
          const data = d.data();
          depMap[d.id] = {
            id: d.id,
            nome: data.nome || '',
            partido: data.partido || data.siglaPartido || '',
            uf: data.uf || data.estado || data.siglaUf || '',
            fotoUrl: data.fotoUrl || data.urlFoto || '',
            idCamara: data.idCamara || d.id,
          };
        });

        // Read scores from politicos and merge
        const polSnap = await getDocs(collection(db, "politicos"));
        const list = [];
        polSnap.docs.forEach(d => {
          const scores = d.data();
          const basic = depMap[d.id] || {};
          if (basic.nome) {
            list.push({
              id: d.id,
              nome: basic.nome,
              partido: basic.partido,
              uf: basic.uf,
              fotoUrl: basic.fotoUrl,
              idCamara: basic.idCamara,
              scoreFinalTransparenciaBR: scores.scoreFinalTransparenciaBR,
              scoreBrutoTransparenciaBR: scores.scoreBrutoTransparenciaBR,
              classificacaoTransparenciaBR: scores.classificacaoTransparenciaBR,
              economiaScore: scores.economiaScore,
              presencaScore: scores.presencaScore,
              proposicoesScore: scores.proposicoesScore,
              defesasPlenarioScore: scores.defesasPlenarioScore,
              processosScore: scores.processosScore,
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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
      <div className="loading-spinner" />
      <p style={{ color: 'var(--text-muted)' }}>Carregando deputados...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Comparador de Deputados</h1>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>Compare dois parlamentares lado a lado nos 5 pilares</p>

      {/* Seletores */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Deputado A</label>
          <select value={idA} onChange={e => setIdA(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }}>
            <option value="">Selecione...</option>
            {deputados.map(d => <option key={d.id} value={d.id}>{d.nome} ({d.partido}-{d.uf})</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Deputado B</label>
          <select value={idB} onChange={e => setIdB(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }}>
            <option value="">Selecione...</option>
            {deputados.map(d => <option key={d.id} value={d.id}>{d.nome} ({d.partido}-{d.uf})</option>)}
          </select>
        </div>
      </div>

      {/* Comparacao */}
      {depA && depB && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border-light)' }}>
            <div style={{ flex: 1, padding: '20px', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
              <img src={depA.fotoUrl || '/placeholder-avatar.png'} alt={depA.nome}
                style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 8px' }}
                onError={e => { e.target.src = '/placeholder-avatar.png'; }} />
              <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{depA.nome}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{depA.partido}-{depA.uf}</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'Space Grotesk', color: classColor(depA.classificacaoTransparenciaBR), marginTop: '8px' }}>
                {depA.scoreFinalTransparenciaBR != null ? depA.scoreFinalTransparenciaBR.toFixed(1) : '-'}
              </p>
              <span style={{ padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: classColor(depA.classificacaoTransparenciaBR) + '22', color: classColor(depA.classificacaoTransparenciaBR) }}>
                {depA.classificacaoTransparenciaBR || '-'}
              </span>
            </div>
            <div style={{ flex: 1, padding: '20px', textAlign: 'center' }}>
              <img src={depB.fotoUrl || '/placeholder-avatar.png'} alt={depB.nome}
                style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 8px' }}
                onError={e => { e.target.src = '/placeholder-avatar.png'; }} />
              <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{depB.nome}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{depB.partido}-{depB.uf}</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'Space Grotesk', color: classColor(depB.classificacaoTransparenciaBR), marginTop: '8px' }}>
                {depB.scoreFinalTransparenciaBR != null ? depB.scoreFinalTransparenciaBR.toFixed(1) : '-'}
              </p>
              <span style={{ padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: classColor(depB.classificacaoTransparenciaBR) + '22', color: classColor(depB.classificacaoTransparenciaBR) }}>
                {depB.classificacaoTransparenciaBR || '-'}
              </span>
            </div>
          </div>

          {/* Tabela pilares */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pilar</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{depA.nome.split(' ')[0]}</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{depB.nome.split(' ')[0]}</th>
              </tr>
            </thead>
            <tbody>
              <PilarRow label="Economia (CEAP)" valA={depA.economiaScore} valB={depB.economiaScore} />
              <PilarRow label="Presenca" valA={depA.presencaScore} valB={depB.presencaScore} />
              <PilarRow label="Proposicoes" valA={depA.proposicoesScore} valB={depB.proposicoesScore} />
              <PilarRow label="Defesas Plenario" valA={depA.defesasPlenarioScore} valB={depB.defesasPlenarioScore} />
              <PilarRow label="Processos" valA={depA.processosScore} valB={depB.processosScore} />
            </tbody>
          </table>

          {/* Links */}
          <div style={{ display: 'flex', borderTop: '1px solid var(--border-light)' }}>
            <div style={{ flex: 1, padding: '12px', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
              <Link to={`/politico/deputados_federais/${depA.idCamara || depA.id}`} style={{ color: 'var(--accent-green)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>Ver dossie completo</Link>
            </div>
            <div style={{ flex: 1, padding: '12px', textAlign: 'center' }}>
              <Link to={`/politico/deputados_federais/${depB.idCamara || depB.id}`} style={{ color: 'var(--accent-green)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>Ver dossie completo</Link>
            </div>
          </div>
        </div>
      )}

      {(!depA || !depB) && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
          Selecione dois deputados acima para comparar seus indicadores.
        </p>
      )}
    </div>
  );
}
