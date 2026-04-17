import { Link } from "react-router-dom";

const APIS = [
  { nome: 'Camara dos Deputados',       url: 'dadosabertos.camara.leg.br/api/v2',  desc: 'CEAP, deputados, votacoes, despesas' },
  { nome: 'Portal da Transparencia CGU',url: 'api.portaldatransparencia.gov.br',   desc: 'Emendas, contratos, licitacoes' },
  { nome: 'Querido Diario',             url: 'queridodiario.ok.org.br/api',        desc: 'Publicacoes em diarios oficiais' },
  { nome: 'TSE',                        url: 'dadosabertos.tse.jus.br',            desc: 'Doadores, financiamento eleitoral' },
  { nome: 'IBGE',                       url: 'servicodados.ibge.gov.br/api',       desc: 'Indicadores socioeconomicos' },
];

const FLAGS = [
  { nome: 'Pico mensal anormal',       desc: 'Gasto em um mes supera 3x a media do deputado no mandato.' },
  { nome: 'Concentracao em fornecedor',desc: 'Mais de 40% das despesas CEAP em um unico CNPJ.' },
  { nome: 'Recorrencia suspeita',      desc: 'Mesmo fornecedor aparece mais de 20x em 12 meses.' },
  { nome: 'CNAE incompativel',         desc: 'Atividade da empresa nao corresponde ao tipo de despesa.' },
  { nome: 'Distancia geografica',      desc: 'Nota emitida fora do estado de atuacao do deputado.' },
  { nome: 'Fracionamento',             desc: 'Varios documentos de valores proximos ao limite diario.' },
  { nome: 'Empresa recem-criada',      desc: 'CNPJ com menos de 6 meses na data da nota.' },
  { nome: 'Valor medio elevado',       desc: 'Valor medio por documento acima de 2 desvios do grupo.' },
];

export default function MetodologiaPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>

        <Link to="/" style={{ fontSize: 13, color: '#AAA', textDecoration: 'none' }}>&larr; Voltar</Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#2D2D2D', margin: '16px 0 8px' }}>Metodologia &amp; Fontes</h1>
        <p style={{ fontSize: 15, color: '#666', lineHeight: 1.7, marginBottom: 36 }}>
          O score de transparencia e calculado automaticamente pelo motor TransparenciaBR, combinando dados de
          multiplas fontes oficiais. Nao ha julgamento politico: apenas matematica aplicada a dados publicos.
        </p>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2D2D2D', marginBottom: 14 }}>Como funciona o score</h2>
        <div style={{ background: '#fff', borderRadius: 14, padding: '24px', border: '1px solid #EDEBE8', marginBottom: 36 }}>
          <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { peso: '40%', dim: 'CEAP',                 desc: 'Volume, concentracao, anomalias e recorrencia nas despesas de cota parlamentar.' },
              { peso: '25%', dim: 'Emendas',               desc: 'Diversificacao, execucao orcamentaria e beneficiarios.' },
              { peso: '20%', dim: 'Atividade parlamentar', desc: 'Presencas, votacoes, projetos apresentados.' },
              { peso: '15%', dim: 'Fornecedores',          desc: 'Concentracao, CNAE, tempo de existencia, localidade.' },
            ].map((d, i) => (
              <li key={i} style={{ fontSize: 14, color: '#2D2D2D', listStyle: 'none', padding: '10px 14px', background: '#FAFAF8', borderRadius: 8 }}>
                <span style={{ fontWeight: 700 }}>{d.peso} - {d.dim}:</span>{' '}<span style={{ color: '#666' }}>{d.desc}</span>
              </li>
            ))}
          </ul>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2D2D2D', marginBottom: 14 }}>Fontes de dados</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 36 }}>
          {APIS.map((api, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #EDEBE8', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>&#128202;</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2D2D' }}>{api.nome}</div>
                <div style={{ fontSize: 12, color: '#AAA', marginTop: 2 }}>{api.desc}</div>
                <div style={{ fontSize: 11, color: '#CCC', marginTop: 4, fontFamily: 'monospace' }}>{api.url}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2D2D2D', marginBottom: 14 }}>Flags CEAP</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 10, marginBottom: 36 }}>
          {FLAGS.map((f, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #EDEBE8' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2D2D', marginBottom: 4 }}>&#9888;&#65039; {f.nome}</div>
              <div style={{ fontSize: 12, color: '#777', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'linear-gradient(135deg,#FBE8C4,#D6EDF5)', borderRadius: 14, padding: '20px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#2D2D2D', marginBottom: 12 }}>Metodologia aberta. Quer contribuir ou reportar um erro?</p>
          <a href="mailto:contato@transparenciabr.com.br" style={{ padding: '10px 20px', borderRadius: 100, background: '#2D2D2D', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Entrar em contato</a>
        </div>

      </div>
    </div>
  );
}
