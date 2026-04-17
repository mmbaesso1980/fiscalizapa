import { useState, useMemo } from "react";

const COLORS = [
  "#3d6b5e", "#c9a84c", "#c4724e", "#5a9e8f", "#b54a4a",
  "#e8d48b", "#8a8a9e", "#6b8f71", "#d4a574", "#7a6b5e"
];

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(value);
}

function BarChart({ data, labelKey, valueKey, title }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0));

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
      padding: '20px', border: '1px solid var(--border-light)', marginBottom: '16px'
    }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.map((item, i) => {
          const val = item[valueKey] || 0;
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', width: '140px', textAlign: 'right', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {item[labelKey]}
              </span>
              <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '12px', height: '22px', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '12px',
                  width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length],
                  transition: 'width 0.5s ease'
                }} />
              </div>
              <span style={{ fontSize: '11px', fontFamily: 'Space Grotesk', fontWeight: 600, width: '100px', textAlign: 'right', color: 'var(--text-primary)', flexShrink: 0 }}>
                {formatCurrency(val)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DonutChart({ data, labelKey, valueKey, title }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0);
  let cumulative = 0;
  const segments = data.map((d, i) => {
    const pct = total > 0 ? ((d[valueKey] || 0) / total) * 100 : 0;
    const start = cumulative;
    cumulative += pct;
    return { ...d, pct, start, color: COLORS[i % COLORS.length] };
  });

  const gradient = segments
    .map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(", ");

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
      padding: '20px', border: '1px solid var(--border-light)', marginBottom: '16px'
    }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{
          width: '160px', height: '160px', borderRadius: '50%', flexShrink: 0,
          background: `conic-gradient(${gradient})`, position: 'relative'
        }}>
          <div style={{
            position: 'absolute', inset: '24px', background: 'var(--bg-card)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--text-primary)', textAlign: 'center' }}>
              {formatCurrency(total)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {segments.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0, backgroundColor: s.color }} />
              <span style={{ color: 'var(--text-secondary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s[labelKey]}</span>
              <span style={{ fontFamily: 'Space Grotesk', fontWeight: 600, color: 'var(--text-primary)' }}>{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GastosChart({ gastos = [] }) {
  const [view, setView] = useState("categoria");

  const { categoriaData, mensalData, fornecedorData, totalGeral } = useMemo(() => {
    const byCategoria = {};
    gastos.forEach(d => {
      const cat = d.tipoDespesa || d.tipo || d.descricao || d.categoria || "Outros";
      byCategoria[cat] = (byCategoria[cat] || 0) + (d.valorLiquido || d.valor || d.valorDocumento || 0);
    });
    const categoriaData = Object.entries(byCategoria)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const byMes = {};
    gastos.forEach(d => {
      const mes = d.mes ? `${d.ano || ""}-${String(d.mes).padStart(2, "0")}` : "N/A";
      byMes[mes] = (byMes[mes] || 0) + (d.valorLiquido || d.valor || d.valorDocumento || 0);
    });
    const mensalData = Object.entries(byMes)
      .map(([mes, total]) => ({ mes, total }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12);

    const byFornecedor = {};
    gastos.forEach(d => {
      const f = d.fornecedorNome || d.nomeFornecedor || d.fornecedor || "N/I";
      byFornecedor[f] = (byFornecedor[f] || 0) + (d.valorLiquido || d.valor || d.valorDocumento || 0);
    });
    const fornecedorData = Object.entries(byFornecedor)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const totalGeral = gastos.reduce((s, d) => s + (d.valorLiquido || d.valor || d.valorDocumento || 0), 0);

    return { categoriaData, mensalData, fornecedorData, totalGeral };
  }, [gastos]);

  if (gastos.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
        padding: '40px', textAlign: 'center', color: 'var(--text-muted)'
      }}>
        Nenhuma despesa encontrada para este politico.
      </div>
    );
  }

  const viewButtons = [
    { key: "categoria", label: "Categoria" },
    { key: "mensal", label: "Mensal" },
    { key: "fornecedor", label: "Fornecedor" },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Analise de Gastos</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Total: {formatCurrency(totalGeral)} em {gastos.length} despesas
          </p>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {viewButtons.map(v => (
            <button key={v.key} onClick={() => setView(v.key)} style={{
              padding: '6px 14px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
              border: view === v.key ? '1px solid var(--accent-green)' : '1px solid var(--border-light)',
              background: view === v.key ? 'var(--accent-green)' : 'var(--bg-card)',
              color: view === v.key ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.2s'
            }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "categoria" && (
        <>
          <DonutChart data={categoriaData} labelKey="nome" valueKey="total" title="Gastos por Categoria" />
          <BarChart data={categoriaData} labelKey="nome" valueKey="total" title="Detalhamento por Categoria" />
        </>
      )}

      {view === "mensal" && (
        <BarChart data={mensalData} labelKey="mes" valueKey="total" title="Evolucao Mensal de Gastos" />
      )}

      {view === "fornecedor" && (
        <BarChart data={fornecedorData} labelKey="nome" valueKey="total" title="Top 10 Fornecedores" />
      )}
    </div>
  );
}
