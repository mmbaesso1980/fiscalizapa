/**
 * TransparenciaBR — Backend Cloud Functions v1.0
 * Núcleo: BigQuery (projeto-codex-br / us-central1) + Firestore + Auth + Stripe
 *
 * ARQUITETURA DE PROJETOS:
 *   fiscallizapa  → Firebase (Auth, Firestore, Storage, Functions) — southamerica-east1
 *   projeto-codex-br → BigQuery dataset dados_camara — us-central1 (Iowa)
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
    engine: 'TransparenciaBR v1'
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

const APP_PUBLIC_ORIGIN =
  process.env.APP_PUBLIC_ORIGIN || 'https://fiscallizapa.web.app';

const PACKAGE_CREDITS = {
  price_starter_10: 10,
  price_pro_50: 50,
  price_ultra_200: 200
};

// ─────────────────────────────────────────────
// 7b. CARTEIRA / CRÉDITOS (Firestore usuarios)
// ─────────────────────────────────────────────
exports.getWalletCredits = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const snap = await db.doc(`usuarios/${uid}`).get();
  const d = snap.data() || {};
  let plano = d.plano ?? 'free';
  if (plano !== 'premium' && plano !== 'ilimitado') {
    const leg = await db.doc(`users/${uid}`).get();
    if (leg.data()?.plan === 'premium') plano = 'premium';
  }
  return {
    saldo: d.creditos ?? d.credits ?? 0,
    plano,
    totalComprado: d.totalComprado ?? 0,
    totalConsumido: d.totalConsumido ?? 0
  };
});

exports.getCreditHistory = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const limitN = Math.min(Math.max(Number(req.data?.limit) || 20, 1), 100);
  try {
    const snap = await db
      .collection(`usuarios/${uid}/creditos_historico`)
      .orderBy('criadoEm', 'desc')
      .limit(limitN)
      .get();
    const historico = snap.docs.map(doc => {
      const x = doc.data();
      return {
        tipo: x.tipo || 'BONUS',
        credits: x.credits ?? x.creditos ?? 0,
        criadoEm: x.criadoEm
      };
    });
    return { historico };
  } catch (e) {
    return { historico: [] };
  }
});

exports.buyCredits = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const { packageId, origin } = req.data || {};
  if (!packageId) throw new HttpsError('invalid-argument', 'packageId obrigatório.');

  const priceEnvMap = {
    price_starter_10: process.env.STRIPE_PRICE_STARTER_10,
    price_pro_50: process.env.STRIPE_PRICE_PRO_50,
    price_ultra_200: process.env.STRIPE_PRICE_ULTRA_200,
    price_ilimitado: process.env.STRIPE_PRICE_ILIMITADO
  };
  const priceId = priceEnvMap[packageId];
  if (!priceId) {
    throw new HttpsError(
      'failed-precondition',
      'Stripe não configurado: defina STRIPE_PRICE_STARTER_10, STRIPE_PRICE_PRO_50, STRIPE_PRICE_ULTRA_200 e/ou STRIPE_PRICE_ILIMITADO nas variáveis de ambiente das Functions.'
    );
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    throw new HttpsError('failed-precondition', 'Stripe não configurado no servidor.');
  }

  const appOrigin = (function safeOrigin(o) {
    const s = String(o || '').trim().replace(/\/$/, '');
    if (!s.startsWith('http')) return APP_PUBLIC_ORIGIN;
    try {
      const u = new URL(s);
      const h = u.hostname;
      const ok =
        h === 'localhost' ||
        h.endsWith('.web.app') ||
        h.endsWith('.firebaseapp.com') ||
        h.endsWith('transparenciabr.com.br');
      if (!ok) return APP_PUBLIC_ORIGIN;
      const port = u.port ? `:${u.port}` : '';
      return `${u.protocol}//${h}${port}`;
    } catch {
      return APP_PUBLIC_ORIGIN;
    }
  })(origin);

  const mode = packageId === 'price_ilimitado' ? 'subscription' : 'payment';
  const session = await stripe.checkout.sessions.create({
    mode,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appOrigin}/creditos?success=true`,
    cancel_url: `${appOrigin}/creditos?canceled=true`,
    metadata: { uid, packageId }
  });
  return { url: session.url };
});

// ─────────────────────────────────────────────
// 7c. SESSÃO / REFERRAL (no-op estável — evita ruído no cliente)
// ─────────────────────────────────────────────
exports.registerUserSession = onCall(OPTS, async () => ({ ok: true }));

exports.validateUserSession = onCall(OPTS, async () => ({ valid: true }));

exports.processReferralCode = onCall(OPTS, async () => ({ ok: true }));

exports.getUser = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const d = (await db.doc(`usuarios/${uid}`).get()).data() || {};
  return { credits: d.creditos ?? d.credits ?? 0 };
});

exports.consumeCredit = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const ref = db.doc(`usuarios/${uid}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const cur = snap.data()?.creditos ?? snap.data()?.credits ?? 0;
    if (cur < 1) return { ok: false, reason: 'Saldo insuficiente.' };
    tx.set(
      ref,
      { creditos: cur - 1, atualizadoEm: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { ok: true, source: 'firestore' };
  });
});

exports.chat = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const msg = String(req.data?.message || '').trim();
  if (!msg) throw new HttpsError('invalid-argument', 'Mensagem vazia.');
  return {
    response:
      'Assistente em fase de implantação. Use os links de fonte oficial (Portal da Transparência e Câmara) no dossiê para verificar os dados.'
  };
});

exports.getEmendasEncaminhamento = onCall(OPTS, async () => ({
  resumo: {},
  fases: [],
  documentos: [],
  aviso: 'Agregado de encaminhamento em desenvolvimento — consulte a aba Emendas.'
}));

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
        const ref = db.doc(`usuarios/${uid}`);
        const pkg = session.metadata?.packageId || '';

        if (session.mode === 'subscription') {
          const plano = pkg === 'price_ilimitado' ? 'ilimitado' : 'premium';
          await ref.set(
            {
              plano,
              stripeCustomerId: session.customer,
              atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        } else if (session.mode === 'payment') {
          const add = PACKAGE_CREDITS[pkg] ?? 0;
          if (add > 0) {
            await db.runTransaction(async tx => {
              const snap = await tx.get(ref);
              const cur = snap.data()?.creditos ?? snap.data()?.credits ?? 0;
              tx.set(
                ref,
                {
                  creditos: cur + add,
                  atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
                },
                { merge: true }
              );
            });
          }
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const customerId = sub.customer;
      const snapU = await db.collection('usuarios').where('stripeCustomerId', '==', customerId).limit(5).get();
      snapU.forEach(d =>
        d.ref.set(
          { plano: 'free', atualizadoEm: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        )
      );
      // Legado: assinatura antiga só em users
      if (snapU.empty) {
        const snapL = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(5).get();
        snapL.forEach(d =>
          d.ref.set(
            { plan: 'free', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          )
        );
      }
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

  const userDoc = await db.doc(`usuarios/${uid}`).get();
  let plan = userDoc.data()?.plano ?? 'free';
  // Legado: assinaturas antigas gravadas em users/{uid}
  if (plan !== 'premium') {
    const leg = await db.doc(`users/${uid}`).get();
    if (leg.data()?.plan === 'premium') plan = 'premium';
  }

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

/** CEAP: float em reais; evita concatenação no cliente; centavos inteiros enormes → /100 */
function parseCamaraValorReais(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    let n = raw;
    if (Number.isInteger(n) && n >= 1_000_000_000) n /= 100;
    return n;
  }
  let s = String(raw).trim().replace(/\s/g, '').replace(/R\$\s?/gi, '');
  if (!s) return 0;
  const hasComma = s.includes(',');
  const dotCount = (s.match(/\./g) || []).length;
  if (hasComma && dotCount > 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (hasComma) s = s.replace(',', '.');
  else if (dotCount > 1) s = s.replace(/\./g, '');
  let n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  if (Number.isInteger(n) && n >= 1_000_000_000) n /= 100;
  return n;
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
    const despesas = (pages.flatMap(p => p?.dados ?? [])).map((d) => {
      const vlr = d?.vlrLiquido ?? d?.valorLiquido ?? d?.valorDocumento ?? 0;
      const reais = parseCamaraValorReais(vlr);
      return {
        ...d,
        valorLiquido: reais,
        vlrLiquido: reais,
      };
    });

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
