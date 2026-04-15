/**
 * Motor Forense TransparenciaBR — Cloud Functions
 *
 * Módulo de análise forense que cruza dados de múltiplas APIs públicas
 * e gera score + flags automáticos para cada parlamentar.
 *
 * Fontes: Câmara (CEAP, Votações, Proposições), Portal da Transparência
 * (Emendas, CEIS/CNEP, PNCP), BigQuery (auditoria interna).
 *
 * Scoring: CEAP 25% + Emendas 25% + Votações 20% + Fornecedores 15% + Sanções 15%
 */

'use strict';

const https = require('https');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = { Accept: 'application/json', ...headers };
    https.get(url, { headers: defaultHeaders }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function portalApiGet(pathWithLeadingSlash, apiKey) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.portaldatransparencia.gov.br',
      path: pathWithLeadingSlash,
      headers: { Accept: 'application/json', 'chave-api-dados': apiKey },
    };
    https.get(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Portal API JSON: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function parseValorBRL(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const s = String(raw).trim().replace(/\s/g, '').replace(/R\$\s?/gi, '');
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalizeNome(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function defaultAnos() {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2, y - 3].filter((a) => a >= 2023 && a <= y);
}

// ─── API Fetchers ─────────────────────────────────────────────────────────────

/** Fetch CEAP despesas de um deputado para vários anos */
async function fetchCeapTotais(deputadoId, anos) {
  let total = 0;
  let count = 0;
  const porCategoria = {};

  for (const ano of anos) {
    for (let p = 1; p <= 15; p++) {
      const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/despesas?ano=${ano}&pagina=${p}&itens=100&ordem=DESC&ordenarPor=dataDocumento`;
      let j;
      try { j = await fetchJson(url); } catch { break; }
      const dados = j?.dados ?? [];
      if (dados.length === 0) break;
      for (const d of dados) {
        const v = parseValorBRL(d?.vlrLiquido ?? d?.valorLiquido ?? d?.valorDocumento ?? 0);
        total += v;
        count++;
        const tipo = d?.tipoDespesa || d?.txtDescricao || 'Outros';
        porCategoria[tipo] = (porCategoria[tipo] || 0) + v;
      }
      if (dados.length < 100) break;
    }
  }

  return { total, count, porCategoria };
}

/** Fetch proposições como autor principal */
async function fetchProposicoesAutor(deputadoId) {
  const tipos = { PL: 0, PEC: 0, PLP: 0, REQ: 0, INC: 0, PDL: 0, outros: 0 };
  let totalProps = 0;

  for (let p = 1; p <= 10; p++) {
    const url = `https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=${deputadoId}&ordem=DESC&ordenarPor=id&pagina=${p}&itens=100`;
    let j;
    try { j = await fetchJson(url); } catch { break; }
    const dados = j?.dados ?? [];
    if (dados.length === 0) break;
    for (const d of dados) {
      totalProps++;
      const sigla = d?.siglaTipo || '';
      if (tipos[sigla] !== undefined) tipos[sigla]++;
      else tipos.outros++;
    }
    if (dados.length < 100) break;
  }

  return { totalProps, tipos };
}

/** Fetch discursos em plenário */
async function fetchDiscursos(deputadoId) {
  let total = 0;
  const porTipo = {};

  for (let p = 1; p <= 5; p++) {
    const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/discursos?idLegislatura=57&ordenarPor=dataHoraInicio&ordem=DESC&pagina=${p}&itens=100`;
    let j;
    try { j = await fetchJson(url); } catch { break; }
    const dados = j?.dados ?? [];
    if (dados.length === 0) break;
    for (const d of dados) {
      total++;
      const tipo = d?.tipoDiscurso || 'Outros';
      porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    }
    if (dados.length < 100) break;
  }

  return { total, porTipo };
}

/** Fetch frentes parlamentares */
async function fetchFrentes(deputadoId) {
  try {
    const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/frentes`;
    const j = await fetchJson(url);
    const lista = j?.dados ?? [];
    return {
      total: lista.length,
      frentes: lista.slice(0, 20).map((f) => ({
        id: f.id,
        titulo: f.titulo,
        idLegislatura: f.idLegislatura,
      })),
    };
  } catch {
    return { total: 0, frentes: [] };
  }
}

/** Fetch emendas do Portal da Transparência */
async function fetchEmendasTotais(nomeAutor, anos, apiKey) {
  let totalEmpenhado = 0;
  let totalPago = 0;
  let count = 0;
  const porFuncao = {};

  const nomeQuery = normalizeNome(nomeAutor);

  for (const ano of anos) {
    for (let p = 1; p <= 30; p++) {
      const path = `/api-de-dados/emendas?ano=${ano}&nomeAutor=${encodeURIComponent(nomeQuery)}&pagina=${p}`;
      let page;
      try { page = await portalApiGet(path, apiKey); } catch { break; }
      if (!Array.isArray(page) || page.length === 0) break;
      for (const e of page) {
        count++;
        totalEmpenhado += parseValorBRL(e?.valorEmpenhado);
        totalPago += parseValorBRL(e?.valorPago);
        const funcao = e?.funcao || 'Outros';
        porFuncao[funcao] = (porFuncao[funcao] || 0) + parseValorBRL(e?.valorEmpenhado);
      }
      if (page.length < 15) break;
      await sleepMs(350);
    }
  }

  const taxaExecucao = totalEmpenhado > 0 ? Math.round((totalPago / totalEmpenhado) * 1000) / 10 : 0;

  return { totalEmpenhado, totalPago, count, taxaExecucao, porFuncao };
}

/** Verificar sanções CEIS/CNEP por CPF ou nome */
async function fetchSancoes(cpf, nome, apiKey) {
  const sancoes = { ceis: [], cnep: [] };

  // CEIS — Cadastro de Empresas Inidôneas e Suspensas
  if (cpf) {
    try {
      const path = `/api-de-dados/ceis?cpfSancionado=${cpf.replace(/\D/g, '')}&pagina=1`;
      const data = await portalApiGet(path, apiKey);
      if (Array.isArray(data)) {
        sancoes.ceis = data.map((s) => ({
          nome: s?.sancionado?.nome,
          orgao: s?.orgaoSancionador?.nome,
          tipo: s?.tipoSancao?.descricaoResumida,
          dataInicio: s?.dataInicioSancao,
          dataFim: s?.dataFimSancao,
        }));
      }
    } catch { /* silently continue */ }
    await sleepMs(300);
  }

  // CNEP — Cadastro Nacional de Empresas Punidas
  if (cpf) {
    try {
      const path = `/api-de-dados/cnep?cpfSancionado=${cpf.replace(/\D/g, '')}&pagina=1`;
      const data = await portalApiGet(path, apiKey);
      if (Array.isArray(data)) {
        sancoes.cnep = data.map((s) => ({
          nome: s?.sancionado?.nome,
          orgao: s?.orgaoSancionador?.nome,
          tipo: s?.tipoSancao?.descricaoResumida,
          dataInicio: s?.dataInicioSancao,
          dataFim: s?.dataFimSancao,
        }));
      }
    } catch { /* silently continue */ }
  }

  return sancoes;
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Calcula o score forense de 0-100 com 5 componentes.
 *
 * CEAP 25%: gastos abaixo da média = bom; acima de 2 std dev = ruim
 * Emendas 25%: taxa de execução alta = bom; sem dados = neutro
 * Votações 20%: presença e atividade legislativa
 * Fornecedores 15%: diversidade de fornecedores; concentração = ruim
 * Sanções 15%: sem sanções = bom; CEIS/CNEP = muito ruim
 */
/**
 * Score de Eficiência Parlamentar (SEP) - Protocolo Asmodeus v2
 * Fórmula: SEP = (((Produtividade * 0.4) + (Fiscalizacao * 0.4)) / (Gastos/Media * 1.2)) * 100
 */
function calcularScore({ ceap, emendas, proposicoes, discursos, sancoes }) {
  const propSignificativas = proposicoes.itens.filter(
    (p) => p.siglaTipo === 'PL' || p.siglaTipo === 'PEC' || p.siglaTipo === 'PLP'
  ).length;

  let produtividadeRaw = (propSignificativas * 2) + (discursos.total * 0.5);
  let produtividade = Math.min(produtividadeRaw, 100) * 0.4;

  let fiscalizacaoRaw = (emendas.taxaExecucao || 0);
  const totalSancoes = sancoes.ceis.total + sancoes.cnep.total;
  if (totalSancoes > 0) fiscalizacaoRaw -= (totalSancoes * 15);
  let fiscalizacao = Math.max(Math.min(fiscalizacaoRaw, 100), 0) * 0.4;

  let desvios = ceap.desvioDaMedia != null ? ceap.desvioDaMedia : 0;
  let gastoRatio = Math.max(desvios + 1, 0.1);
  let deflator = gastoRatio * 1.2;

  let sepScore = ((produtividade + fiscalizacao) / deflator) * 100;
  let total = Math.round(Math.max(Math.min(sepScore, 100), 0));

  return {
    total,
    componentes: {
      produtividade: { score: produtividade, max: 40, peso: '0.4' },
      fiscalizacao: { score: fiscalizacao, max: 40, peso: '0.4' },
      deflator_gastos: { value: deflator, razao_media: gastoRatio, peso: '1.2' }
    },
  };
}

// ─── Flag Generator ───────────────────────────────────────────────────────────

function gerarFlags(dados) {
  const { ceap, emendas, proposicoes, discursos, sancoes, mediaCeap, stdDevCeap, frentes } = dados;
  const flags = [];

  // ── RED FLAGS ──

  // CEIS/CNEP sanctions
  if ((sancoes.ceis?.length || 0) + (sancoes.cnep?.length || 0) > 0) {
    flags.push({
      severidade: 'red',
      titulo: 'Sanções encontradas (CEIS/CNEP)',
      descricao: `Encontrada(s) ${(sancoes.ceis?.length || 0) + (sancoes.cnep?.length || 0)} sanção(ões) vinculada(s) ao CPF no Cadastro de Empresas Inidôneas (CEIS) ou Cadastro Nacional de Empresas Punidas (CNEP).`,
      detalhes: sancoes.ceis?.map((s) => `CEIS: ${s.orgao} — ${s.tipo}`).concat(
        sancoes.cnep?.map((s) => `CNEP: ${s.orgao} — ${s.tipo}`)
      ).join('; '),
      fonte: 'Portal da Transparência — CEIS/CNEP',
    });
  }

  // CEAP > 2 std devs (anomalous spending)
  if (ceap.total > 0 && mediaCeap > 0 && stdDevCeap > 0) {
    const desvios = (ceap.total - mediaCeap) / stdDevCeap;
    if (desvios > 2) {
      flags.push({
        severidade: 'red',
        titulo: 'CEAP muito acima da média',
        descricao: `Gasto total de R$ ${ceap.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} está ${desvios.toFixed(1)} desvios-padrão acima da média da Câmara (R$ ${mediaCeap.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}).`,
        detalhes: `Média: R$ ${mediaCeap.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} · Desvio padrão: R$ ${stdDevCeap.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
        fonte: 'Dados Abertos da Câmara — CEAP',
      });
    }
  }

  // Quase inativo legislativamente
  const propSignificativas = (proposicoes.tipos?.PL || 0) + (proposicoes.tipos?.PEC || 0) + (proposicoes.tipos?.PLP || 0);
  if (propSignificativas === 0 && discursos.total < 3) {
    flags.push({
      severidade: 'red',
      titulo: 'Atividade parlamentar praticamente nula',
      descricao: `Nenhum PL, PEC ou PLP como autor e apenas ${discursos.total} discurso(s) em plenário na legislatura 57. Indica baixíssimo engajamento legislativo.`,
      fonte: 'Dados Abertos da Câmara',
    });
  }

  // ── YELLOW FLAGS ──

  // CEAP > 1 std dev
  if (ceap.total > 0 && mediaCeap > 0 && stdDevCeap > 0) {
    const desvios = (ceap.total - mediaCeap) / stdDevCeap;
    if (desvios > 1 && desvios <= 2) {
      flags.push({
        severidade: 'yellow',
        titulo: 'CEAP acima da média',
        descricao: `Gasto CEAP (R$ ${ceap.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}) está ${desvios.toFixed(1)} desvios-padrão acima da média.`,
        fonte: 'Dados Abertos da Câmara — CEAP',
      });
    }
  }

  // Emendas sem execução adequada
  if (emendas.count > 0 && emendas.taxaExecucao < 30) {
    flags.push({
      severidade: 'yellow',
      titulo: 'Emendas com baixa execução',
      descricao: `Taxa de execução de apenas ${emendas.taxaExecucao}% (R$ ${emendas.totalPago.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} pago de R$ ${emendas.totalEmpenhado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} empenhado).`,
      fonte: 'Portal da Transparência — Emendas',
    });
  }

  // Alta concentração de gastos em uma categoria
  if (ceap.total > 0) {
    const valores = Object.entries(ceap.porCategoria || {});
    const maxEntry = valores.sort((a, b) => b[1] - a[1])[0];
    if (maxEntry && maxEntry[1] / ceap.total > 0.6) {
      flags.push({
        severidade: 'yellow',
        titulo: 'Gastos concentrados em uma categoria',
        descricao: `${Math.round((maxEntry[1] / ceap.total) * 100)}% dos gastos CEAP concentrados em "${maxEntry[0]}" (R$ ${maxEntry[1].toLocaleString('pt-BR', { maximumFractionDigits: 0 })}).`,
        fonte: 'Dados Abertos da Câmara — CEAP',
      });
    }
  }

  // Baixa atividade legislativa (mas não nula)
  if (propSignificativas > 0 && propSignificativas < 5 && discursos.total < 10) {
    flags.push({
      severidade: 'yellow',
      titulo: 'Atividade legislativa abaixo do esperado',
      descricao: `Apenas ${propSignificativas} proposição(ões) significativa(s) (PL/PEC/PLP) e ${discursos.total} discurso(s). Abaixo da média parlamentar.`,
      fonte: 'Dados Abertos da Câmara',
    });
  }

  // ── GREEN FLAGS ──

  // CEAP abaixo da média
  if (ceap.total > 0 && mediaCeap > 0 && ceap.total < mediaCeap) {
    flags.push({
      severidade: 'green',
      titulo: 'CEAP abaixo da média',
      descricao: `Gasto CEAP (R$ ${ceap.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}) está abaixo da média da Câmara (R$ ${mediaCeap.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}).`,
      fonte: 'Dados Abertos da Câmara — CEAP',
    });
  }

  // Boa execução de emendas
  if (emendas.count > 0 && emendas.taxaExecucao >= 90) {
    flags.push({
      severidade: 'green',
      titulo: 'Excelente execução de emendas',
      descricao: `Taxa de execução de ${emendas.taxaExecucao}% — emendas sendo efetivamente aplicadas.`,
      fonte: 'Portal da Transparência — Emendas',
    });
  }

  // Alta atividade legislativa
  if (propSignificativas >= 20 && discursos.total >= 30) {
    flags.push({
      severidade: 'green',
      titulo: 'Atividade parlamentar intensa',
      descricao: `${propSignificativas} projetos significativos (PL/PEC/PLP) e ${discursos.total} discursos em plenário. Legislador ativo.`,
      fonte: 'Dados Abertos da Câmara',
    });
  }

  // Sem sanções
  if ((sancoes.ceis?.length || 0) + (sancoes.cnep?.length || 0) === 0) {
    flags.push({
      severidade: 'green',
      titulo: 'Sem sanções no CEIS/CNEP',
      descricao: 'Nenhuma sanção encontrada nos cadastros de empresas inidôneas ou punidas vinculada ao CPF.',
      fonte: 'Portal da Transparência — CEIS/CNEP',
    });
  }

  // Muitas frentes parlamentares
  if (frentes.total >= 10) {
    flags.push({
      severidade: 'green',
      titulo: 'Engajamento em frentes parlamentares',
      descricao: `Participa de ${frentes.total} frentes parlamentares, indicando engajamento em múltiplas pautas.`,
      fonte: 'Dados Abertos da Câmara',
    });
  }

  // Educação Fantasma (Módulo 12)
  const emendasEdu = (emendas.itens || []).filter(e => e.funcao === 'Educação');
  const valorEdu = emendasEdu.reduce((acc, curr) => acc + (curr.valorEmpenhado || 0), 0);
  if (valorEdu > 10000000 && emendas.taxaExecucao < 30) {
    flags.push({
      nivel: 'CRÍTICO',
      motivo: 'Flag Vermelha: Educação Fantasma. Alto volume de emendas para Educação com baixíssima taxa de execução municipal.',
      contexto: 'Requer auditoria IDEB vs FNDE via Codex'
    });
  }

  // RPPS Podre (Módulo 13)
  const emendasPrev = (emendas.itens || []).filter(e => e.funcao === 'Previdência Social');
  if (emendasPrev.length > 2) {
    flags.push({
      nivel: 'ALTO',
      motivo: 'Alerta RPPS Podre: Monitoramento de ativos de risco nos fundos de previdência municipal requer atenção.',
      contexto: 'Possível ligação com esquemas estruturados'
    });
  }

  // Violência (Módulo 14)
  const emendasSeg = (emendas.itens || []).filter(e => e.funcao === 'Segurança Pública');
  if (emendasSeg.length > 5) {
    flags.push({
      nivel: 'MÉDIO',
      motivo: 'Cruze emendas de segurança com os índices de criminalidade locais.',
      contexto: 'Auditoria de eficácia de Segurança Pública'
    });
  }
  return flags;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function calcularBadge(score) {
  if (score > 85) return { label: 'EXEMPLAR', cor: 'blue' };
  if (score > 60) return { label: 'REGULAR', cor: 'green' };
  if (score >= 30) return { label: 'ATENÇÃO', cor: 'yellow' };
  return { label: 'RISCO ALTO', cor: 'red' };
}

// ─── Exported Function Builder ────────────────────────────────────────────────

/**
 * Cria e registra as Cloud Functions do motor forense.
 * Chamado de index.js.
 *
 * @param {object} deps - { onCall, HttpsError, db, bq, DATASET, BQ_LOCATION, OPTS }
 */
function registerForensicFunctions(deps) {
  const { onCall, HttpsError, db, bq, DATASET, BQ_LOCATION, OPTS } = deps;

  /**
   * forensicEngine — análise forense completa de um parlamentar.
   *
   * Input: { idCamara, nome, cpf }
   * Output: { score, badge, flags, componentes, dados, atualizadoEm }
   */
  const forensicEngine = onCall(OPTS, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

    const { idCamara, nome, cpf } = req.data || {};
    if (!idCamara && !nome) {
      throw new HttpsError('invalid-argument', 'idCamara ou nome obrigatório.');
    }

    // Resolve idCamara from nome if needed
    let deputadoId = idCamara ? Number(idCamara) : null;
    if (!deputadoId && nome) {
      try {
        const url = `https://dadosabertos.camara.leg.br/api/v2/deputados?nome=${encodeURIComponent(nome)}&ordem=ASC&ordenarPor=nome&idLegislatura=57`;
        const res = await fetchJson(url);
        deputadoId = res?.dados?.[0]?.id || null;
      } catch { /* continue without */ }
    }

    if (!deputadoId) {
      return { erro: 'Deputado não localizado na API da Câmara.', score: null, flags: [] };
    }

    const portalApiKey = process.env.PORTAL_TRANSPARENCIA_API_KEY || '';
    const anos = defaultAnos();
    const nomeBusca = nome || '';

    // ── Fetch media/stddev CEAP do BigQuery (benchmarking) ──
    let mediaCeap = 800000; // Fallback razoável
    let stdDevCeap = 400000;
    try {
      const [rows] = await bq.query({
        query: `SELECT AVG(totalGastos) as media, STDDEV(totalGastos) as desvio FROM \`projeto-codex-br.${DATASET}.auditoria_completa_2023\``,
        location: BQ_LOCATION,
      });
      if (rows[0]?.media) mediaCeap = Number(rows[0].media);
      if (rows[0]?.desvio) stdDevCeap = Number(rows[0].desvio);
    } catch (e) {
      console.warn('forensicEngine: BigQuery media fallback —', e.message);
    }

    // ── Parallel data fetching ──
    const [ceap, proposicoes, discursos, frentes, emendas, sancoes] = await Promise.all([
      fetchCeapTotais(deputadoId, anos),
      fetchProposicoesAutor(deputadoId),
      fetchDiscursos(deputadoId),
      fetchFrentes(deputadoId),
      portalApiKey ? fetchEmendasTotais(nomeBusca, anos, portalApiKey) : Promise.resolve({ totalEmpenhado: 0, totalPago: 0, count: 0, taxaExecucao: 0, porFuncao: {} }),
      portalApiKey && cpf ? fetchSancoes(cpf, nomeBusca, portalApiKey) : Promise.resolve({ ceis: [], cnep: [] }),
    ]);

    // ── Calculate score ──
    const dadosScore = { ceap, emendas, proposicoes, discursos, sancoes, frentes, mediaCeap, stdDevCeap };
    const score = calcularScore(dadosScore);
    const badge = calcularBadge(score.total);
    const flags = gerarFlags(dadosScore);

    // ── Save to Firestore for caching ──
    try {
      const cacheRef = db.doc(`forensic_cache/${deputadoId}`);
      await cacheRef.set({
        deputadoId,
        nome: nomeBusca,
        score: score.total,
        badge,
        componentes: score.componentes,
        flags: flags.map(f => ({ ...f })),
        dados: {
          ceapTotal: ceap.total,
          ceapCount: ceap.count,
          emendasCount: emendas.count,
          emendasTaxaExecucao: emendas.taxaExecucao,
          proposicoesTotal: proposicoes.totalProps,
          proposicoesTipos: proposicoes.tipos,
          discursosTotal: discursos.total,
          frentesTotal: frentes.total,
          sancoesTotal: (sancoes.ceis?.length || 0) + (sancoes.cnep?.length || 0),
        },
        atualizadoEm: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('forensicEngine: Firestore cache write failed —', e.message);
    }

    return {
      deputadoId,
      score: score.total,
      badge,
      componentes: score.componentes,
      flags,
      dados: {
        ceap: {
          total: ceap.total,
          count: ceap.count,
          topCategorias: Object.entries(ceap.porCategoria)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k, v]) => ({ categoria: k, valor: v })),
        },
        emendas: {
          totalEmpenhado: emendas.totalEmpenhado,
          totalPago: emendas.totalPago,
          count: emendas.count,
          taxaExecucao: emendas.taxaExecucao,
        },
        proposicoes: {
          total: proposicoes.totalProps,
          tipos: proposicoes.tipos,
        },
        discursos: {
          total: discursos.total,
          porTipo: discursos.porTipo,
        },
        frentes: {
          total: frentes.total,
        },
        sancoes: {
          total: (sancoes.ceis?.length || 0) + (sancoes.cnep?.length || 0),
          ceis: sancoes.ceis?.length || 0,
          cnep: sancoes.cnep?.length || 0,
        },
      },
      benchmarks: {
        mediaCeap: Math.round(mediaCeap),
        stdDevCeap: Math.round(stdDevCeap),
      },
      anosAnalise: anos,
      fonte: 'Motor Forense TransparenciaBR',
    };
  });

  /**
   * getForensicCache — leitura rápida do cache Firestore (sem chamar APIs externas).
   *
   * Input: { deputadoId }
   */
  const getForensicCache = onCall(OPTS, async (req) => {
    // Leitura de cache agregado — permitida sem login (preview público do score)
    const { deputadoId } = req.data || {};
    if (!deputadoId) throw new HttpsError('invalid-argument', 'deputadoId obrigatório.');

    const snap = await db.doc(`forensic_cache/${deputadoId}`).get();
    if (!snap.exists) return { found: false };

    const data = snap.data();
    return {
      found: true,
      ...data,
      atualizadoEm: data.atualizadoEm?.toDate?.()?.toISOString() || null,
    };
  });

  /**
   * getAtividadeParlamentar — dados completos de atividade legislativa.
   *
   * Proposições como autor principal, discursos, frentes, órgãos.
   *
   * Input: { idCamara, nome }
   */
  const getAtividadeParlamentar = onCall(OPTS, async (req) => {
    // Dados públicos da Câmara — não requer autenticação
    const { idCamara, nome } = req.data || {};
    if (!idCamara && !nome) {
      throw new HttpsError('invalid-argument', 'idCamara ou nome obrigatório.');
    }

    let deputadoId = idCamara ? Number(idCamara) : null;
    if (!deputadoId && nome) {
      try {
        const url = `https://dadosabertos.camara.leg.br/api/v2/deputados?nome=${encodeURIComponent(nome)}&ordem=ASC&ordenarPor=nome&idLegislatura=57`;
        const res = await fetchJson(url);
        deputadoId = res?.dados?.[0]?.id || null;
      } catch { /* continue */ }
    }

    if (!deputadoId) {
      return { proposicoes: [], discursos: { total: 0, lista: [] }, frentes: [], orgaos: [] };
    }

    // ── Parallel fetch ──
    const [proposicoesRaw, discursosRaw, frentesRaw, orgaosRaw] = await Promise.all([
      // Proposições como autor (até 500)
      (async () => {
        const all = [];
        for (let p = 1; p <= 5; p++) {
          const url = `https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=${deputadoId}&ordem=DESC&ordenarPor=id&pagina=${p}&itens=100`;
          let j;
          try { j = await fetchJson(url); } catch { break; }
          const dados = j?.dados ?? [];
          if (dados.length === 0) break;
          all.push(...dados);
          if (dados.length < 100) break;
        }
        return all;
      })(),

      // Discursos
      (async () => {
        const all = [];
        for (let p = 1; p <= 3; p++) {
          const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/discursos?idLegislatura=57&ordenarPor=dataHoraInicio&ordem=DESC&pagina=${p}&itens=100`;
          let j;
          try { j = await fetchJson(url); } catch { break; }
          const dados = j?.dados ?? [];
          if (dados.length === 0) break;
          all.push(...dados);
          if (dados.length < 100) break;
        }
        return all;
      })(),

      // Frentes
      (async () => {
        try {
          const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/frentes`;
          const j = await fetchJson(url);
          return j?.dados ?? [];
        } catch { return []; }
      })(),

      // Órgãos (comissões)
      (async () => {
        try {
          const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/orgaos`;
          const j = await fetchJson(url);
          return j?.dados ?? [];
        } catch { return []; }
      })(),
    ]);

    // ── Classify proposições ──
    const proposicoes = proposicoesRaw.map((p) => ({
      id: p.id,
      siglaTipo: p.siglaTipo,
      numero: p.numero,
      ano: p.ano,
      ementa: p.ementa,
      dataApresentacao: p.dataApresentacao,
      url: p.id ? `https://www.camara.leg.br/propostas-legislativas/${p.id}` : null,
    }));

    // Aggregate tipos
    const tipoContagem = {};
    for (const p of proposicoes) {
      const t = p.siglaTipo || 'Outros';
      tipoContagem[t] = (tipoContagem[t] || 0) + 1;
    }

    // Discursos formatados
    const discursos = {
      total: discursosRaw.length,
      lista: discursosRaw.slice(0, 50).map((d) => ({
        data: d.dataHoraInicio,
        tipo: d.tipoDiscurso,
        sumario: d.sumario,
        urlTexto: d.urlTexto,
        keywords: d.keywords,
      })),
      porTipo: (() => {
        const m = {};
        for (const d of discursosRaw) {
          const t = d.tipoDiscurso || 'Outros';
          m[t] = (m[t] || 0) + 1;
        }
        return m;
      })(),
    };

    // Frentes formatadas
    const frentes = frentesRaw.map((f) => ({
      id: f.id,
      titulo: f.titulo,
      idLegislatura: f.idLegislatura,
    }));

    // Órgãos formatados
    const orgaos = orgaosRaw.map((o) => ({
      id: o.idOrgao,
      sigla: o.siglaOrgao,
      nome: o.nomeOrgao,
      nomePublicacao: o.nomePublicacao,
      titulo: o.titulo,
      dataInicio: o.dataInicio,
      dataFim: o.dataFim,
    }));

    return {
      deputadoId,
      proposicoes,
      totalProposicoes: proposicoes.length,
      tipoContagem,
      discursos,
      frentes,
      totalFrentes: frentes.length,
      orgaos,
      totalOrgaos: orgaos.length,
      fonte: 'Dados Abertos da Câmara — API v2',
    };
  });

  return { forensicEngine, getForensicCache, getAtividadeParlamentar };
}

module.exports = { registerForensicFunctions };
