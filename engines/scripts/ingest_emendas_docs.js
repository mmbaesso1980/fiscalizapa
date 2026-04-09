/**
 * ingest_emendas_docs.js
 * 
 * Ingere CSVs de "Emendas parlamentares por Documentos de Despesa"
 * baixados do Portal da Transparencia para o Cloud SQL.
 *
 * Uso:
 *   cd functions && npm install pg csv-parse iconv-lite
 *   node ../engines/scripts/ingest_emendas_docs.js ../data/emendas_docs_2024.csv
 *
 * Os CSVs usam separador ";" e encoding latin1 (ISO-8859-1).
 * Baixe em: https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares-documentos
 *
 * Requer:
 *   - Cloud SQL Proxy rodando na porta 5432
 *   - Schema ja aplicado (sql/schema.sql)
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { parse } = require('csv-parse');
const iconv = require('iconv-lite');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'fiscalizapa',
  user: 'fiscalizapa',
  password: process.env.DB_PASSWORD || 'fiscalizapa123',
  max: 5,
});

const BATCH_SIZE = 500;

// Mapeamento dos headers do CSV para campos do banco
const CSV_MAP = {
  'Código da Emenda': 'codigo_emenda',
  'Ano da Emenda': 'ano_emenda',
  'Código do Autor da Emenda': 'codigo_autor',
  'Nome do Autor da Emenda': 'nome_autor',
  'Número da Emenda': 'numero_emenda',
  'Tipo de Emenda': 'tipo_emenda',
  'Fase da Despesa': 'fase_despesa',
  'Data Documento': 'data_documento',
  'Código Documento': 'codigo_documento',
  'Valor Empenhado': 'valor_empenhado',
  'Valor Pago': 'valor_pago',
  'Código Favorecido': 'codigo_favorecido',
  'Favorecido': 'nome_favorecido',
  'Tipo Favorecido': 'tipo_favorecido',
  'UF Favorecido': 'uf_favorecido',
  'Município Favorecido': 'municipio_favorecido',
  'Localidade de Aplicação do Recurso': 'localidade_aplicacao',
  'UF de Aplicação do Recurso': 'uf_aplicacao',
  'Município de Aplicação do Recurso': 'municipio_aplicacao',
  'Código IBGE do Município de Aplicação do Recurso': 'codigo_ibge_municipio',
  'Código UG': 'codigo_ug',
  'UG': 'nome_ug',
  'Código Órgão SIAFI': 'codigo_orgao',
  'Órgão': 'nome_orgao',
  'Código Órgão Superior SIAFI': 'codigo_orgao_superior',
  'Órgão Superior': 'nome_orgao_superior',
  'Código Função': 'codigo_funcao',
  'Função': 'nome_funcao',
  'Código Subfunção': 'codigo_subfuncao',
  'Subfunção': 'nome_subfuncao',
  'Código Programa': 'codigo_programa',
  'Programa': 'nome_programa',
  'Código Ação': 'codigo_acao',
  'Ação': 'nome_acao',
  'Grupo Despesa': 'grupo_despesa',
  'Elemento Despesa': 'elemento_despesa',
  'Modalidade Aplicação Despesa': 'modalidade_aplicacao',
  'Possui convênio?': 'possui_convenio',
};

function parseDate(str) {
  if (!str || str === '-') return null;
  // Formato DD/MM/YYYY
  const parts = str.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return str;
}

function parseNumber(str) {
  if (!str || str === '-' || str === '') return 0;
  // Formato brasileiro: 1.234,56
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function parseBool(str) {
  if (!str) return false;
  return str.toUpperCase() === 'SIM' || str === 'true' || str === '1';
}

async function ingestCSV(filePath) {
  console.log(`\n=== Ingestao: ${path.basename(filePath)} ===`);
  
  const buffer = fs.readFileSync(filePath);
  const content = iconv.decode(buffer, 'latin1');
  
  const records = [];
  const parser = parse(content, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  });
  
  for await (const row of parser) {
    const mapped = {};
    for (const [csvCol, dbCol] of Object.entries(CSV_MAP)) {
      mapped[dbCol] = row[csvCol] || null;
    }
    records.push(mapped);
  }
  
  console.log(`Lidos ${records.length} registros`);
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const r of batch) {
        try {
          await client.query(`
            INSERT INTO emendas_documentos (
              codigo_emenda, ano_emenda, codigo_autor, nome_autor,
              numero_emenda, tipo_emenda, fase_despesa, data_documento,
              codigo_documento, valor_empenhado, valor_pago,
              codigo_favorecido, nome_favorecido, tipo_favorecido,
              uf_favorecido, municipio_favorecido,
              localidade_aplicacao, uf_aplicacao, municipio_aplicacao,
              codigo_ibge_municipio, codigo_ug, nome_ug,
              codigo_orgao, nome_orgao, codigo_orgao_superior,
              nome_orgao_superior, codigo_funcao, nome_funcao,
              codigo_subfuncao, nome_subfuncao, codigo_programa,
              nome_programa, codigo_acao, nome_acao,
              grupo_despesa, elemento_despesa, modalidade_aplicacao,
              possui_convenio
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
              $31,$32,$33,$34,$35,$36,$37,$38
            ) ON CONFLICT (codigo_emenda, codigo_documento, fase_despesa)
            DO UPDATE SET
              valor_empenhado = EXCLUDED.valor_empenhado,
              valor_pago = EXCLUDED.valor_pago,
              nome_favorecido = EXCLUDED.nome_favorecido,
              data_documento = EXCLUDED.data_documento
          `, [
            r.codigo_emenda,
            r.ano_emenda ? parseInt(r.ano_emenda) : null,
            r.codigo_autor,
            r.nome_autor,
            r.numero_emenda,
            r.tipo_emenda,
            r.fase_despesa,
            parseDate(r.data_documento),
            r.codigo_documento,
            parseNumber(r.valor_empenhado),
            parseNumber(r.valor_pago),
            r.codigo_favorecido,
            r.nome_favorecido,
            r.tipo_favorecido,
            r.uf_favorecido,
            r.municipio_favorecido,
            r.localidade_aplicacao,
            r.uf_aplicacao,
            r.municipio_aplicacao,
            r.codigo_ibge_municipio,
            r.codigo_ug,
            r.nome_ug,
            r.codigo_orgao,
            r.nome_orgao,
            r.codigo_orgao_superior,
            r.nome_orgao_superior,
            r.codigo_funcao,
            r.nome_funcao,
            r.codigo_subfuncao,
            r.nome_subfuncao,
            r.codigo_programa,
            r.nome_programa,
            r.codigo_acao,
            r.nome_acao,
            r.grupo_despesa,
            r.elemento_despesa,
            r.modalidade_aplicacao,
            parseBool(r.possui_convenio),
          ]);
          inserted++;
        } catch (e) {
          errors++;
          if (errors <= 5) console.error(`  Erro linha: ${e.message.substring(0, 100)}`);
        }
      }
      
      await client.query('COMMIT');
      process.stdout.write(`\r  Progresso: ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} (${inserted} ok, ${errors} erros)`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`\n  Batch erro: ${e.message}`);
    } finally {
      client.release();
    }
  }
  
  console.log(`\n  Finalizado: ${inserted} inseridos, ${errors} erros`);
}

async function main() {
  const files = process.argv.slice(2);
  
  if (files.length === 0) {
    console.log('Uso: node ingest_emendas_docs.js <arquivo1.csv> [arquivo2.csv] ...');
    console.log('\nBaixe os CSVs em:');
    console.log('  https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares-documentos');
    console.log('\nExemplo:');
    console.log('  node ../engines/scripts/ingest_emendas_docs.js ../data/*.csv');
    process.exit(1);
  }
  
  // Verificar conexao
  try {
    const res = await pool.query('SELECT COUNT(*) FROM emendas_documentos');
    console.log(`Banco conectado. Registros existentes: ${res.rows[0].count}`);
  } catch (e) {
    if (e.message.includes('does not exist')) {
      console.log('Tabela nao existe. Rode: psql -f engines/sql/schema.sql');
      process.exit(1);
    }
    console.error('Erro conexao:', e.message);
    process.exit(1);
  }
  
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`Arquivo nao encontrado: ${f}`);
      continue;
    }
    await ingestCSV(f);
  }
  
  // Stats finais
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT codigo_emenda) as emendas,
      COUNT(DISTINCT nome_autor) as autores,
      COUNT(DISTINCT nome_favorecido) as favorecidos,
      COUNT(DISTINCT fase_despesa) as fases
    FROM emendas_documentos
  `);
  console.log('\n=== Estatisticas finais ===');
  console.log(stats.rows[0]);
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
