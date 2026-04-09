/**
 * ASMODEUS - Auditoria Sistêmica e Monitoramento Ostensivo de Desvios,
 * Esquemas e Usurpações Sociopolíticas
 *
 * Backend mínimo v1.0 — Firebase Cloud Functions
 * Núcleo: BigQuery (projeto-codex-br / us-central1) + Firestore + Auth + Stripe
 *
 * ARQUITETURA DE PROJETOS:
 *   fiscalizapa-e3fd4  → Firebase (Auth, Firestore, Storage, Functions) — southamerica-east1
 *   projeto-codex-br   → BigQuery dataset dados_camara — us-central1 (Iowa) — economia
 *
 * TransparênciaBR = interface/produto (o que o usuário vê)
 * ASMODEUS        = cérebro investigativo + database
 */

'use strict';

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { BigQuery } = require('@google-cloud/bigquery');
const { Storage } = require('@google-cloud/storage');
const Stripe = require('stripe');
const https = require('https');

admin.initializeApp();
const db = admin.firestore();

const bq = new BigQuery({ projectId: 'projeto-codex-br' });
const gcs = new Storage();

const DATASET = 'dados_camara';
const BQ_LOCATION = 'us-central1'; // Iowa — onde o dataset dados_camara está armazenado
const REGION = 'southamerica-east1'; // Functions ficam perto dos usuários BR
const OPTS = { region: REGION };

// Stripe inicializado lazy — evita crash quando STRIPE_SECRET_KEY não está
// disponível em tempo de análise estática (firebase deploy --only functions)
let _stripe = null;
const getStripe = () => {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new HttpsError('internal', 'STRIPE_SECRET_KEY não configurado.');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
};

// ─────────────────────────────────────────────
// 1. HEALTH CHECK
// ─────────────────────────────────────────────
exports.health = onRequest(OPTS, (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    firebase_project: 'fiscalizapa-e3fd4',
    bigquery_project: 'projeto-codex-br',
    bigquery_location: BQ_LOCATION,
    functions_region: REGION,
    timestamp: new Date().toISOString(),
    engine: 'ASMODEUS v1'
  });
});

// ─────────────────────────────────────────────
// 2. PING BIGQUERY (diagnóstico)
// ─────────────────────────────────────────────
exports.bigQueryPing = onRequest(OPTS, async (req, res) => {
  try {
    const [rows] = await bq.query({
      query: `SELECT COUNT(*) as total FROM \`projeto-codex-br.${DATASET}.auditoria_completa_2023\` LIMIT 1`,
      location: BQ_LOCATION
    });
    res.json({ status: 'ok', totalRows: rows[0]?.total ?? 0, location: BQ_LOCATION });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ─────────────────────────────────────────────
// 3. LISTAR TABELAS DO DATASET
// ─────────────────────────────────────────────
exports.listTables = onCall(OPTS, async (req) => {
  const [tables] = await bq.dataset(DATASET).getTables();
  return tables.map(t => ({
    id: t.id,
    kind: t.metadata?.kind,
    created: t.metadata?.creationTime
  }));
});

// ─────────────────────────────────────────────
// 4. QUERY CONTROLADA NO BIGQUERY
//    Aceita: tabela + filtros opcionais
//    Retorna: até 500 linhas (seguro)
// ─────────────────────────────────────────────
exports.runQuery = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const { table, where, limit = 50, offset = 0 } = req.data || {};
  if (!table) throw new HttpsError('invalid-argument', 'Parâmetro table obrigatório.');

  const ALLOWED = [
    'auditoria_completa_2023',
    'emendas_parlamentares',
    'deputados_federais',
    'senadores',
    'votacoes',
    'proposicoes'
  ];
  if (!ALLOWED.includes(table)) throw new HttpsError('permission-denied', 'Tabela não permitida.');

  const safeLimit = Math.min(Number(limit) || 50, 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const whereClause = where ? `WHERE ${where.replace(/[;"'`]/g, '')}` : '';

  const query = `
    SELECT *
    FROM \`projeto-codex-br.${DATASET}.${table}\`
    ${whereClause}
    LIMIT ${safeLimit}
    OFFSET ${safeOffset}
  `;

  const [rows] = await bq.query({ query, location: BQ_LOCATION });
  return { rows, count: rows.length };
});

// ─────────────────────────────────────────────
// 5. LISTAR ARQUIVOS DO CLOUD STORAGE
// ─────────────────────────────────────────────
exports.listStorageFiles = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const { bucket = 'fiscalizapa-e3fd4.appspot.com', prefix = '' } = req.data || {};
  const [files] = await gcs.bucket(bucket).getFiles({ prefix });
  return files.map(f => ({
    name: f.name,
    size: f.metadata?.size,
    updated: f.metadata?.updated,
    contentType: f.metadata?.contentType
  }));
});

// ─────────────────────────────────────────────
// 6. SIGNED URL para download seguro
// ─────────────────────────────────────────────
exports.getSignedUrl = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const { bucket = 'fiscalizapa-e3fd4.appspot.com', filePath } = req.data || {};
  if (!filePath) throw new HttpsError('invalid-argument', 'filePath obrigatório.');

  const [url] = await gcs.bucket(bucket).file(filePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000 // 15 min
  });
  return { url };
});

// ─────────────────────────────────────────────
// 7. CRIAR CHECKOUT STRIPE
// ─────────────────────────────────────────────
exports.createCheckoutSession = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const { priceId, successUrl, cancelUrl } = req.data || {};
  if (!priceId) throw new HttpsError('invalid-argument', 'priceId obrigatório.');

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { uid }
  });

  return { sessionId: session.id, url: session.url };
});

// ─────────────────────────────────────────────
// 8. WEBHOOK STRIPE
// ─────────────────────────────────────────────
exports.stripeWebhook = onRequest(
  { ...OPTS, invoker: 'public' },
  async (req, res) => {
    const stripe = getStripe();
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (e) {
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const uid = session.metadata?.uid;
      if (uid) {
        await db.doc(`users/${uid}`).set(
          { plan: 'premium', stripeCustomerId: session.customer, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const snap = await db.collection('users').where('stripeCustomerId', '==', sub.customer).limit(1).get();
      snap.forEach(doc => doc.ref.set({ plan: 'free', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }));
    }

    res.json({ received: true });
  }
);

// ─────────────────────────────────────────────
// 9. PERFIL DE PARLAMENTAR (onCall premium)
// ─────────────────────────────────────────────
exports.getPerfilParlamentar = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const userDoc = await db.doc(`users/${uid}`).get();
  const plan = userDoc.data()?.plan ?? 'free';

  const { cpf, idCamara } = req.data || {};
  if (!cpf && !idCamara) throw new HttpsError('invalid-argument', 'CPF ou idCamara obrigatório.');

  const whereClause = cpf
    ? `cpf = '${cpf.replace(/\D/g, '')}'`
    : `idCamara = ${Number(idCamara)}`;

  const query = `
    SELECT *
    FROM \`projeto-codex-br.${DATASET}.auditoria_completa_2023\`
    WHERE ${whereClause}
    LIMIT 1
  `;

  const [rows] = await bq.query({ query, location: BQ_LOCATION });
  if (!rows.length) throw new HttpsError('not-found', 'Parlamentar não encontrado.');

  const base = rows[0];

  if (plan !== 'premium') {
    const { nome, partido, estado, totalGastos, notaTransparencia } = base;
    return { nome, partido, estado, totalGastos, notaTransparencia, premium: false };
  }

  return { ...base, premium: true };
});

// ─────────────────────────────────────────────
// 9b. AUDITORIA POLITICO — CEAP (despesas individuais)
//     Proxy para a API aberta da Câmara Federal.
//     Frontend nunca acessa APIs externas diretamente.
// ─────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

exports.getAuditoriaPolitico = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const { nome, idCamara, ano = new Date().getFullYear() - 1 } = req.data || {};
  if (!idCamara && !nome) throw new HttpsError('invalid-argument', 'idCamara ou nome obrigatório.');

  let deputadoId = idCamara;

  // Se não tiver idCamara, busca pelo nome
  if (!deputadoId && nome) {
    try {
      const searchUrl = `https://dadosabertos.camara.leg.br/api/v2/deputados?nome=${encodeURIComponent(nome)}&ordem=ASC&ordenarPor=nome`;
      const searchRes = await fetchJson(searchUrl);
      const dep = searchRes?.dados?.[0];
      if (dep?.id) deputadoId = dep.id;
    } catch (e) {
      console.error('Erro ao buscar deputado por nome:', e.message);
    }
  }

  if (!deputadoId) {
    return { despesas: [], fonte: 'camara', aviso: 'Deputado não localizado na API da Câmara.' };
  }

  try {
    // Busca até 3 páginas de despesas (300 registros)
    const pagePromises = [1, 2, 3].map(p =>
      fetchJson(`https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/despesas?ano=${ano}&pagina=${p}&itens=100&ordem=DESC&ordenarPor=dataDocumento`)
        .catch(() => ({ dados: [] }))
    );
    const pages = await Promise.all(pagePromises);
    const despesas = pages.flatMap(p => p?.dados ?? []);

    return {
      despesas,
      total: despesas.length,
      deputadoId,
      ano,
      fonte: 'camara_api_v2',
    };
  } catch (e) {
    console.error('Erro ao buscar despesas CEAP:', e.message);
    return { despesas: [], fonte: 'camara', erro: e.message };
  }
});

// ─────────────────────────────────────────────
// 10. RANKING SEMANAL (scheduled — toda segunda 03:00 Belém)
// ─────────────────────────────────────────────
exports.atualizarRankingSemanal = onSchedule(
  { schedule: 'every monday 03:00', timeZone: 'America/Belem', ...OPTS },
  async () => {
    const query = `
      SELECT idCamara, nome, partido, estado,
             notaTransparencia, totalGastos, percentualPresenca
      FROM \`projeto-codex-br.${DATASET}.auditoria_completa_2023\`
      ORDER BY notaTransparencia DESC
      LIMIT 513
    `;
    const [rows] = await bq.query({ query, location: BQ_LOCATION });
    const batch = db.batch();
    rows.forEach((r, i) => {
      batch.set(db.doc(`rankings/federal/parlamentares/${r.idCamara}`), {
        ...r, posicao: i + 1, atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    console.log(`Ranking atualizado: ${rows.length} parlamentares`);
  }
);
