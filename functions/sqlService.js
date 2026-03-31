/**
 * sqlService.js - Camada de acesso SQL para Cloud SQL (PostgreSQL)
 * Substitui queries Firestore por SQL performatico
 * 
 * Uso: const sql = require('./sqlService');
 *      const politico = await sql.getPolitico('204536', 'CAMARA');
 */

const { Pool } = require('pg');

// Pool singleton - reaproveitado entre invocacoes
let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'transparenciabr',
      port: parseInt(process.env.DB_PORT) || 5432,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

// ============================================
// POLITICO - Busca e listagem
// ============================================

async function getPolitico(idPolitico, casa) {
  const { rows } = await getPool().query(
    `SELECT * FROM politicos WHERE id_politico = $1 AND casa = $2`,
    [String(idPolitico), casa || 'CAMARA']
  );
  return rows[0] || null;
}

async function searchPoliticos({ casa, uf, partido, nome, limit = 50 }) {
  let where = [];
  let params = [];
  let idx = 1;

  if (casa) { where.push(`casa = $${idx++}`); params.push(casa); }
  if (uf) { where.push(`uf = $${idx++}`); params.push(uf); }
  if (partido) { where.push(`sigla_partido = $${idx++}`); params.push(partido); }
  if (nome) { where.push(`LOWER(nome) LIKE $${idx++}`); params.push(`%${nome.toLowerCase()}%`); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const lim = Math.min(parseInt(limit) || 50, 200);
  params.push(lim);

  const { rows } = await getPool().query(
    `SELECT id_politico, casa, nome, sigla_partido, uf, foto_url, situacao
     FROM politicos ${whereClause}
     ORDER BY nome ASC LIMIT $${idx}`,
    params
  );
  return rows;
}

// ============================================
// GASTOS CEAP
// ============================================

async function getGastosCeap(politicoId, { ano, limit = 100 } = {}) {
  let where = 'WHERE politico_id = $1';
  let params = [String(politicoId)];
  let idx = 2;

  if (ano) { where += ` AND ano = $${idx++}`; params.push(parseInt(ano)); }
  params.push(Math.min(parseInt(limit) || 100, 500));

  const { rows } = await getPool().query(
    `SELECT * FROM gastos_ceap ${where}
     ORDER BY ano DESC, mes DESC LIMIT $${idx}`,
    params
  );
  return rows;
}

async function getResumoGastos(politicoId) {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(*) as total_notas,
       SUM(valor_liquido) as total_valor,
       AVG(valor_liquido) as media_valor,
       MAX(valor_liquido) as maior_gasto,
       MIN(ano) as ano_inicio,
       MAX(ano) as ano_fim
     FROM gastos_ceap WHERE politico_id = $1`,
    [String(politicoId)]
  );
  return rows[0];
}

async function getTopFornecedores(politicoId, limit = 10) {
  const { rows } = await getPool().query(
    `SELECT fornecedor_nome, cnpj_cpf,
       SUM(valor_liquido) as total_valor,
       COUNT(*) as num_notas
     FROM gastos_ceap WHERE politico_id = $1
     GROUP BY fornecedor_nome, cnpj_cpf
     ORDER BY total_valor DESC LIMIT $2`,
    [String(politicoId), limit]
  );
  return rows;
}

async function getGastosPorTipo(politicoId) {
  const { rows } = await getPool().query(
    `SELECT tipo_despesa,
       SUM(valor_liquido) as total_valor,
       COUNT(*) as num_notas
     FROM gastos_ceap WHERE politico_id = $1
     GROUP BY tipo_despesa
     ORDER BY total_valor DESC`,
    [String(politicoId)]
  );
  return rows;
}

// ============================================
// EMENDAS
// ============================================

async function getEmendas(politicoId, { ano, limit = 100 } = {}) {
  let where = 'WHERE politico_id = $1';
  let params = [String(politicoId)];
  let idx = 2;

  if (ano) { where += ` AND ano = $${idx++}`; params.push(parseInt(ano)); }
  params.push(Math.min(parseInt(limit) || 100, 500));

  const { rows } = await getPool().query(
    `SELECT * FROM emendas ${where}
     ORDER BY valor_empenhado DESC LIMIT $${idx}`,
    params
  );
  return rows;
}

async function getResumoEmendas(politicoId) {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(*) as total_emendas,
       SUM(valor_empenhado) as total_empenhado,
       SUM(valor_pago) as total_pago,
       COUNT(DISTINCT tipo_emenda) as tipos_distintos,
       COUNT(DISTINCT localidade_destino) as localidades_distintas
     FROM emendas WHERE politico_id = $1`,
    [String(politicoId)]
  );
  return rows[0];
}

// ============================================
// PRESENCA
// ============================================

async function getPresenca(politicoId) {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(*) as total_sessoes,
       SUM(CASE WHEN presenca = 'Presença' OR presenca = 'Presente' THEN 1 ELSE 0 END) as presentes,
       SUM(CASE WHEN presenca LIKE '%Ausên%' OR presenca = 'Ausente' THEN 1 ELSE 0 END) as ausentes
     FROM presenca WHERE politico_id = $1`,
    [String(politicoId)]
  );
  const r = rows[0];
  r.percentual = r.total_sessoes > 0
    ? Math.round((r.presentes / r.total_sessoes) * 100)
    : 0;
  return r;
}

// ============================================
// PROPOSICOES
// ============================================

async function getProposicoes(politicoId, { tipo, limit = 50 } = {}) {
  let where = 'WHERE politico_id = $1';
  let params = [String(politicoId)];
  let idx = 2;

  if (tipo) { where += ` AND tipo = $${idx++}`; params.push(tipo); }
  params.push(Math.min(parseInt(limit) || 50, 200));

  const { rows } = await getPool().query(
    `SELECT * FROM proposicoes ${where}
     ORDER BY ano DESC, numero DESC LIMIT $${idx}`,
    params
  );
  return rows;
}

// ============================================
// RANKINGS (Views)
// ============================================

async function getRankingCamara(limit = 20) {
  const { rows } = await getPool().query(
    `SELECT * FROM v_ranking_camara LIMIT $1`, [limit]
  );
  return rows;
}

async function getRankingSenado(limit = 20) {
  const { rows } = await getPool().query(
    `SELECT * FROM v_ranking_senado LIMIT $1`, [limit]
  );
  return rows;
}

async function getTopFornecedoresGeral(limit = 20) {
  const { rows } = await getPool().query(
    `SELECT * FROM v_top_fornecedores LIMIT $1`, [limit]
  );
  return rows;
}

// ============================================
// SCORES / ALERTAS
// ============================================

async function getScores(politicoId) {
  const { rows } = await getPool().query(
    `SELECT * FROM scores WHERE politico_id = $1
     ORDER BY atualizado_em DESC LIMIT 1`,
    [String(politicoId)]
  );
  return rows[0] || null;
}

async function getAlertas(politicoId, limit = 20) {
  const { rows } = await getPool().query(
    `SELECT * FROM alertas WHERE politico_id = $1
     ORDER BY criado_em DESC LIMIT $2`,
    [String(politicoId), limit]
  );
  return rows;
}

// ============================================
// PERFIL COMPLETO (agregado para pagina do parlamentar)
// ============================================

async function getPerfilCompleto(politicoId, casa = 'CAMARA') {
  const [politico, resumoGastos, topFornec, gastosPorTipo, resumoEmendas, presenca, proposicoes, scores, alertas] = await Promise.all([
    getPolitico(politicoId, casa),
    getResumoGastos(politicoId),
    getTopFornecedores(politicoId, 5),
    getGastosPorTipo(politicoId),
    getResumoEmendas(politicoId),
    getPresenca(politicoId),
    getProposicoes(politicoId, { limit: 10 }),
    getScores(politicoId),
    getAlertas(politicoId, 10),
  ]);

  return {
    politico,
    gastos: { resumo: resumoGastos, topFornecedores: topFornec, porTipo: gastosPorTipo },
    emendas: { resumo: resumoEmendas },
    presenca,
    proposicoes,
    scores,
    alertas,
  };
}

// ============================================
// DADOS PARA RELATORIO IA (prompt enrichment)
// ============================================

async function getDadosParaRelatorioIA(politicoId, casa = 'CAMARA') {
  const perfil = await getPerfilCompleto(politicoId, casa);
  if (!perfil.politico) return null;

  const gastosMaiores = await getPool().query(
    `SELECT tipo_despesa, fornecedor_nome, cnpj_cpf, valor_liquido, ano, mes
     FROM gastos_ceap WHERE politico_id = $1
     ORDER BY valor_liquido DESC LIMIT 20`,
    [String(politicoId)]
  );

  const emendasTop = await getPool().query(
    `SELECT numero_emenda, tipo_emenda, valor_empenhado, valor_pago, localidade_destino, ano
     FROM emendas WHERE politico_id = $1
     ORDER BY valor_empenhado DESC LIMIT 15`,
    [String(politicoId)]
  );

  return {
    ...perfil,
    gastosMaiores: gastosMaiores.rows,
    emendasDetalhadas: emendasTop.rows,
  };
}

// ============================================
// HEALTH CHECK
// ============================================

async function healthCheck() {
  try {
    const { rows } = await getPool().query('SELECT NOW() as now, current_database() as db');
    return { ok: true, ...rows[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getPool,
  getPolitico,
  searchPoliticos,
  getGastosCeap,
  getResumoGastos,
  getTopFornecedores,
  getGastosPorTipo,
  getEmendas,
  getResumoEmendas,
  getPresenca,
  getProposicoes,
  getRankingCamara,
  getRankingSenado,
  getTopFornecedoresGeral,
  getScores,
  getAlertas,
  getPerfilCompleto,
  getDadosParaRelatorioIA,
  healthCheck,
};
