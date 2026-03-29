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

const BADGE = {
  Excelente: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Bom: 'bg-sky-100 text-sky-700 border-sky-200',
  Regular: 'bg-amber-100 text-amber-700 border-amber-200',
  Ruim: 'bg-rose-100 text-rose-700 border-rose-200',
};

function GaugeBar({ pct, label, color }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={`font-bold ${color}`}>{fmtPct(pct)}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all`}
          style={{ width: `${Math.min(toNum(pct), 100)}%`, backgroundColor: color === 'text-emerald-600' ? '#059669' : color === 'text-sky-600' ? '#0284c7' : color === 'text-indigo-600' ? '#4f46e5' : '#059669' }} />
      </div>
    </div>
  );
}

export default function PresencaSection({ politico, colecao, politicoId }) {
  const pol = politico || {};
  const [presencas, setPresencas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(null);
  const [expanded, setExpanded] = useState(false);

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
      .then(snap => {
        setPresencas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
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
      if (pres.includes('presente') || pres.includes('presença')) map[year].presente++;
      else if (pres.includes('justificad')) map[year].justificada++;
      else map[year].ausente++;
    });
    return map;
  }, [presencas]);

  const yearKeys = Object.keys(yearly).sort();

  if (!hasData && yearKeys.length === 0) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-bold text-slate-900">Presenca parlamentar</h2>
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          Ainda nao ha dados de presenca disponiveis para este parlamentar.
        </div>
      </section>
    );
  }

  const detail = selectedYear ? yearly[selectedYear] : null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Presenca parlamentar no mandato</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Dados consolidados de presenca em plenario, comissoes e atividade legislativa.</p>
        </div>
        {classificacao && (
          <div className="flex items-center gap-3">
            <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${BADGE[classificacao] || 'bg-slate-100 text-slate-600'}`}>{classificacao}</span>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">{fmtPct(overallPct)}</div>
              <div className="text-xs text-slate-500">presenca geral</div>
            </div>
          </div>
        )}
      </div>

      {hasData && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
          {overallPct > 0 && <GaugeBar pct={overallPct} label="Presenca Geral" color="text-emerald-600" />}
          {plenarioPct > 0 && <GaugeBar pct={plenarioPct} label="Plenario" color="text-sky-600" />}
          {comissoesPct > 0 && <GaugeBar pct={comissoesPct} label="Comissoes" color="text-indigo-600" />}
        </div>
      )}

      {(sessoesPresente > 0 || sessoesTotal > 0 || totalEventos > 0 || totalProposicoes > 0) && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sessoesPresente > 0 && (<div className="rounded-2xl border border-slate-200 bg-white p-4 text-center"><div className="text-2xl font-bold text-emerald-600">{fmtNum(sessoesPresente)}</div><div className="text-xs text-slate-500">Sessoes presente</div></div>)}
          {sessoesTotal > 0 && (<div className="rounded-2xl border border-slate-200 bg-white p-4 text-center"><div className="text-2xl font-bold text-slate-700">{fmtNum(sessoesTotal)}</div><div className="text-xs text-slate-500">Total sessoes</div></div>)}
          {totalEventos > 0 && (<div className="rounded-2xl border border-slate-200 bg-white p-4 text-center"><div className="text-2xl font-bold text-sky-600">{fmtNum(totalEventos)}</div><div className="text-xs text-slate-500">Eventos</div></div>)}
          {totalProposicoes > 0 && (<div className="rounded-2xl border border-slate-200 bg-white p-4 text-center"><div className="text-2xl font-bold text-indigo-600">{fmtNum(totalProposicoes)}</div><div className="text-xs text-slate-500">Proposicoes</div></div>)}
        </div>
      )}

      {loading && <div className="mb-4 text-sm text-slate-500">Carregando sessoes detalhadas...</div>}

      {yearKeys.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Presenca por ano (sessoes detalhadas)</h3>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {yearKeys.map(yr => {
              const d = yearly[yr];
              const pct = d.total > 0 ? (d.presente / d.total) * 100 : 0;
              return (
                <button key={yr} type="button" onClick={() => setSelectedYear(selectedYear === yr ? null : yr)}
                  className={`rounded-2xl border p-4 text-left transition ${selectedYear === yr ? 'border-emerald-400 bg-emerald-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{yr}</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{fmtPct(pct)}</div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-slate-500">
                    <span>{d.presente} presente{d.presente !== 1 ? 's' : ''}</span>
                    <span>{d.total - d.presente} ausencia{(d.total - d.presente) !== 1 ? 's' : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {detail && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h4 className="mb-3 text-sm font-semibold text-emerald-800">Detalhes {selectedYear}</h4>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div><div className="text-xl font-bold text-emerald-700">{detail.presente}</div><div className="text-xs text-emerald-600">Presentes</div></div>
            <div><div className="text-xl font-bold text-amber-600">{detail.justificada}</div><div className="text-xs text-amber-500">Justificadas</div></div>
            <div><div className="text-xl font-bold text-rose-600">{detail.ausente}</div><div className="text-xs text-rose-500">Ausencias</div></div>
            <div><div className="text-xl font-bold text-slate-700">{detail.total}</div><div className="text-xs text-slate-500">Total</div></div>
          </div>
          <div className="mt-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-rose-200">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${detail.total > 0 ? (detail.presente / detail.total) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">Fonte: Dados publicos da Camara dos Deputados. Atualizado automaticamente.</p>
    </section>
  );
}
