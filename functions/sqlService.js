/**
 * sqlService.js - Camada de acesso SQL para Cloud SQL (PostgreSQL)
 * Alinhada ao schema.sql atual do projeto TransparenciaBR / FiscalizaPA
 *
 * Uso:
 *   const sql = require('./sqlService');
 *   const politico = await sql.getPolitico('204536', 'CAMARA');
 */

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'transparenciabr',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });

    pool.on('error', (err) => {
      console.error('[sqlService] Pool error:', err.message);
    });
  }
  return pool;
}

function toSafeLimit(limit, def = 50, max = 500) {
  const n = parseInt(limit, 10);
  if (Number.isNaN(n) || n <= 0) return def;
  return Math.min(n, max);
}

function toIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function normalizeCasa(casa) {
  return (casa || 'CAMARA').toUpperCase();
}

// ============================================
// POLITICO - Busca e listagem
// ============================================

async function getPolitico(idPolitico, casa = 'CAMARA') {
  const { rows } = await getPool().query(
    `SELECT
       id_politico,
       casa,
       nome,
       nome_urna,
       partido,
       uf,
       cargo,
       foto_url,
       email,
       id_legislatura,
       situacao,
       created_at,
       updated_at
     FROM politicos
     WHERE id_politico = $1 AND casa = $2
     LIMIT 1`,
    [toIntOrNull(idPolitico), normalizeCasa(casa)]
  );

  return rows[0] || null;
}

async function searchPoliticos({ casa, uf, partido, nome, limit = 50 } = {}) {
  const where = [];
  const params = [];
  let idx = 1;

  if (casa) {
    where.push(`casa = $${idx++}`);
    params.push(normalizeCasa(casa));
  }
  if (uf) {
    where.push(`uf = $${idx++}`);
    params.push(String(uf).toUpperCase());
  }
  if (partido) {
    where.push(`partido = $${idx++}`);
    params.push(String(partido).toUpperCase());
  }
  if (nome) {
    where.push(`LOWER(nome) LIKE $${idx++}`);
    params.push(`%${String(nome).toLowerCase()}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const lim = toSafeLimit(limit, 50, 200);
  params.push(lim);

  const { rows } = await getPool().query(
    `SELECT
       id_politico,
       casa,
       nome,
       nome_urna,
       partido,
       uf,
       cargo,
       foto_url,
       situacao
     FROM politicos
     ${whereClause}
     ORDER BY nome ASC
     LIMIT $${idx}`,
    params
  );

  return rows;
}

// ============================================
// GASTOS CEAP
// ============================================

async function getGastosCeap(politicoId, { ano, limit = 100 } = {}) {
  let where = 'WHERE politico_id = $1';
  const params = [toIntOrNull(politicoId)];
  let idx = 2;

  const anoInt = toIntOrNull(ano);
  if (anoInt) {
    where += ` AND ano = $${idx++}`;
    params.push(anoInt);
  }

  params.push(toSafeLimit(limit, 100, 500));

  const { rows } = await getPool().query(
    `SELECT
       id,
       politico_id,
       ano,
       mes,
       tipo_despesa,
       fornecedor_nome,
       cnpj_cpf,
       valor_documento,
       valor_liquido,
       url_documento,
       data_documento,
       num_documento,
       created_at
     FROM gastos_ceap
     ${where}
     ORDER BY ano DESC, mes DESC, valor_liquido DESC
     LIMIT $${idx}`,
    params
  );

  return rows;
}

async function getResumoGastos(politicoId) {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(*)::int AS total_notas,
       COALESCE(SUM(valor_liquido), 0) AS total_valor,
       COALESCE(AVG(valor_liquido), 0) AS media_valor,
       COALESCE(MAX(valor_liquido), 0) AS maior_gasto,
       MIN(ano)::int AS ano_inicio,
       MAX(ano)::int AS ano_fim
     FROM gastos_ceap
     WHERE politico_id = $1`,
    [toIntOrNull(politicoId)]
  );

  return rows[0] || {
    total_notas: 0,
    total_valor: 0,
    media_valor: 0,
    maior_gasto: 0,
    ano_inicio: null,
    ano_fim: null,
  };
}

async function getTopFornecedores(politicoId, limit = 10) {
  const { rows } = await getPool().query(
    `SELECT
       fornecedor_nome,
       cnpj_cpf,
       COALESCE(SUM(valor_liquido), 0) AS total_valor,
       COUNT(*)::int AS num_notas
     FROM gastos_ceap
     WHERE politico_id = $1
     GROUP BY fornecedor_nome, cnpj_cpf
     ORDER BY total_valor DESC
     LIMIT $2`,
    [toIntOrNull(politicoId), toSafeLimit(limit, 10, 100)]
  );

  return rows;
}

async function getGastosPorTipo(politicoId) {
  const { rows } = await getPool().query(
    `SELECT
       tipo_despesa,
       COALESCE(SUM(valor_liquido), 0) AS total_valor,
       COUNT(*)::int AS num_notas
     FROM gastos_ceap
     WHERE politico_id = $1
     GROUP BY tipo_despesa
     ORDER BY total_valor DESC`,
    [toIntOrNull(politicoId)]
  );

  return rows;
}

// ============================================
// EMENDAS
// ============================================

async function getEmendas(politicoId, { ano, limit = 100 } = {}) {
  let where = 'WHERE politico_id = $1';
  const params = [toIntOrNull(politicoId)];
  let idx = 2;

  const anoInt = toIntOrNull(ano);
  if (anoInt) {
    where += ` AND ano = $${idx++}`;
    params.push(anoInt);
  }

  params.push(toSafeLimit(limit, 100, 500));

  const { rows } = await getPool().query(
    `SELECT
       id,
       codigo_emenda,
       politico_id,
       autor_nome,
       autor_partido,
       autor_uf,
       ano,
       tipo_emenda,
       localidade,
       uf_destino,
       funcao,
       subfuncao,
       programa,
       valor_empenhado,
       valor_liquidado,
       valor_pago,
       taxa_execucao,
       criticidade,
       alertas,
       idh_local,
       is_show,
       beneficiario,
       cnpj_recebedor,
       nome_recebedor,
       created_at
     FROM emendas
     ${where}
     ORDER BY ano DESC, valor_empenhado DESC
     LIMIT $${idx}`,
    params
  );

  return rows;
}

async function getResumoEmendas(politicoId) {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(*)::int AS total_emendas,
       COALESCE(SUM(valor_empenhado), 0) AS total_empenhado,
       COALESCE(SUM(valor_pago), 0) AS total_pago,
       COUNT(DISTINCT tipo_emenda)::int AS tipos_distintos,
       COUNT(DISTINCT localidade)::int AS localidades_distintas
     FROM emendas
     WHERE politico_id = $1`,
    [toIntOrNull(politicoId)]
  );

  return rows[0] || {
    total_emendas: 0,
    total_empenhado: 0,
    total_pago: 0,
    tipos_distintos: 0,
    localidades_distintas: 0,
  };
}

// ============================================
// PRESENCA / SESSOES PLENARIO
// ============================================

async function getPresenca(politicoId, { ano } = {}) {
  let where = 'WHERE politico_id = $1';
  const params = [toIntOrNull(politicoId)];
  let idx = 2;

  const anoInt = toIntOrNull(ano);
  if (anoInt) {
    where += ` AND ano = $${idx++}`;
    params.push(anoInt);
  }

  const { rows } = await getPool().query(
    `SELECT
       COUNT(*)::int AS total_sessoes,
       COALESCE(SUM(CASE WHEN presente = TRUE THEN 1 ELSE 0 END), 0)::int AS presentes,
       COALESCE(SUM(CASE WHEN presente = FALSE THEN 1 ELSE 0 END), 0)::int AS ausentes
     FROM sessoes_plenario
     ${where}`,
    params
  );

  const r = rows[0] || { total_sessoes: 0, presentes: 0, ausentes: 0 };
  const total = Number(r.total_sessoes || 0);
  const presentes = Number(r.presentes || 0);

  return {
    ...r,
    percentual: total > 0 ? Math.round((presentes / total) * 1000) / 10 : 0,
  };
}

// ============================================
// PROPOSICOES
// ============================================

async function getProposicoes(politicoId, { tipo, limit = 50, ano } = {}) {
  let where = 'WHERE politico_id = $1';
  const params = [toIntOrNull(politicoId)];
  let idx = 2;

  if (tipo) {
    where += ` AND tipo = $${idx++}`;
    params.push(String(tipo).toUpperCase());
  }

  const anoInt = toIntOrNull(ano);
  if (anoInt) {
    where += ` AND ano = $${idx++}`;
    params.push(anoInt);
  }

  params.push(toSafeLimit(limit, 50, 200));

  const { rows } = await getPool().query(
    `SELECT
       id,
       politico_id,
       id_proposicao,
       tipo,
       numero,
       ano,
       ementa,
       situacao,
       url_inteiro_teor,
       created_at
     FROM proposicoes
     ${where}
     ORDER BY ano DESC, numero DESC
     LIMIT $${idx}`,
    params
  );

  return rows;
}

// ============================================
// RANKINGS / VIEWS
// ============================================

async function getRankingCamara(limit = 20) {
  const { rows } = await getPool().query(
    `SELECT *
     FROM v_politico_resumo
     WHERE casa = 'CAMARA'
     ORDER BY score_final DESC NULLS LAST, nome ASC
     LIMIT $1`,
    [toSafeLimit(limit, 20, 200)]
  );
  return rows;
}

async function getRankingSenado(limit = 20) {
  const { rows } = await getPool().query(
    `SELECT *
     FROM v_politico_resumo
     WHERE casa = 'SENADO'
     ORDER BY score_final DESC NULLS LAST, nome ASC
     LIMIT $1`,
    [toSafeLimit(limit, 20, 200)]
  );
  return rows;
}

async function getTopFornecedoresGeral(limit = 20) {
  const { rows } = await getPool().query(
    `SELECT *
     FROM v_top_fornecedores
     LIMIT $1`,
    [toSafeLimit(limit, 20, 200)]
  );
  return rows;
}

// ============================================
// SCORES / ALERTAS
// ============================================

async function getScores(politicoId) {
  const { rows } = await getPool().query(
    `SELECT
       id,
       politico_id,
       score_final,
       classificacao,
       eixo1_presenca,
       eixo2_protagonismo,
       eixo3_producao,
       eixo4_fiscalizacao,
       eixo5_posicionamento,
       eixo6_eficiencia,
       ranking_economia,
       percentil,
       total_gastos,
       total_emendas,
       num_gastos,
       presenca_pct,
       concentracao_top3,
       updated_at
     FROM scores
     WHERE politico_id = $1
     LIMIT 1`,
    [toIntOrNull(politicoId)]
  );

  return rows[0] || null;
}

async function getAlertas(politicoId, limit = 20) {
  const { rows } = await getPool().query(
    `SELECT
       id,
       politico_id,
       tipo,
       gravidade,
       despesa_id,
       data,
       valor,
       fornecedor,
       cnpj,
       descricao,
       detalhes,
       url_documento,
       created_at
     FROM alertas_fretamento
     WHERE politico_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [toIntOrNull(politicoId), toSafeLimit(limit, 20, 100)]
  );

  return rows;
}

// ============================================
// PERFIL COMPLETO
// ============================================

async function getPerfilCompleto(politicoId, casa = 'CAMARA') {
  const [
    politico,
    resumoGastos,
    topFornec,
    gastosPorTipo,
    resumoEmendas,
    presenca,
    proposicoes,
    scores,
    alertas,
  ] = await Promise.all([
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
    gastos: {
      resumo: resumoGastos,
      topFornecedores: topFornec,
      porTipo: gastosPorTipo,
    },
    emendas: {
      resumo: resumoEmendas,
    },
    presenca,
    proposicoes,
    scores,
    alertas,
  };
}

// ============================================
// DADOS PARA RELATORIO IA
// ============================================

async function getDadosParaRelatorioIA(politicoId, casa = 'CAMARA') {
  const perfil = await getPerfilCompleto(politicoId, casa);
  if (!perfil || !perfil.politico) return null;

  const gastosMaiores = await getPool().query(
    `SELECT
       tipo_despesa,
       fornecedor_nome,
       cnpj_cpf,
       valor_liquido,
       ano,
       mes
     FROM gastos_ceap
     WHERE politico_id = $1
     ORDER BY valor_liquido DESC
     LIMIT 20`,
    [toIntOrNull(politicoId)]
  );

  const emendasTop = await getPool().query(
    `SELECT
       codigo_emenda,
       tipo_emenda,
       valor_empenhado,
       valor_pago,
       localidade,
       uf_destino,
       ano,
       programa,
       beneficiario,
       nome_recebedor
     FROM emendas
     WHERE politico_id = $1
     ORDER BY valor_empenhado DESC
     LIMIT 15`,
    [toIntOrNull(politicoId)]
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
    const { rows } = await getPool().query(
      'SELECT NOW() as now, current_database() as db'
    );
    return { ok: true, ...rows[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ============================================
// ENCERRAMENTO
// ============================================

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  closePool,
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
