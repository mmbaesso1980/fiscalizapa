import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

function fmt(v) {
  if (!v) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

const CRIT_STYLES = {
  ALTA: { background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3' },
  MEDIA: { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' },
  BAIXA: { background: '#d1fae5', color: '#047857', border: '1px solid #a7f3d0' },
};

const card = {
  background: '#ffffff',
  borderRadius: 16,
  border: '1px solid #e8e5de',
  padding: 24,
  marginBottom: 20,
};

const sectionTitle = {
  fontSize: 18,
  fontWeight: 700,
  color: '#1a1a2e',
  marginBottom: 16,
};

export default function EmendaPage() {
  const { id } = useParams();
  const [emenda, setEmenda] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const snap = await getDoc(doc(db, "emendas", id));
      if (snap.exists()) setEmenda({ id: snap.id, ...snap.data() });
      setLoading(false);
    })();
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#fafaf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '2px solid #3d6b5e', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  if (!emenda) return (
    <div style={{ minHeight: '100vh', background: '#fafaf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Emenda não encontrada</h2>
        <p style={{ color: '#8a8a9e', marginBottom: 16 }}>O código informado não corresponde a nenhuma emenda cadastrada.</p>
        <Link to="/dashboard" style={{ color: '#3d6b5e', textDecoration: 'underline' }}>Voltar ao painel</Link>
      </div>
    </div>
  );

  const execRate = emenda.taxaExecucao != null ? Number(emenda.taxaExecucao) : null;
  const critStyle = CRIT_STYLES[emenda.criticidade] || { background: '#f1f5f9', color: '#5a5a6e', border: '1px solid #e2e8f0' };

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf8' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: '#8a8a9e', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link to="/dashboard" style={{ color: '#8a8a9e', textDecoration: 'none' }}>Painel</Link>
          <span>/</span>
          <span style={{ color: '#1a1a2e', fontWeight: 500 }}>Emenda {emenda.codigo}</span>
        </div>

        {/* Header Card */}
        <div style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 4 }}>Emenda {emenda.codigo}</h1>
              <p style={{ color: '#8a8a9e', fontSize: 14, margin: 0 }}>{emenda.tipo || "Tipo não informado"}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {emenda.criticidade && (
                <span style={{ ...critStyle, padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600 }}>{emenda.criticidade}</span>
              )}
              {emenda.ano && (
                <span style={{ background: '#f1f5f9', color: '#5a5a6e', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600 }}>Ano {emenda.ano}</span>
              )}
              {emenda.uf && (
                <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600 }}>{emenda.uf}</span>
              )}
            </div>
          </div>

          {/* Autor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: '#f5f5f0', borderRadius: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#3d6b5e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
              {(emenda.autorNome || "?")[0]}
            </div>
            <div>
              <p style={{ fontWeight: 600, color: '#1a1a2e', margin: 0 }}>{emenda.autorNome || "Autor desconhecido"}</p>
              <p style={{ fontSize: 13, color: '#8a8a9e', margin: 0 }}>
                {[emenda.autorPartido, emenda.autorUf].filter(Boolean).join(" - ")}
                {emenda.parlamentarId && (
                  <> · <Link to={`/politico/deputados_federais/${emenda.parlamentarId}`} style={{ color: '#3d6b5e', textDecoration: 'underline' }}>Ver perfil</Link></>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Valores Card */}
        <div style={card}>
          <h2 style={sectionTitle}>Valores da Emenda</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Empenhado', value: emenda.valorEmpenhado, color: '#1a1a2e' },
              { label: 'Liquidado', value: emenda.valorLiquidado, color: '#1a1a2e' },
              { label: 'Pago', value: emenda.valorPago, color: '#3d6b5e' },
            ].map((item) => (
              <div key={item.label} style={{ padding: 16, background: '#f5f5f0', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#8a8a9e', margin: '0 0 4px 0' }}>{item.label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: item.color, margin: 0 }}>{fmt(item.value)}</p>
              </div>
            ))}
          </div>

          {execRate != null && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                <span style={{ color: '#5a5a6e' }}>Taxa de Execução</span>
                <span style={{ fontWeight: 700, color: '#1a1a2e' }}>{execRate}%</span>
              </div>
              <div style={{ width: '100%', background: '#e5e7eb', borderRadius: 9999, height: 12, overflow: 'hidden' }}>
                <div style={{
                  height: 12,
                  borderRadius: 9999,
                  width: `${Math.min(execRate, 100)}%`,
                  background: execRate >= 70 ? '#3d6b5e' : execRate >= 40 ? '#d4a017' : '#dc2626',
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Detalhes Card */}
        <div style={card}>
          <h2 style={sectionTitle}>Detalhes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {[
              ["Localidade", emenda.localidade],
              ["IDH Local", emenda.idhLocal],
              ["Função", emenda.funcao],
              ["Subfunção", emenda.subfuncao],
              ["Programa", emenda.programa],
            ].filter(([, v]) => v != null && v !== "").map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f1ee', fontSize: 14 }}>
                <span style={{ color: '#8a8a9e' }}>{label}</span>
                <span style={{ fontWeight: 500, color: '#1a1a2e' }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        {emenda.alertas && emenda.alertas.length > 0 && (
          <div style={{ ...card, border: '1px solid #fecdd3' }}>
            <h2 style={{ ...sectionTitle, color: '#be123c' }}>Alertas</h2>
            {emenda.alertas.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#9f1239', background: '#fff1f2', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                <span>⚠️</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTA Relatório IA */}
        <div style={{
          background: 'linear-gradient(135deg, #1a2e44, #2a4a6b)',
          borderRadius: 16,
          padding: 24,
          color: '#ffffff',
        }}>
          <p style={{ fontSize: 11, letterSpacing: 2, color: '#94a3b8', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Relatório IA TransparenciaBR</p>
          <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0' }}>Análise completa desta emenda</h3>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 16px 0' }}>
            Cruzamento de dados, detecção de padrões suspeitos e fundamentação legal — gerado por IA em segundos.
          </p>
          <Link to="/creditos" style={{
            display: 'inline-block',
            background: '#ffffff',
            color: '#1a2e44',
            fontWeight: 600,
            padding: '12px 24px',
            borderRadius: 9999,
            fontSize: 14,
            textDecoration: 'none',
          }}>
            Gerar Relatório IA
          </Link>
        </div>

      </div>
    </div>
  );
}
