export default function MetodologiaPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px', color: 'var(--text-primary)' }}>Metodologia</h1>

      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Fontes de Dados</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '14px' }}>Todos os dados são obtidos de fontes públicas oficiais: API da Câmara dos Deputados (dadosabertos.camara.leg.br), Portal da Transparência e dados eleitorais do TSE. Os dados de despesas parlamentares (CEAP) são atualizados diariamente.</p>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Índice TransparenciaBR (ITB)</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '14px' }}>O índice (0–100) avalia o desempenho parlamentar com base em 5 pilares: <strong>economia (40%)</strong> — eficiência no uso da cota parlamentar e verba de gabinete; <strong>processos (25%)</strong> — histórico judicial e processos graves; <strong>presença (20%)</strong> — participação em sessões plenárias; <strong>proposições (10%)</strong> — projetos de lei apresentados; <strong>defesas (5%)</strong> — atuação em comissões. Normalizado tendo Kim Kataguiri (ID 204536) como referência = 100. <strong>Score alto = melhor desempenho.</strong></p>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Score de Risco</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '14px' }}>Separado do índice, o score de risco (0–100) é calculado na página individual de cada político com base em: concentração de gastos em poucos fornecedores, variação dos gastos em relação à média do grupo, padrões atípicos de despesas e análise de emendas parlamentares. <strong>Score alto indica maior necessidade de fiscalização.</strong></p>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Análise com IA</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '14px' }}>A análise por inteligência artificial utiliza o modelo Gemini do Google para examinar padrões de gastos, identificar anomalias e gerar relatórios técnicos. A IA é apartidária e baseada exclusivamente nos dados públicos disponibilizados.</p>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Princípios</h2>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 2, fontSize: '14px', paddingLeft: '20px' }}>
          <li>Apartidarismo total — não há viés político</li>
          <li>Dados públicos e verificáveis</li>
          <li>Metodologia aberta e transparente</li>
          <li>Código aberto no GitHub</li>
        </ul>
      </div>
    </div>
  );
}
