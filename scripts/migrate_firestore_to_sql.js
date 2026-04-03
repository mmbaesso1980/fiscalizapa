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
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'transparenciabr',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});
function parseMoney(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v
      .replace(/\s/g, '')
      .replace(/^R\$\s?/, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
let stats = { politicos: 0, gastos: 0, emendas: 0, presenca: 0, proposicoes: 0, users: 0 };

// ==========================================
// POLITICOS
// ==========================================
async function migratePoliticos(casa) {
  const colName = casa === 'CAMARA' ? 'deputados_federais' : 'senadores';
  console.log(`\n=== Migrando ${colName} (${casa}) ===`);
  const snapshot = await db.collection(colName).get();
  console.log(`  Total docs: ${snapshot.size}`);

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const politicoId = parseInt(doc.id.replace(/^(dep_|sen_)/, '')) || 0;
    if (!politicoId) { console.warn(`  SKIP ${doc.id}: id nao numerico`); continue; }
    try {
      await pool.query(
        `INSERT INTO politicos (id_politico, casa, nome, nome_urna, partido, uf, cargo, foto_url, email, situacao, id_legislatura, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
        ON CONFLICT (id_politico) DO UPDATE SET
          casa=EXCLUDED.casa, nome=EXCLUDED.nome, partido=EXCLUDED.partido,
          uf=EXCLUDED.uf, foto_url=EXCLUDED.foto_url, situacao=EXCLUDED.situacao, updated_at=NOW()`,
        [
          politicoId, casa,
          d.nome || d.ultimoStatus?.nome || '',
          d.nomeUrna || d.nome || '',
          d.siglaPartido || d.partido || d.ultimoStatus?.siglaPartido || '',
          d.uf || d.siglaUf || d.ultimoStatus?.siglaUf || '',
          d.cargo || (casa === 'CAMARA' ? 'Deputado Federal' : 'Senador'),
          d.urlFoto || d.foto || d.ultimoStatus?.urlFoto || '',
          d.email || '',
          d.ultimoStatus?.situacao || d.situacao || 'Exercicio',
          d.ultimoStatus?.idLegislatura || d.idLegislatura || 57
        ]
      );
      stats.politicos++;
      await migrateGastos(colName, doc.id, politicoId);
      await migratePresenca(colName, doc.id, politicoId);
      await migrateProposicoes(colName, doc.id, politicoId);
      if (stats.politicos % 50 === 0) console.log(`  Politicos: ${stats.politicos}`);
    } catch (err) {
      console.error(`  ERRO politico ${doc.id}:`, err.message);
    }
  }
}

// ==========================================
// GASTOS CEAP (subcol gastos de cada politico)
// ==========================================
async function migrateGastos(colName, firestoreId, politicoId) {
  const snap = await db.collection(colName).doc(firestoreId).collection('gastos').get();
  if (snap.empty) return;
  for (const gdoc of snap.docs) {
    const g = gdoc.data();
    try {
      await pool.query(
        `INSERT INTO gastos_ceap (politico_id, ano, mes, tipo_despesa, fornecedor_nome,
          cnpj_cpf, valor_documento, valor_liquido, url_documento, data_documento, num_documento)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT DO NOTHING`,
        [
          politicoId,
          g.ano || g.numAno || new Date().getFullYear(),
          g.mes || g.numMes || 1,
          g.tipoDespesa || g.descricao || g.tipo || '',
          g.nomeFornecedor || g.fornecedorNome || g.fornecedor || '',
          g.cnpjCpfFornecedor || g.cnpjCpf || g.cnpj || '',
          parseMoney(g.valorDocumento),
parseMoney(g.valorLiquido) || parseMoney(g.valorDocumento) || parseMoney(g.valor),
          g.urlDocumento || g.url || '',
         (g.dataDocumento && g.dataDocumento.length >= 10)
  ? g.dataDocumento.substring(0, 10)
  : null,
          g.numDocumento || g.codDocumento || ''
        ]
      );
      stats.gastos++;
    } catch (err) { /* skip duplicates */ }
  }
}

// ==========================================
// EMENDAS - le da colecao RAIZ 'emendas' (preenchida pelo run-ingest-emendas-v4)
// Usa ON CONFLICT (codigo_emenda) DO UPDATE para idempotencia
// ==========================================
async function migrateEmendas() {
  console.log('\n=== Migrando emendas (colecao raiz) ===');
  const snapshot = await db.collection('emendas').get();
  console.log(`  Total docs: ${snapshot.size}`);

  for (const edoc of snapshot.docs) {
    const e = edoc.data();
    // politico_id: converter para inteiro
    const pid = parseInt(String(e.parlamentarId || e.autorId || '').replace(/^(dep_|sen_)/, '')) || 0;
    // codigo_emenda: usar codigo se existir, senao gerar deterministico
    const codigo = e.codigo || e.codigoEmenda || `${pid}_${e.ano || 0}_${edoc.id}`;

    try {
    await pool.query(
  `INSERT INTO emendas (
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
      nome_recebedor
    )
    VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,
      $16,$17,$18,$19,$20,
      $21,$22,$23
    )
    ON CONFLICT (codigo_emenda) DO UPDATE SET
      valor_empenhado = EXCLUDED.valor_empenhado,
      valor_liquidado = EXCLUDED.valor_liquidado,
      valor_pago      = EXCLUDED.valor_pago,
      taxa_execucao   = EXCLUDED.taxa_execucao,
      criticidade     = EXCLUDED.criticidade,
      alertas         = EXCLUDED.alertas,
      beneficiario    = EXCLUDED.beneficiario,
      cnpj_recebedor  = EXCLUDED.cnpj_recebedor,
      nome_recebedor  = EXCLUDED.nome_recebedor`,
  [
    e.codigo || e.codigoEmenda || doc.id,
    parseInt(e.parlamentarId, 10) || null,
    e.autorNome || '',
    e.autorPartido || '',
    e.autorUf || '',
    e.ano || null,
    e.tipo || e.tipoEmenda || '',
    e.localidade || '',
    e.uf || e.uf_destino || e.autorUf || '',
    e.funcao || '',
    e.subfuncao || '',
    e.programa || '',
    parseMoney(e.valorEmpenhado),
    parseMoney(e.valorLiquidado),
    parseMoney(e.valorPago),
    e.taxaExecucao || 0,
    e.criticidade || 'BAIXA',
    e.alertas || [],
    e.idhLocal || null,
    e.isShow === true,
    e.beneficiario || e.nomeFavorecido || '',
    e.cnpjRecebedor || e.codigoFavorecido || '',
    e.nomeRecebedor || e.nomeFavorecido || '',
  ]
);
      stats.emendas++;
    } catch (err) {
      if (!err.message.includes('violates foreign key')) {
        console.error(`  ERRO emenda ${codigo}:`, err.message);
      }
    }
  }
  console.log(`  Emendas migradas: ${stats.emendas}`);
}


// PRESENCA
async function migratePresenca(colName, firestoreId, politicoId) {
  let snap = await db.collection(colName).doc(firestoreId).collection('presencas').get();
  if (snap.empty) snap = await db.collection(colName).doc(firestoreId).collection('sessoes').get();
  if (snap.empty) return;
  for (const pdoc of snap.docs) {
    const p = pdoc.data();
    try {
      await pool.query(
        `INSERT INTO sessoes_plenario (politico_id, data_sessao, tipo_sessao, ano, presente, justificativa)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [politicoId, p.data || p.dataSessao || pdoc.id, p.tipo || p.descricao || '',
         parseInt(p.ano) || new Date().getFullYear(),
         p.frequencia === 'Presenca' || p.presente === true, p.justificativa || '']
      );
      stats.presenca++;
    } catch (err) {}
  }
}

// PROPOSICOES
async function migrateProposicoes(colName, firestoreId, politicoId) {
  const snap = await db.collection(colName).doc(firestoreId).collection('proposicoes').get();
  if (snap.empty) return;
  for (const pdoc of snap.docs) {
    const p = pdoc.data();
    try {
      await pool.query(
        `INSERT INTO proposicoes (politico_id, id_proposicao, tipo, numero, ano, ementa, situacao, url_inteiro_teor)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [politicoId, p.id || pdoc.id, p.siglaTipo || p.tipo || '',
         parseInt(p.numero) || 0, p.ano || new Date().getFullYear(),
         p.ementa || '', p.statusProposicao?.descricaoSituacao || p.situacao || '',
         p.urlInteiroTeor || '']
      );
      stats.proposicoes++;
    } catch (err) {}
  }
}

// USERS
async function migrateUsers() {
  console.log('\n=== Migrando users ===');
  const snap = await db.collection('users').get();
  for (const udoc of snap.docs) {
    const u = udoc.data();
    try {
      await pool.query(
        `INSERT INTO users (firebase_uid, email, nome, plano, creditos_restantes, criado_em)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (firebase_uid) DO UPDATE SET
          email=EXCLUDED.email, plano=EXCLUDED.plano, creditos_restantes=EXCLUDED.creditos_restantes`,
        [udoc.id, u.email || '', u.displayName || u.nome || '',
         u.plan || u.plano || 'free', u.credits || u.creditos || 0,
         u.createdAt ? new Date(u.createdAt._seconds * 1000) : new Date()]
      );
      stats.users++;
    } catch (err) { console.error(`  ERRO user ${udoc.id}:`, err.message); }
  }
  console.log(`  Users migrados: ${snap.size}`);
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  console.log('==========================================');
  console.log(' MIGRACAO FIRESTORE -> CLOUD SQL');
  console.log(' Projeto: fiscallizapa');
  console.log('==========================================');
  const start = Date.now();
  try {
    const res = await pool.query('SELECT NOW()');
    console.log(`\nConectado ao PostgreSQL: ${res.rows[0].now}`);

    // 1. Migrar politicos (inclui gastos, presenca, proposicoes como subcollections)
    await migratePoliticos('CAMARA');
    await migratePoliticos('SENADO');

    // 2. Migrar emendas da colecao raiz (preenchida pelo run-ingest-emendas-v4)
    await migrateEmendas();

    // 3. Migrar users
    await migrateUsers();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('\n==========================================');
    console.log(' MIGRACAO CONCLUIDA!');
    console.log(` Tempo: ${elapsed}s`);
    console.log(` Politicos: ${stats.politicos}`);
    console.log(` Gastos CEAP: ${stats.gastos}`);
    console.log(` Emendas: ${stats.emendas}`);
    console.log(` Presenca: ${stats.presenca}`);
    console.log(` Proposicoes: ${stats.proposicoes}`);
    console.log(` Users: ${stats.users}`);
    console.log('==========================================');
  } catch (err) {
    console.error('ERRO FATAL:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();


