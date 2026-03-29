import React, { useMemo, useState } from 'react';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(toNumber(value));
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(1).replace('.', ',')}%`;
}

function pickNumber(...values) {
  for (const value of values) {
    const num = toNumber(value);
    if (num > 0) return num;
  }
  return 0;
}

function getNested(obj, path) {
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function resolveMetric(source, possiblePaths) {
  for (const path of possiblePaths) {
    const value = getNested(source, path);
    const num = toNumber(value);
    if (num > 0) return num;
  }
  return 0;
}

function PresenceStackBar({ items }) {
  const total = items.reduce((acc, item) => acc + item.total, 0);

  if (!total) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm leading-6 text-slate-500">
        Ainda não há dados suficientes para consolidar a presença parlamentar neste período.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
        {items.map((item) => (
          <div
            key={item.key}
            className={`h-full ${item.barColor} inline-block`}
            style={{ width: `${item.percent}%` }}
            title={`${item.label}: ${formatPercent(item.percent)} (${formatNumber(item.total)} registros)`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <div
            key={item.key}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${item.dotColor}`} />
            <span>{item.label}</span>
            <span className="text-slate-400">•</span>
            <span>{formatPercent(item.percent)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ item }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${item.dotColor}`} />
        <h3 className="text-sm font-semibold text-slate-900">{item.label}</h3>
      </div>

      <div className="text-2xl font-bold tracking-tight text-slate-900">
        {formatPercent(item.percent)}
      </div>

      <div className="mt-1 text-sm text-slate-500">
        {formatNumber(item.total)} registros
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        {item.description}
      </p>
    </div>
  );
}

export default function PresencaSection(props) {
  const [expanded, setExpanded] = useState(false);

  const source =
    props?.presenca ||
    props?.presencaData ||
    props?.data?.presenca ||
    props?.data ||
    props?.politico?.presenca ||
    props?.politico ||
    props ||
    {};

  const summary = useMemo(() => {
    const plenario = pickNumber(
      resolveMetric(source, [
        'plenario_presenca',
        'presenca_plenario',
        'presencas_plenario',
        'presencaPlenario',
        'plenario.presenca',
        'plenario.presentes',
        'presencas.plenario',
      ])
    );

    const comissoes = pickNumber(
      resolveMetric(source, [
        'comissoes_presenca',
        'presenca_comissoes',
        'presencas_comissoes',
        'presencaComissoes',
        'comissoes.presenca',
        'comissoes.presentes',
        'presencas.comissoes',
      ])
    );

    const ausenciasJustificadas = pickNumber(
      resolveMetric(source, [
        'ausencias_justificadas',
        'faltas_justificadas',
        'ausenciasJustificadas',
        'ausencias.justificadas',
      ])
    );

    const ausenciasNaoJustificadas = pickNumber(
      resolveMetric(source, [
        'ausencias_nao_justificadas',
        'faltas_nao_justificadas',
        'ausenciasNaoJustificadas',
        'ausencias.nao_justificadas',
        'ausencias.naoJustificadas',
      ])
    );

    const rawItems = [
      {
        key: 'plenario',
        label: 'Plenário',
        total: plenario,
        description: 'Comparecimentos registrados em sessões plenárias.',
        dotColor: 'bg-emerald-500',
        barColor: 'bg-emerald-500',
      },
      {
        key: 'comissoes',
        label: 'Comissões',
        total: comissoes,
        description: 'Comparecimentos registrados em reuniões e colegiados de comissões.',
        dotColor: 'bg-sky-500',
        barColor: 'bg-sky-500',
      },
      {
        key: 'ausencias_justificadas',
        label: 'Ausências justificadas',
        total: ausenciasJustificadas,
        description: 'Faltas com justificativa pública, quando informadas pela fonte oficial.',
        dotColor: 'bg-amber-400',
        barColor: 'bg-amber-400',
      },
      {
        key: 'ausencias_nao_justificadas',
        label: 'Ausências não justificadas',
        total: ausenciasNaoJustificadas,
        description: 'Faltas sem justificativa pública, quando informadas pela fonte oficial.',
        dotColor: 'bg-rose-500',
        barColor: 'bg-rose-500',
      },
    ].filter((item) => item.total > 0);

    const total = rawItems.reduce((acc, item) => acc + item.total, 0);

    const items = rawItems.map((item) => ({
      ...item,
      percent: total > 0 ? (item.total / total) * 100 : 0,
    }));

    return {
      total,
      hasData: total > 0,
      items,
    };
  }, [source]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Presença parlamentar no mandato
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            Consolidação dos registros públicos de presença do parlamentar em plenário e comissões,
            com distinção entre comparecimento e ausências quando disponível.
          </p>
        </div>

        {summary.hasData && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total consolidado
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {formatNumber(summary.total)}
            </div>
            <div className="text-xs text-slate-500">registros públicos</div>
          </div>
        )}
      </div>

      <div className="mb-6">
        <PresenceStackBar items={summary.items} />
      </div>

      {summary.hasData ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summary.items.map((item) => (
              <SummaryCard key={item.key} item={item} />
            ))}
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
              <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
            </button>
          </div>

          {expanded && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-base font-semibold text-slate-900">
                Detalhamento da consolidação
              </h3>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-12 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div className="col-span-5 sm:col-span-6">Grupo</div>
                  <div className="col-span-3 text-right">Registros</div>
                  <div className="col-span-4 text-right sm:col-span-3">Participação</div>
                </div>

                <div className="divide-y divide-slate-200">
                  {summary.items.map((item) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-12 items-start px-4 py-4 text-sm text-slate-700"
                    >
                      <div className="col-span-5 pr-3 sm:col-span-6">
                        <div className="flex items-center gap-2 font-medium text-slate-900">
                          <span className={`h-3 w-3 rounded-full ${item.dotColor}`} />
                          {item.label}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {item.description}
                        </p>
                      </div>

                      <div className="col-span-3 text-right font-semibold text-slate-900">
                        {formatNumber(item.total)}
                      </div>

                      <div className="col-span-4 text-right font-semibold text-slate-900 sm:col-span-3">
                        {formatPercent(item.percent)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-slate-500">
                Esta seção consolida apenas registros públicos de presença parlamentar. Quando a
                fonte oficial não distingue certos tipos de ausência ou comparecimento, o grupo
                correspondente pode não aparecer.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm leading-6 text-slate-500">
          Ainda não há dados suficientes para consolidar a presença parlamentar neste período.
        </div>
      )}
    </section>
  );
}
