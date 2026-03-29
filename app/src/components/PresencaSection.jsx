import React, { useMemo, useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtPct(v) { return `${toNum(v).toFixed(1).replace('.', ',')}%`; }
function fmtNum(v) { return new Intl.NumberFormat('pt-BR').format(toNum(v)); }

const BADGE_STYLES = {
  Excelente: { background: '#d1fae5', color: '#047857', border: '1px solid #a7f3d0' },
  Bom: { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' },
  Regular: { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' },
  Ruim: { background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3' },
};

const BAR_COLORS = ['#059669', '#0284c7', '#4f46e5'];

function GaugeBar({ pct, label, colorIdx }) {
  const color = BAR_COLORS[colorIdx] || BAR_COLORS[0];
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
        <span style={{ fontWeight: 500, color: '#334155' }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{fmtPct(pct)}</span>
      </div>
      <div style={{ height: 12, width: '100%', borderRadius: 9999, background: '#f1f5f9', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 9999, background: color, width: `${Math.min(toNum(pct), 100)}%`, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

function StatCard({ value, label, color }) {
  return (
    <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 16, textAlign: 'center', flex: '1 1 0' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function PresencaSection({ politico, colecao, politicoId }) {
  const pol = politico || {};
  const [presencas, setPresencas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(null);

  const overallPct = toNum(pol.presencaPct);
  const plenarioPct = toNum(pol.presencaPlenarioPct);
  const comissoesPct = toNum(pol.presencaComissoesPct);
  const classificacao = pol.presencaClassificacao || '';
  const sessoesPresente = toNum(pol.sessoesPresente);
  const sessoesTotal = toNum(pol.sessoesTotal || pol.totalSessions);
  const totalEventos = toNum(pol.totalEventos);
  const totalProposicoes = toNum(pol.totalProposicoes);
  const hasData = overallPct > 0 || sessoesPresente > 0 || sessoesTotal > 0;

  useEffect(() => {
    if (!colecao || !politicoId) return;
    setLoading(true);
    getDocs(collection(db, colecao, politicoId, 'presencas'))
      .then(snap => setPresencas(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [colecao, politicoId]);

  const yearly = useMemo(() => {
    const map = {};
    presencas.forEach(p => {
      const date = p.data || p.date || '';
      const year = date.substring(0, 4);
      if (!year || year.length < 4) return;
      if (!map[year]) map[year] = { total: 0, presente: 0, ausente: 0, justificada: 0 };
      map[year].total++;
      const pres = (p.presenca || p.frequencia || '').toLowerCase();
      if (pres.includes('presente') || pres.includes('presen')) map[year].presente++;
      else if (pres.includes('justificad')) map[year].justificada++;
      else map[year].ausente++;
    });
    return map;
  }, [presencas]);

  const yearKeys = Object.keys(yearly).sort();

  const sectionStyle = { borderRadius: 24, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };

  if (!hasData && yearKeys.length === 0) {
    return (
      <section style={sectionStyle}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Presenca parlamentar</h2>
        <div style={{ marginTop: 16, borderRadius: 16, border: '2px dashed #cbd5e1', background: '#fff', padding: 24, fontSize: 14, color: '#64748b' }}>
          Ainda nao ha dados de presenca disponiveis para este parlamentar.
        </div>
      </section>
    );
  }

  const detail = selectedYear ? yearly[selectedYear] : null;

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Presenca parlamentar no mandato</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: '#475569', lineHeight: 1.6 }}>Dados consolidados de presenca em plenario, comissoes e atividade legislativa.</p>
        </div>
        {classificacao && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ ...BADGE_STYLES[classificacao] || { background: '#f1f5f9', color: '#475569' }, borderRadius: 9999, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>{classificacao}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a' }}>{fmtPct(overallPct)}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>presenca geral</div>
            </div>
          </div>
        )}
      </div>

      {hasData && (
        <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 16, marginBottom: 24 }}>
          {overallPct > 0 && <GaugeBar pct={overallPct} label="Presenca Geral" colorIdx={0} />}
          {plenarioPct > 0 && <GaugeBar pct={plenarioPct} label="Plenario" colorIdx={1} />}
          {comissoesPct > 0 && <GaugeBar pct={comissoesPct} label="Comissoes" colorIdx={2} />}
        </div>
      )}

      {(sessoesPresente > 0 || sessoesTotal > 0 || totalEventos > 0 || totalProposicoes > 0) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          {sessoesPresente > 0 && <StatCard value={fmtNum(sessoesPresente)} label="Sessoes presente" color="#059669" />}
          {sessoesTotal > 0 && <StatCard value={fmtNum(sessoesTotal)} label="Total sessoes" color="#334155" />}
          {totalEventos > 0 && <StatCard value={fmtNum(totalEventos)} label="Eventos" color="#0284c7" />}
          {totalProposicoes > 0 && <StatCard value={fmtNum(totalProposicoes)} label="Proposicoes" color="#4f46e5" />}
        </div>
      )}

      {loading && <div style={{ marginBottom: 16, fontSize: 14, color: '#64748b' }}>Carregando sessoes detalhadas...</div>}

      {yearKeys.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>Presenca por ano (sessoes detalhadas)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {yearKeys.map(yr => {
              const d = yearly[yr];
              const pct = d.total > 0 ? (d.presente / d.total) * 100 : 0;
              const isSelected = selectedYear === yr;
              return (
                <button key={yr} type="button" onClick={() => setSelectedYear(isSelected ? null : yr)}
                  style={{ borderRadius: 16, border: isSelected ? '2px solid #34d399' : '1px solid #e2e8f0', background: isSelected ? '#ecfdf5' : '#fff', padding: 16, textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.1)' : 'none' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b' }}>{yr}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{fmtPct(pct)}</div>
                  <div style={{ height: 8, width: '100%', borderRadius: 9999, background: '#f1f5f9', overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ height: '100%', borderRadius: 9999, background: '#059669', width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginTop: 8 }}>
                    <span>{d.presente} presentes</span>
                    <span>{d.total - d.presente} ausencias</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {detail && (
        <div style={{ marginTop: 16, borderRadius: 16, border: '1px solid #a7f3d0', background: '#ecfdf5', padding: 20 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: '#065f46' }}>Detalhes {selectedYear}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, textAlign: 'center' }}>
            <div><div style={{ fontSize: 20, fontWeight: 700, color: '#047857' }}>{detail.presente}</div><div style={{ fontSize: 12, color: '#059669' }}>Presentes</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>{detail.justificada}</div><div style={{ fontSize: 12, color: '#f59e0b' }}>Justificadas</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700, color: '#e11d48' }}>{detail.ausente}</div><div style={{ fontSize: 12, color: '#f43f5e' }}>Ausencias</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700, color: '#334155' }}>{detail.total}</div><div style={{ fontSize: 12, color: '#64748b' }}>Total</div></div>
          </div>
          <div style={{ marginTop: 12, height: 12, width: '100%', borderRadius: 9999, background: '#fecdd3', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 9999, background: '#059669', width: `${detail.total > 0 ? (detail.presente / detail.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 12, color: '#94a3b8' }}>Fonte: Dados publicos da Camara dos Deputados. Atualizado automaticamente.</p>
    </section>
  );
}
