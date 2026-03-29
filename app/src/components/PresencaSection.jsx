import React, { useMemo, useState } from 'react';

const formatNumber = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat('pt-BR').format(num);
};

const formatPercent = (value) => {
  const num = Number(value || 0);
  return `${num.toFixed(1).replace('.', ',')}%`;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const PresencaBar = ({ items }) => {
  const total = items.reduce((acc, item) => acc + item.total, 0);

  if (!total) {
    return (
      <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Ainda não há dados suficientes para consolidar a presença parlamentar neste período.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
        {items.map((item) => (
          <div
            key={item.key}
            className={item.color}
            style={{ width: `${item.percent}%` }}
            title={`${item.label}: ${formatPercent(item.percent)} (${formatNumber(item.total)})`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${item.dotColor}`} />
              <span className="text-sm font-medium text-slate-700">{item.label}</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900">{formatPercent(item.percent)}</div>
              <div className="text-xs text-slate-500">{formatNumber(item.total)} registros</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const SummaryCard = ({ item }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${item.dotColor}`} />
      <h4 className="text-sm font-semibold text-slate-900">{item.label}</h4>
    </div>

    <div className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
      {formatPercent(item.percent)}
    </div>

    <div className="mb-3 text-sm text-slate-500">
      {formatNumber(item.total)} registros
    </div>

    <p className="text-sm leading-6 text-slate-600">{item.description}</p>
  </div>
);

export default function PresencaSection(props) {
  const [expanded, setExpanded] = useState(false);

  const raw =
    props?.presenca ||
    props?.presencaData ||
    props?.data?.presenca ||
    props?.data ||
    props?.politico?.presenca ||
    props?.politico ||
    {};

  const consolidated = useMemo(() => {
    const plenarioPresenca =
      toNumber(raw?.plenario_presenca) ||
      toNumber(raw?.presencas_plenario) ||
      toNumber(raw?.presencaPlenario) ||
      toNumber(raw?.presencas?.plenario) ||
      toNumber(raw?.plenario?.presenca) ||
      toNumber(raw?.plenario?.presentes);

    const comissoesPresenca =
      toNumber(raw?.comissoes_presenca) ||
      toNumber(raw?.presencas_comissoes) ||
      toNumber(raw?.presencaComissoes) ||
      toNumber(raw?.presencas?.comissoes) ||
      toNumber(raw?.comissoes?.presenca) ||
      toNumber(raw?.comissoes?.presentes);

    const ausenciasJustificadas =
      toNumber(raw?.ausencias_justificadas) ||
      toNumber(raw?.faltas_justificadas) ||
      toNumber(raw?.ausenciasJustificadas) ||
      toNumber(raw?.ausencias?.justificadas);

    const ausenciasNaoJustificadas =
      toNumber(raw?.ausencias_nao_justificadas) ||
      toNumber(raw?.faltas_nao_justificadas) ||
      toNumber(raw?.ausenciasNaoJustificadas) ||
      toNumber(raw?.ausencias?.nao_justificadas) ||
      toNumber(raw?.ausencias?.naoJustificadas);

    const items = [
      {
        key: 'plenario',
        label: 'Plenário',
        total: plenarioPresenca,
        description: 'Comparecimentos registrados em sessões plenárias.',
        color: 'bg-emerald-500',
        dotColor: 'bg-emerald-500',
      },
      {
        key: 'comissoes',
        label: 'Comissões',
        total: comissoesPresenca,
        description: 'Comparecimentos registrados em reuniões e colegiados de comissões.',
        color: 'bg-sky-500',
        dotColor: 'bg-sky-500',
      },
      {
        key: 'ausencias_justificadas',
        label: 'Ausências justificadas',
        total: ausenciasJustificadas,
        description: 'Faltas com justificativa pública, quando informadas pela fonte oficial.',
        color: 'bg-amber-400',
        dotColor: 'bg-amber-400',
      },
      {
        key: 'ausencias_nao_justificadas',
        label: 'Ausências não justificadas',
        total: ausenciasNaoJustificadas,
        description: 'Faltas sem justificativa pública, quando informadas pela fonte oficial.',
        color: 'bg-rose-500',
        dotColor: 'bg-rose-500',
      },
    ].filter((item) => item.total > 0);

    const total = items.reduce((acc, item) => acc + item.total, 0);

    const itemsWithPercent = items.map((item) => ({
      ...item,
      percent: total > 0 ? (item.total / total) * 100 : 0,
    }));

    return {
      total,
      items: itemsWithPercent,
      hasData: total > 0,
    };
  }, [raw]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Presença parlamentar no mandato
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            Consolidação dos registros públicos de presença do parlamentar em plenário e comissões,
            com distinção entre comparecimento e ausências quando disponível.
          </p>
        </div>

        {consolidated.hasData && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total consolidado
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {formatNumber(consolidated.total)}
            </div>
            <div className="text-xs text-slate-500">registros públicos</div>
          </div>
        )}
      </div>

      <div className="mb-6">
        <PresencaBar items={consolidated.items} />
      </div>

      {consolidated.hasData ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {consolidated.items.map((item) => (
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
              <h3 className="text-base font-semibold text-slate-900">Detalhamento da consolidação</h3>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-12 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div className="col-span-5 sm:col-span-6">Grupo</div>
                  <div className="col-span-3 text-right">Registros</div>
                  <div className="col-span-4 sm:col-span-3 text-right">Participação</div>
                </div>

                <div className="divide-y divide-slate-200">
                  {consolidated.items.map((item) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-12 items-start px-4 py-4 text-sm text-slate-700"
                    >
                      <div className="col-span-5 pr-3 sm:col-span-6">
                        <div className="flex items-center gap-2 font-medium text-slate-900">
                          <span className={`h-3 w-3 rounded-full ${item.dotColor}`} />
                          {item.label}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
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
