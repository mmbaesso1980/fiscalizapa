export default function MetodologiaPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px', color: 'var(--text-primary)' }}>Metodologia</h1>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Fontes de Dados</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '14px' }}>Todos os dados sao obtidos de fontes publicas oficiais: API da Camara dos Deputados (dadosabertos.camara.leg.br), Portal da Transparencia e dados eleitorais do TSE. Os dados de despesas parlamentares (CEAP) sao atualizados diariamente.</p>
      </div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Indice de Transparencia (ITB)</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '14px' }}>O score de risco (0-100) e calculado com base em: concentracao de gastos em poucos fornecedores, variacao dos gastos em relacao a media do grupo, padroes atipicos de despesas, e analise de emendas parlamentares. Score alto indica maior necessidade de fiscalizacao.</p>
      </div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Analise com IA</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '14px' }}>A analise por inteligencia artificial utiliza o modelo Gemini do Google para examinar padroes de gastos, identificar anomalias e gerar relatorios tecnicos. A IA e apartidaria e baseada exclusivamente nos dados publicos disponibilizados.</p>
      </div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '28px', border: '1px solid var(--border-light)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '12px' }}>Principios</h2>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 2, fontSize: '14px', paddingLeft: '20px' }}>
          <li>Apartidarismo total - nao ha vis politico</li>
          <li>Dados publicos e verificaveis</li>
          <li>Metodologia aberta e transparente</li>
          <li>Codigo aberto no GitHub</li>
        </ul>
      </div>
    </div>
  );
}
