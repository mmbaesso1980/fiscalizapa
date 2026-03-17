import { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";

function fmt(v) {
  if (!v) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

const TIPO_LABELS = {
  VALOR_ALTO: { icon: "\uD83D\uDCB0", label: "Valor Acima de R$ 20 mil" },
  ROTA_DISCREPANTE: { icon: "\uD83D\uDDFA\uFE0F", label: "Rota Inconsistente (ICAO)" },
  VOO_ANTIECONOMICO: { icon: "\u2708\uFE0F", label: "Voo Antieconomico" },
  CONCENTRACAO_FORNECEDOR: { icon: "\uD83C\uDFE2", label: "Concentracao de Fornecedor" },
  VOO_FIM_SEMANA: { icon: "\uD83D\uDCC5", label: "Voo em Fim de Semana" },
};

const SEVERITY_STYLES = {
  ALTA: { borderColor: 'var(--accent-red)', badgeBg: 'rgba(181,74,74,0.12)', badgeColor: 'var(--accent-red)' },
  MEDIA: { borderColor: 'var(--accent-gold)', badgeBg: 'rgba(201,168,76,0.15)', badgeColor: '#b8860b' },
  BAIXA: { borderColor: 'var(--accent-green)', badgeBg: 'rgba(61,107,94,0.12)', badgeColor: 'var(--accent-green)' },
};

export default function AlertasFretamento({ colecao, politicoId }) {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!colecao || !politicoId) return;
    async function load() {
      setLoading(true);
      try {
        const ref = collection(db, colecao, politicoId, "alertas_fretamento");
        const snap = await getDocs(ref);
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const severityOrder = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
        items.sort((a, b) => (severityOrder[a.severidade] ?? 3) - (severityOrder[b.severidade] ?? 3));
        setAlertas(items);
      } catch (err) {
        console.error("Erro ao carregar alertas de fretamento:", err);
      }
      setLoading(false);
    }
    load();
  }, [colecao, politicoId]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Carregando alertas de fretamento...
      </div>
    );
  }

  if (alertas.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
        padding: '40px', textAlign: 'center', color: 'var(--text-muted)'
      }}>
        Nenhum alerta de fretamento encontrado para este politico.
      </div>
    );
  }

  const totalValor = alertas.reduce((s, a) => s + (a.valor || 0), 0);
  const countBySeverity = { ALTA: 0, MEDIA: 0, BAIXA: 0 };
  alertas.forEach(a => {
    if (countBySeverity[a.severidade] != null) countBySeverity[a.severidade]++;
  });

  const lastAudit = alertas.reduce((latest, a) => {
    const d = a.dataAuditoria || a.criadoEm || a.data;
    if (!d) return latest;
    const dateStr = typeof d === 'string' ? d : (d.toDate ? d.toDate().toISOString() : '');
    return dateStr > latest ? dateStr : latest;
  }, '');

  const auditDate = lastAudit ? new Date(lastAudit).toLocaleDateString('pt-BR') : null;

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{
          background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
          padding: '18px', border: '1px solid var(--border-light)', textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-red)' }}>
            {alertas.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Total de alertas
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '8px' }}>
            {countBySeverity.ALTA > 0 && (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(181,74,74,0.12)', color: 'var(--accent-red)', fontWeight: 600 }}>
                {countBySeverity.ALTA} alta
              </span>
            )}
            {countBySeverity.MEDIA > 0 && (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(201,168,76,0.15)', color: '#b8860b', fontWeight: 600 }}>
                {countBySeverity.MEDIA} media
              </span>
            )}
            {countBySeverity.BAIXA > 0 && (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(61,107,94,0.12)', color: 'var(--accent-green)', fontWeight: 600 }}>
                {countBySeverity.BAIXA} baixa
              </span>
            )}
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
          padding: '18px', border: '1px solid var(--border-light)', textAlign: 'center'
        }}>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-orange)' }}>
            {fmt(totalValor)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Valor total envolvido
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
          padding: '18px', border: '1px solid var(--border-light)', textAlign: 'center'
        }}>
          <div style={{
            display: 'inline-block', padding: '6px 16px', borderRadius: '14px', fontSize: '12px', fontWeight: 600,
            background: auditDate ? 'rgba(61,107,94,0.12)' : 'rgba(201,168,76,0.15)',
            color: auditDate ? 'var(--accent-green)' : '#b8860b'
          }}>
            {auditDate ? `AUDITADO EM ${auditDate}` : 'PENDENTE DE AUDITORIA'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ultima auditoria
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {alertas.map(alerta => {
          const sev = SEVERITY_STYLES[alerta.severidade] || SEVERITY_STYLES.BAIXA;
          const tipo = TIPO_LABELS[alerta.tipo] || { icon: "\u26A0\uFE0F", label: alerta.tipo || "Alerta" };

          return (
            <div key={alerta.id} style={{
              background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
              padding: '16px', border: '1px solid var(--border-light)',
              borderLeft: `4px solid ${sev.borderColor}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                      background: sev.badgeBg, color: sev.badgeColor
                    }}>
                      {alerta.severidade}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>
                      {tipo.icon} {tipo.label}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '8px' }}>
                    {alerta.descricao || alerta.mensagem || 'Sem descricao'}
                  </p>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {alerta.data && (
                      <span>{typeof alerta.data === 'string' ? alerta.data.substring(0, 10) : (alerta.data.toDate ? alerta.data.toDate().toLocaleDateString('pt-BR') : '')}</span>
                    )}
                    {(alerta.fornecedorNome || alerta.nomeFornecedor) && (
                      <span>{alerta.fornecedorNome || alerta.nomeFornecedor}</span>
                    )}
                    {(alerta.cnpjCpf || alerta.cnpjCpfFornecedor) && (
                      <span>CNPJ: {alerta.cnpjCpf || alerta.cnpjCpfFornecedor}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-orange)', fontSize: '15px', whiteSpace: 'nowrap' }}>
                    {fmt(alerta.valor)}
                  </span>
                  {alerta.urlDocumento && (
                    <a href={alerta.urlDocumento} target="_blank" rel="noopener noreferrer" style={{
                      padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                      background: 'var(--accent-green)', color: '#fff', textDecoration: 'none',
                      whiteSpace: 'nowrap'
                    }}>
                      Ver Nota
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
