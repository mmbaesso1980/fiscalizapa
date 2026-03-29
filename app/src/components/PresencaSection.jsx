import React, { useMemo, useState } from 'react';

const formatPercent = (v) => {
  const n = Number(v || 0);
  return `${n.toFixed(1).replace('.', ',')}%`;
};

const COLORS = {
  green: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  sky: { bar: 'bg-sky-500', dot: 'bg-sky-500', text: 'text-sky-600' },
  amber: { bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-600' },
  rose: { bar: 'bg-rose-500', dot: 'bg-rose-500', text: 'text-rose-600' },
  indigo: { bar: 'bg-indigo-500', dot: 'bg-indigo-500', text: 'text-indigo-600' },
};

const ClassBadge = ({ cls }) => {
  const map = {
    Excelente: 'bg-emerald-100 text-emerald-700',
    Bom: 'bg-sky-100 text-sky-700',
    Regular: 'bg-amber-100 text-amber-700',
    Ruim: 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${map[cls] || 'bg-slate-100 text-slate-600'}`}>
      {cls || 'N/A'}
    </span>
  );
};

const GaugeBar = ({ pct, color, label }) => (
  <div className="mb-4">
    <div className="mb-1 flex items-center justify-between text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <span className={`font-bold ${color.text}`}>{formatPercent(pct)}</span>
    </div>
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color.bar} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  </div>
);

const YearCard = ({ year, data, onClick, active }) => {
  const pct = Number(data?.pct || 0);
  const presentes = Number(data?.presentes || 0);
  const total = Number(data?.total || 0);
  const ausentes = total - presentes;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? 'border-emerald-400 bg-emerald-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{year}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{formatPercent(pct)}</div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{presentes} presente{presentes !== 1 ? 's' : ''}</span>
        <span>{ausentes} ausencia{ausentes !== 1 ? 's' : ''}</span>
      </div>
    </button>
  );
};

export default function PresencaSection(props) {
  const pol = props?.politico || props?.data || props || {};
  const [selectedYear, setSelectedYear] = useState(null);

  const years = useMemo(() => {
    const y = {};
    ['2023', '2024', '2025', '2026', '2027', '2028'].forEach((yr) => {
      if (pol[yr] && typeof pol[yr] === 'object' && (pol[yr].total > 0 || pol[yr].presentes > 0)) {
        y[yr] = pol[yr];
      }
    });
    return y;
  }, [pol]);

  const yearKeys = Object.keys(years).sort();

  const overallPct = Number(pol.presencaPct || 0);
  const plenarioPct = Number(pol.presencaPlenarioPct || 0);
  const comissoesPct = Number(pol.presencaComissoesPct || 0);
  const classificacao = pol.presencaClassificacao || '';
  const sessoesPresente = Number(pol.sessoesPresente || 0);
  const sessoesTotal = Number(pol.sessoesTotal || pol.totalSessions || 0);
  const totalEventos = Number(pol.totalEventos || 0);
  const totalProposicoes = Number(pol.totalProposicoes || 0);
  const proposicoesRelevantes = Number(pol.totalProposicoesRelevantes || 0);

  const hasData = overallPct > 0 || yearKeys.length > 0 || sessoesPresente > 0;

  if (!hasData) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-bold text-slate-900">Presenca parlamentar</h2>
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          Ainda nao ha dados de presenca disponivel para este parlamentar.
        </div>
      </section>
    );
  }

  const detail = selectedYear ? years[selectedYear] : null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Presenca parlamentar no mandato
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Dados consolidados de presenca em plenario, comissoes e atividade legislativa.
          </p>
        </div>
        {classificacao && (
          <div className="flex items-center gap-3">
            <ClassBadge cls={classificacao} />
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">{formatPercent(overallPct)}</div>
              <div className="text-xs text-slate-500">presenca geral</div>
            </div>
          </div>
        )}
      </div>

      {/* Overview gauges */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
        <GaugeBar pct={overallPct} color={COLORS.green} label="Presenca Geral" />
        {plenarioPct > 0 && <GaugeBar pct={plenarioPct} color={COLORS.sky} label="Plenario" />}
        {comissoesPct > 0 && <GaugeBar pct={comissoesPct} color={COLORS.indigo} label="Comissoes" />}
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {sessoesPresente > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{sessoesPresente}</div>
            <div className="text-xs text-slate-500">Sessoes presente</div>
          </div>
        )}
        {sessoesTotal > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-slate-700">{sessoesTotal}</div>
            <div className="text-xs text-slate-500">Total sessoes</div>
          </div>
        )}
        {totalEventos > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-sky-600">{totalEventos}</div>
            <div className="text-xs text-slate-500">Eventos</div>
          </div>
        )}
        {totalProposicoes > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">{totalProposicoes}</div>
            <div className="text-xs text-slate-500">Proposicoes</div>
          </div>
        )}
      </div>

      {/* Yearly breakdown */}
      {yearKeys.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Presenca por ano</h3>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {yearKeys.map((yr) => (
              <YearCard
                key={yr}
                year={yr}
                data={years[yr]}
                active={selectedYear === yr}
                onClick={() => setSelectedYear(selectedYear === yr ? null : yr)}
              />
            ))}
          </div>
        </>
      )}

      {/* Year detail drill-down */}
      {detail && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h4 className="mb-3 text-sm font-semibold text-emerald-800">Detalhes {selectedYear}</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-emerald-700">{Number(detail.presentes || 0)}</div>
              <div className="text-xs text-emerald-600">Presentes</div>
            </div>
            <div>
              <div className="text-xl font-bold text-rose-600">{Number(detail.total || 0) - Number(detail.presentes || 0)}</div>
              <div className="text-xs text-rose-500">Ausencias</div>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-700">{Number(detail.total || 0)}</div>
              <div className="text-xs text-slate-500">Total</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-rose-200">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Number(detail.pct || 0)}%` }} />
            </div>
            <div className="mt-1 text-center text-sm font-semibold text-emerald-700">{formatPercent(detail.pct)}</div>
          </div>
        </div>
      )}

      {/* Activity summary */}
      {(totalProposicoes > 0 || proposicoesRelevantes > 0) && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Atividade legislativa</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-lg font-bold text-indigo-600">{totalProposicoes}</div>
              <div className="text-xs text-slate-500">Proposicoes totais</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-600">{proposicoesRelevantes}</div>
              <div className="text-xs text-slate-500">Proposicoes relevantes</div>
            </div>
          </div>
          {totalProposicoes > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Relevancia</span>
                <span>{formatPercent((proposicoesRelevantes / totalProposicoes) * 100)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(proposicoesRelevantes / totalProposicoes) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Fonte: Dados publicos da Camara dos Deputados. Atualizado automaticamente.
      </p>
    </section>
  );
}
