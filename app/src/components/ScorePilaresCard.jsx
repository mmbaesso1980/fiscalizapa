/**
 * ScorePilaresCard.jsx
 * Bloco 4 - Score consolidado TransparenciaBR (5 pilares)
 * Le campos do Firestore: economiaScore, presencaScore, proposicoesScore,
 * defesasPlenarioScore, processosScore, scoreFinalTransparenciaBR,
 * classificacaoTransparenciaBR
 */

function classColor(cls) {
  if (!cls) return 'var(--text-muted)';
  const c = cls.toUpperCase();
  if (c === 'A' || c === 'B') return 'var(--accent-green)';
  if (c === 'C') return 'var(--accent-gold)';
  return 'var(--accent-red)';
}

function PilarBar({ label, value, max = 10 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-gold)' : 'var(--accent-red)';
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color }}>{value != null ? value.toFixed(1) : '-'}/{max}</span>
      </div>
      <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '4px', background: color, width: `${pct}%`, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

export default function ScorePilaresCard({ pol }) {
  const score = pol.scoreFinalTransparenciaBR;
  const cls = pol.classificacaoTransparenciaBR;
  if (score == null && !cls) return null;

  const pilares = [
    { label: 'Economia (CEAP)', value: pol.economiaScore },
    { label: 'Presenca em votacoes', value: pol.presencaScore },
    { label: 'Producao legislativa', value: pol.proposicoesScore },
    { label: 'Defesas em plenario', value: pol.defesasPlenarioScore },
    { label: 'Processos judiciais', value: pol.processosScore },
  ];

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '20px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Indice TransparenciaBR</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Score consolidado baseado em 5 pilares de atuacao parlamentar</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '36px', fontWeight: 800, fontFamily: 'Space Grotesk', color: classColor(cls), margin: 0, lineHeight: 1 }}>
            {score != null ? score.toFixed(1) : '-'}
          </p>
          <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, background: classColor(cls) + '22', color: classColor(cls) }}>
            Classe {cls || '?'}
          </span>
        </div>
      </div>
      {pilares.map((p, i) => (
        <PilarBar key={i} label={p.label} value={p.value} />
      ))}
      <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '12px', fontStyle: 'italic' }}>
        Metodologia: normalizacao por Kim (0-10 cada pilar). Score final = media ponderada. Dados: Camara dos Deputados + TSE.
      </p>
    </div>
  );
}
