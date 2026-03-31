/**
 * migrate_firestore_to_sql.js
 * Migra dados do Firestore para Cloud SQL (PostgreSQL)
 * 
 * Uso:
 *   cd functions && npm install pg
 *   node ../scripts/migrate_firestore_to_sql.js
 * 
 * Requer:
 *   - GOOGLE_APPLICATION_CREDENTIALS configurado
 *   - Cloud SQL Proxy rodando na porta 5432
 *   - Schema ja aplicado (sql/schema.sql)
 */

const admin = require('firebase-admin');
const { Pool } = require('pg');

// Inicializa Firebase
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fiscallizapa' });
}
const db = admin.firestore();

// Pool PostgreSQL (via Cloud SQL Proxy)
const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'transparenciabr',
  user: 'postgres',
  password: process.env.DB_PASSWORD || '',
});

const BATCH_SIZE = 500;
let stats = { politicos: 0, gastos: 0, emendas: 0, presenca: 0, proposicoes: 0 };

async function migratePoliticos(casa) {
  const collection = casa === 'CAMARA' ? 'deputados_federais' : 'senadores';
  console.log(`\n=== Migrando ${collection} ===`);
  
  const snapshot = await db.collection(collection).get();
  console.log(`  Total docs: ${snapshot.size}`);
  
  for (const doc of snapshot.docs) {
    const d = doc.data();
    const politicoId = doc.id;
    
    try {
      await pool.query(
        `INSERT INTO politicos (id_politico, casa, nome, nome_civil, sigla_partido, uf,
         foto_url, email, situacao, legislatura, cpf, data_nascimento, sexo, escolaridade,
         url_website, dados_raw, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
         ON CONFLICT (id_politico, casa) DO UPDATE SET
           nome=EXCLUDED.nome, sigla_partido=EXCLUDED.sigla_partido,
           uf=EXCLUDED.uf, foto_url=EXCLUDED.foto_url,
           situacao=EXCLUDED.situacao, dados_raw=EXCLUDED.dados_raw,
           atualizado_em=NOW()`,
        [
          politicoId, casa,
          d.nome || d.ultimoStatus?.nome || '',
          d.nomeCivil || d.nomeCompleto || '',
          d.siglaPartido || d.ultimoStatus?.siglaPartido || '',
          d.uf || d.ultimoStatus?.siglaUf || '',
          d.urlFoto || d.ultimoStatus?.urlFoto || '',
          d.email || '',
          d.ultimoStatus?.situacao || d.situacao || 'ATIVO',
          d.ultimoStatus?.idLegislatura || 57,
          d.cpf || '',
          d.dataNascimento || null,
          d.sexo || '',
          d.escolaridade || '',
          d.urlWebsite || '',
          JSON.stringify(d)
        ]
      );
      stats.politicos++;
      
      // Migrar subcollections
      await migrateGastos(collection, politicoId, casa);
      await migrateEmendas(collection, politicoId);
      await migratePresenca(collection, politicoId);
      await migrateProposicoes(collection, politicoId);
      
      if (stats.politicos % 50 === 0) {
        console.log(`  Politicos migrados: ${stats.politicos}`);
      }
    } catch (err) {
      console.error(`  ERRO politico ${politicoId}:`, err.message);
    }
  }
}

async function migrateGastos(collection, politicoId, casa) {
  const gastoSnap = await db.collection(collection)
    .doc(politicoId).collection('gastos_ceap').get();
  
  if (gastoSnap.empty) return;
  
  for (const gdoc of gastoSnap.docs) {
    const g = gdoc.data();
    try {
      await pool.query(
        `INSERT INTO gastos_ceap (politico_id, casa, ano, mes, tipo_despesa,
         fornecedor_nome, cnpj_cpf, valor_documento, valor_liquido,
         valor_glosa, num_documento, url_documento, dados_raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT DO NOTHING`,
        [
          politicoId, casa,
          g.ano || g.numAno || new Date().getFullYear(),
          g.mes || g.numMes || 1,
          g.tipoDespesa || g.descricao || '',
          g.nomeFornecedor || g.fornecedor || '',
          g.cnpjCpfFornecedor || g.cnpjCpf || '',
          parseFloat(g.valorDocumento) || 0,
          parseFloat(g.valorLiquido) || parseFloat(g.valorDocumento) || 0,
          parseFloat(g.valorGlosa) || 0,
          g.numDocumento || g.codDocumento || '',
          g.urlDocumento || '',
          JSON.stringify(g)
        ]
      );
      stats.gastos++;
    } catch (err) {
      // skip duplicates
    }
  }
}

async function migrateEmendas(collection, politicoId) {
  const emendasSnap = await db.collection(collection)
    .doc(politicoId).collection('emendas').get();
  
  if (emendasSnap.empty) return;
  
  for (const edoc of emendasSnap.docs) {
    const e = edoc.data();
    try {
      await pool.query(
        `INSERT INTO emendas (politico_id, numero_emenda, ano, tipo_emenda,
         valor_empenhado, valor_pago, valor_resto_pagar, localidade_destino,
         funcao, subfuncao, dados_raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT DO NOTHING`,
        [
          politicoId,
          e.numeroEmenda || e.numero || edoc.id,
          e.ano || new Date().getFullYear(),
          e.tipoEmenda || e.tipo || '',
          parseFloat(e.valorEmpenhado) || 0,
          parseFloat(e.valorPago) || 0,
          parseFloat(e.valorRestoPagar) || 0,
          e.localidadeDestino || e.localidade || '',
          e.funcao || '',
          e.subfuncao || '',
          JSON.stringify(e)
        ]
      );
      stats.emendas++;
    } catch (err) {}
  }
}

async function migratePresenca(collection, politicoId) {
  const presSnap = await db.collection(collection)
    .doc(politicoId).collection('presenca').get();
  
  if (presSnap.empty) return;
  
  for (const pdoc of presSnap.docs) {
    const p = pdoc.data();
    try {
      await pool.query(
        `INSERT INTO presenca (politico_id, data_sessao, tipo_sessao,
         presenca, justificativa, dados_raw)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [
          politicoId,
          p.data || p.dataSessao || pdoc.id,
          p.tipo || p.descricao || '',
          p.frequencia || p.presenca || '',
          p.justificativa || '',
          JSON.stringify(p)
        ]
      );
      stats.presenca++;
    } catch (err) {}
  }
}

async function migrateProposicoes(collection, politicoId) {
  const propSnap = await db.collection(collection)
    .doc(politicoId).collection('proposicoes').get();
  
  if (propSnap.empty) return;
  
  for (const pdoc of propSnap.docs) {
    const p = pdoc.data();
    try {
      await pool.query(
        `INSERT INTO proposicoes (politico_id, id_proposicao, tipo, numero,
         ano, ementa, situacao, url_inteiro_teor, dados_raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING`,
        [
          politicoId,
          p.id || pdoc.id,
          p.siglaTipo || p.tipo || '',
          parseInt(p.numero) || 0,
          p.ano || new Date().getFullYear(),
          p.ementa || '',
          p.statusProposicao?.descricaoSituacao || p.situacao || '',
          p.urlInteiroTeor || '',
          JSON.stringify(p)
        ]
      );
      stats.proposicoes++;
    } catch (err) {}
  }
}

async function migrateUsers() {
  console.log('\n=== Migrando users ===');
  const usersSnap = await db.collection('users').get();
  
  for (const udoc of usersSnap.docs) {
    const u = udoc.data();
    try {
      await pool.query(
        `INSERT INTO users (firebase_uid, email, nome, plano, creditos_restantes, criado_em)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (firebase_uid) DO UPDATE SET
           email=EXCLUDED.email, plano=EXCLUDED.plano,
           creditos_restantes=EXCLUDED.creditos_restantes`,
        [
          udoc.id,
          u.email || '',
          u.displayName || u.nome || '',
          u.plan || u.plano || 'free',
          u.credits || u.creditos || 0,
          u.createdAt ? new Date(u.createdAt._seconds * 1000) : new Date()
        ]
      );
    } catch (err) {
      console.error(`  ERRO user ${udoc.id}:`, err.message);
    }
  }
  console.log(`  Users migrados: ${usersSnap.size}`);
}

async function main() {
  console.log('==========================================');
  console.log('  MIGRACAO FIRESTORE -> CLOUD SQL');
  console.log('  Projeto: fiscallizapa');
  console.log('==========================================');
  
  const start = Date.now();
  
  try {
    // Testar conexao
    const res = await pool.query('SELECT NOW()');
    console.log(`\nConectado ao PostgreSQL: ${res.rows[0].now}`);
    
    // Migrar politicos (Camara + Senado)
    await migratePoliticos('CAMARA');
    await migratePoliticos('SENADO');
    
    // Migrar users
    await migrateUsers();
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('\n==========================================');
    console.log('  MIGRACAO CONCLUIDA!');
    console.log(`  Tempo: ${elapsed}s`);
    console.log(`  Politicos: ${stats.politicos}`);
    console.log(`  Gastos CEAP: ${stats.gastos}`);
    console.log(`  Emendas: ${stats.emendas}`);
    console.log(`  Presenca: ${stats.presenca}`);
    console.log(`  Proposicoes: ${stats.proposicoes}`);
    console.log('==========================================');
    
  } catch (err) {
    console.error('ERRO FATAL:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
