// functions/indiceTransparenciaBR.js
// Motor Avançado de Cálculo do Índice Fiscaliza PA

const DIAS_NA_LEGISLATURA = 1460; // 4 anos (2023-2026)
const TETO_CEAP_MENSAL = 45000;
const TETO_CEAP_DIARIO = TETO_CEAP_MENSAL / 30; // R$ 1.500/dia

/**
 * Filtro rigoroso: Retorna apenas proposições onde o deputado é AUTOR PRINCIPAL ou RELATOR.
 * @param {Array} proposicoes - Lista de proposições da API da Câmara
 * @param {Number} idDeputado - ID do Deputado na Câmara
 * @returns {Array} - Array filtrado apenas com produção real do deputado
 */
function filtrarProducaoReal(proposicoes, idDeputado) {
  if (!proposicoes || !Array.isArray(proposicoes)) return [];
  
  return proposicoes.filter(prop => {
    // 1. Só consideramos projetos que dão trabalho (Ignora REQ, MOÇÃO, etc)
    const tiposValidos = ['PL', 'PEC', 'PLP', 'PDL'];
    const isTipoValido = tiposValidos.includes(prop.siglaTipo);

    // 2. É o autor principal? (Primeiro da lista na API de autores)
    const isAutorPrincipal = prop.autores && prop.autores.length > 0 
                             && prop.autores[0].idDeputado === idDeputado;
                             
    // 3. Foi relator da matéria na comissão ou plenário?
    const isRelator = prop.relator && prop.relator.idDeputado === idDeputado;

    return isTipoValido && (isAutorPrincipal || isRelator);
  });
}

/**
 * Calcula o Score Avançado de um Deputado considerando a proporcionalidade do mandato
 * @param {Object} dados - Dados brutos do deputado
 * @returns {Object} - Objeto completo com as notas de todos os eixos
 */
function calcularScoreAvancado(dados) {
  const {
    idDeputado,
    diasDeMandato = DIAS_NA_LEGISLATURA, // Padrão: mandato completo (4 anos)
    presencaPlenarioPct = 0,
    presencaComissoesPct = 0,
    votosEmitidos = 0,
    votacoesNominaisOcorridas = 0, // Votações que ocorreram *enquanto* ele estava no mandato
    totalGastos = 0,
    gastosComDivulgacaoPct = 0, // % do gasto focado em marketing
    totalAcoesFiscalizacao = 0, // PFC, RIC
    proposicoesBrutas = [], // Array de todas as proposições retornadas da API
    isLiderOuPresidente = false, // Boolean: Lider de bancada, Presidente de comissão
    processosOuSuspensoes = 0 // Inteiro: Quantidade de processos no STF/Conselho de Ética
  } = dados;

  // Evita divisão por zero
  const diasEfetivos = Math.max(1, diasDeMandato);
  const proporcaoTempo = diasEfetivos / 365; // Quantos "anos" de mandato ele tem

  // ====================================================================
  // EIXO 1: PRESENÇA QUALIFICADA (20%)
  // Penaliza quem bate ponto de manhã, mas some na hora de votar
  // ====================================================================
  let taxaDeVoto = votacoesNominaisOcorridas > 0 
      ? (votosEmitidos / votacoesNominaisOcorridas) 
      : 1;
  
  // Se votou em menos de 70% do que deveria, o valor das presenças no plenário é cortado
  let multiplicadorPresenca = taxaDeVoto < 0.70 ? 0.5 : 1; 
  
  const notaPresenca = ((presencaPlenarioPct * 0.7 * multiplicadorPresenca) + (presencaComissoesPct * 0.3));
  const eixo1 = Math.min(100, Math.max(0, notaPresenca));

  // ====================================================================
  // EIXO 2: PROTAGONISMO E ARTICULAÇÃO (15%)
  // ====================================================================
  let eixo2 = 50; // Nota base pra quem é baixo clero
  if (isLiderOuPresidente) {
    eixo2 = 100;
  }
  // Se for relator de algo relevante, isso sobe depois

  // ====================================================================
  // EIXO 3: PRODUÇÃO LEGISLATIVA EFETIVA (25%) - O MAIS PESADO
  // Só conta autor principal e relator.
  // ====================================================================
  const proposicoesReais = filtrarProducaoReal(proposicoesBrutas, idDeputado);
  
  // A meta é ele entregar 5 projetos densos/relatorias POR ANO DE MANDATO
  const metaProducaoAnual = 5; 
  const metaProporcional = metaProducaoAnual * proporcaoTempo;
  
  let eixo3 = (proposicoesReais.length / metaProporcional) * 100;
  
  // Bônus: +10 pontos na nota bruta do eixo para cada projeto que virou Lei
  const projetosAprovados = proposicoesReais.filter(p => p.foiSancionado).length;
  eixo3 += (projetosAprovados * 10);
  
  eixo3 = Math.min(100, Math.max(0, eixo3));

  // ====================================================================
  // EIXO 4: FISCALIZAÇÃO E CONTROLE (10%)
  // ====================================================================
  const metaFiscAnual = 5; // 5 ações de controle do executivo por ano
  const metaFiscProporcional = metaFiscAnual * proporcaoTempo;
  let eixo4 = (totalAcoesFiscalizacao / metaFiscProporcional) * 100;
  eixo4 = Math.min(100, Math.max(0, eixo4));

  // ====================================================================
  // EIXO 5: POSICIONAMENTO E FIDELIDADE (20%)
  // ====================================================================
  let eixo5 = taxaDeVoto * 100; // Simples: esteve lá no momento do painel apertou o botão?
  eixo5 = Math.min(100, Math.max(0, eixo5));

  // ====================================================================
  // EIXO 6: EFICIÊNCIA FISCAL PROPORCIONAL (10%)
  // Adeus nota alta de suplente que não gasta porque não fica na câmara
  // ====================================================================
  const tetoRealDoDeputado = TETO_CEAP_DIARIO * diasEfetivos;
  
  let eixo6 = 0;
  if (totalGastos === 0) {
      eixo6 = 50; // Nota neutra pra falha da API
  } else {
      const pctGastoDoTeto = totalGastos / tetoRealDoDeputado;
      eixo6 = (1 - pctGastoDoTeto) * 100;
  }
  
  // Filtro Anti-Marqueteiro: Gasta mais de 40% só com "Divulgação de Atividade"?
  if (gastosComDivulgacaoPct > 0.40) {
      eixo6 = eixo6 * 0.8; // Perde 20% da pontuação de economia
  }
  eixo6 = Math.min(100, Math.max(0, eixo6));

  // ====================================================================
  // CALCULO DO ÍNDICE FINAL + PENALIDADES (FICHA LIMPA)
  // ====================================================================
  let scoreBruto = 
    (eixo1 * 0.20) + 
    (eixo2 * 0.15) + 
    (eixo3 * 0.25) + 
    (eixo4 * 0.10) + 
    (eixo5 * 0.20) + 
    (eixo6 * 0.10);

  // Dedução da Ficha Limpa: Réus no STF ou Condenados na Ética
  if (processosOuSuspensoes > 0) {
      scoreBruto -= (processosOuSuspensoes * 25); // Toma -25 pontos por cada processo grave
  }

  const scoreFinal = Number(Math.max(0, Math.min(100, scoreBruto)).toFixed(1));

  return {
    scoreFinal,
    eixos: {
      eixo1_presencaQualificada: Number(eixo1.toFixed(1)),
      eixo2_protagonismo: Number(eixo2.toFixed(1)),
      eixo3_producaoEfetiva: Number(eixo3.toFixed(1)),
      eixo4_fiscalizacao: Number(eixo4.toFixed(1)),
      eixo5_posicionamento: Number(eixo5.toFixed(1)),
      eixo6_eficienciaProporcional: Number(eixo6.toFixed(1))
    },
    metricasExtras: {
      diasDeMandatoEfetivos: diasEfetivos,
      tetoDeGastosAplicado: Number(tetoRealDoDeputado.toFixed(2)),
      projetosReaisValidados: proposicoesReais.length
    }
  };
}

module.exports = {
  calcularScoreAvancado,
  filtrarProducaoReal
};
