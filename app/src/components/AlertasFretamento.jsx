import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

function fmt(v) {
  if (!v) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

const AEROPORTOS_ICAO = {
  SBEG: { cidade: "Manaus", estado: "AM" },
  SBBE: { cidade: "Belem", estado: "PA" },
  SBMA: { cidade: "Maraba", estado: "PA" },
  SBSN: { cidade: "Santarem", estado: "PA" },
  SBHT: { cidade: "Altamira", estado: "PA" },
  SBBR: { cidade: "Brasilia", estado: "DF" },
  SBSP: { cidade: "Sao Paulo", estado: "SP" },
  SBGR: { cidade: "Guarulhos", estado: "SP" },
  SBRJ: { cidade: "Rio de Janeiro", estado: "RJ" },
  SBGL: { cidade: "Galeao", estado: "RJ" },
  SBCF: { cidade: "Confins", estado: "MG" },
  SBFI: { cidade: "Foz do Iguacu", estado: "PR" },
  SBCT: { cidade: "Curitiba", estado: "PR" },
  SBPA: { cidade: "Porto Alegre", estado: "RS" },
  SBRF: { cidade: "Recife", estado: "PE" },
  SBFZ: { cidade: "Fortaleza", estado: "CE" },
  SBSL: { cidade: "Sao Luis", estado: "MA" },
  SBTE: { cidade: "Teresina", estado: "PI" },
  SBMQ: { cidade: "Macapa", estado: "AP" },
  SBIZ: { cidade: "Imperatriz", estado: "MA" },
};

const KEYWORDS_FRETAMENTO = [
  "aeronave", "fretamento", "frete", "taxi aereo", "taxi aéreo",
  "locacao", "locação", "charter", "aviao", "avião", "aereo", "aéreo"
];

const TIPO_LABELS = {
  VALOR_ALTO: { icon: "💰", label: "Valor Acima de R$ 20 mil" },
  ROTA_DISCREPANTE: { icon: "🗺️", label: "Rota Inconsistente (ICAO)" },
  VOO_ANTIECONOMICO: { icon: "✈️", label: "Voo Antieconomico" },
  CONCENTRACAO_FORNECEDOR: { icon: "🏢", label: "Concentracao de Fornecedor" },
  VOO_FIM_SEMANA: { icon: "📅", label: "Voo em Fim de Semana" },
  EMPRESA_SUSPEITA: { icon: "⚠️", label: "Padrao Suspeito" },
};

const SEVERITY_STYLES = {
  ALTA: { borderColor: 'var(--accent-red)', badgeBg: 'rgba(181,74,74,0.12)', badgeColor: 'var(--accent-red)' },
  MEDIA: { borderColor: 'var(--accent-gold)', badgeBg: 'rgba(201,168,76,0.15)', badgeColor: '#b8860b' },
  BAIXA: { borderColor: 'var(--accent-green)', badgeBg: 'rgba(61,107,94,0.12)', badgeColor: 'var(--accent-green)' },
};

function gerarAlertasClientSide(gastos) {
  const alertas = [];
  const fretamentos = gastos.filter(g => {
    const tipo = (g.tipoDespesa || g.tipo || g.descricao || '').toLowerCase();
    const forn = (g.fornecedorNome || g.nomeFornecedor || '').toLowerCase();
    return KEYWORDS_FRETAMENTO.some(kw => tipo.includes(kw) || forn.includes(kw) || JSON.stringify(g).toLowerCase().includes(kw));
  });

  // Agrupar por fornecedor
  const porFornecedor = {};
  fretamentos.forEach(g => {
    const f = g.fornecedorNome || g.nomeFornecedor || 'Desconhecido';
    if (!porFornecedor[f]) porFornecedor[f] = { total: 0, notas: [] };
    porFornecedor[f].total += (g.valorLiquido || g.valor || g.valorDocumento || 0);
    porFornecedor[f].notas.push(g);
  });

  fretamentos.forEach(g => {
    const valor = g.valorLiquido || g.valor || g.valorDocumento || 0;
    const forn = g.fornecedorNome || g.nomeFornecedor || 'Desconhecido';
    const cnpj = g.cnpjCpf || g.cnpjCpfFornecedor || '';
    const url = g.urlDocumento || g.url;
    const data = g.dataDocumento || '';

    // Alerta: valor alto
    if (valor >= 20000) {
      alertas.push({
        id: 'va_' + (g.id || Math.random()),
        tipo: 'VALOR_ALTO',
        severidade: valor >= 40000 ? 'ALTA' : 'MEDIA',
        descricao: `Fretamento de ${fmt(valor)} para ${forn}. Gastos acima de R$ 20 mil exigem justificativa de economicidade.`,
        valor, data, fornecedorNome: forn, cnpjCpf: cnpj, urlDocumento: url,
      });
    }

    // Alerta: detectar rota interestadual por codigos ICAO nas observacoes
    const obs = (g.descricao || g.tipoDespesa || g.obs || '').toUpperCase();
    const icaosEncontrados = obs.match(/SB[A-Z]{2}/g) || [];
    if (icaosEncontrados.length >= 2) {
      const estados = [...new Set(icaosEncontrados.map(c => AEROPORTOS_ICAO[c]?.estado).filter(Boolean))];
      if (estados.length > 1) {
        alertas.push({
          id: 'rd_' + (g.id || Math.random()),
          tipo: 'ROTA_DISCREPANTE',
          severidade: 'ALTA',
          descricao: `Voo interestadual detectado (${icaosEncontrados.join(' → ')}) cruzando estados: ${estados.join(', ')}. Verificar se havia voo comercial disponivel.`,
          valor, data, fornecedorNome: forn, cnpjCpf: cnpj, urlDocumento: url,
        });
      }
    }

    // Alerta: dia da semana (sabado=6, domingo=0)
    if (data) {
      const dia = new Date(data).getDay();
      if (dia === 0 || dia === 6) {
        alertas.push({
          id: 'fw_' + (g.id || Math.random()),
          tipo: 'VOO_FIM_SEMANA',
          severidade: 'MEDIA',
          descricao: `Voo fretado em fim de semana (${data.substring(0,10)}). Verificar se havia agenda parlamentar oficial.`,
          valor, data, fornecedorNome: forn, cnpjCpf: cnpj, urlDocumento: url,
        });
      }
    }
  });

  // Alerta: concentracao de fornecedor
  Object.entries(porFornecedor).forEach(([forn, info]) => {
    if (info.notas.length >= 3 && info.total >= 50000) {
      alertas.push({
        id: 'cf_' + forn,
        tipo: 'CONCENTRACAO_FORNECEDOR',
        severidade: info.total >= 200000 ? 'ALTA' : 'MEDIA',
        descricao: `${forn} recebeu ${fmt(info.total)} em ${info.notas.length} pagamentos de fretamento. Alta concentracao pode indicar empresa de conveniencia.`,
        valor: info.total,
        data: info.notas[0]?.dataDocumento || '',
        fornecedorNome: forn,
        cnpjCpf: info.notas[0]?.cnpjCpf || info.notas[0]?.cnpjCpfFornecedor || '',
        urlDocumento: info.notas[0]?.urlDocumento || info.notas[0]?.url,
      });
    }
  });

  const severityOrder = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
  alertas.sort((a, b) => (severityOrder[a.severidade] ?? 3) - (severityOrder[b.severidade] ?? 3));
  // Deduplicar por tipo+fornecedor
  const seen = new Set();
  return alertas.filter(a => {
    const key = a.tipo + '_' + a.fornecedorNome;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function AlertasFretamento({ colecao, politicoId, gastos = [] }) {
  const [alertasFirestore, setAlertasFirestore] = useState([]);
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
        setAlertasFirestore(items);
      } catch (err) {
        console.error("Erro ao carregar alertas de fretamento:", err);
      }
      setLoading(false);
    }
    load();
  }, [colecao, politicoId]);

  // Se Firestore nao tem alertas, gerar client-side a partir dos gastos
  const alertas = useMemo(() => {
    if (alertasFirestore.length > 0) return alertasFirestore;
    return gerarAlertasClientSide(gastos);
  }, [alertasFirestore, gastos]);

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>Analisando gastos de fretamento...</div>;
  }

  if (alertas.length === 0) {
    return (
      <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center', color: 'var(--text-muted)' }}>
        Nenhum gasto com fretamento de aeronaves encontrado para este politico.
      </div>
    );
  }

  const totalValor = alertas.reduce((s, a) => s + (a.valor || 0), 0);
  const countBySeverity = { ALTA: 0, MEDIA: 0, BAIXA: 0 };
  alertas.forEach(a => { if (countBySeverity[a.severidade] != null) countBySeverity[a.severidade]++; });
  const isClientSide = alertasFirestore.length === 0 && gastos.length > 0;

  return (
    <div>
      {isClientSide && (
        <div style={{ padding: '10px 14px', background: 'rgba(255,193,7,0.1)', border: '1px solid var(--accent-gold)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '13px', color: 'var(--accent-gold)' }}>
          ⚡ Analise automatica gerada em tempo real a partir dos dados de gastos.
        </div>
      )}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-red)' }}>{alertas.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>ALERTAS DETECTADOS</div>
          <div style={{ marginTop: '8px', display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {countBySeverity.ALTA > 0 && <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(181,74,74,0.15)', color: 'var(--accent-red)', fontSize: '11px' }}>{countBySeverity.ALTA} alta</span>}
            {countBySeverity.MEDIA > 0 && <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(201,168,76,0.15)', color: '#b8860b', fontSize: '11px' }}>{countBySeverity.MEDIA} media</span>}
            {countBySeverity.BAIXA > 0 && <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(61,107,94,0.15)', color: 'var(--accent-green)', fontSize: '11px' }}>{countBySeverity.BAIXA} baixa</span>}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-orange)' }}>{fmt(totalValor)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>VALOR TOTAL EM FRETAMENTOS</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {alertas.map(alerta => {
          const sev = SEVERITY_STYLES[alerta.severidade] || SEVERITY_STYLES.BAIXA;
          const tipo = TIPO_LABELS[alerta.tipo] || { icon: "⚠️", label: alerta.tipo || "Alerta" };
          return (
            <div key={alerta.id} style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid ' + sev.borderColor, border: '1px solid var(--border-light)', borderLeftColor: sev.borderColor }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', background: sev.badgeBg, color: sev.badgeColor, fontSize: '11px', fontWeight: 600 }}>{alerta.severidade}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{tipo.icon} {tipo.label}</span>
                </div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-orange)', whiteSpace: 'nowrap' }}>{fmt(alerta.valor)}</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: '1.5' }}>{alerta.descricao || alerta.mensagem || 'Sem descricao'}</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                {alerta.data && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{typeof alerta.data === 'string' ? alerta.data.substring(0, 10) : ''}</span>}
                {alerta.fornecedorNome && <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px' }}>{alerta.fornecedorNome}</span>}
                {alerta.cnpjCpf && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CNPJ: {alerta.cnpjCpf}</span>}
                {alerta.urlDocumento && (
                  <a href={alerta.urlDocumento} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--accent-green)', textDecoration: 'none' }}>📄 Ver Nota Fiscal</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
