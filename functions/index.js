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
// 3b. RANKING (BigQuery — leitura pública, sem auth)
//     Agrega nota TransparenciaBR / CEAP para cards na UI.
// ─────────────────────────────────────────────
exports.getRanking = onCall(OPTS, async (req) => {
  const limitN = Math.min(Math.max(Number(req.data?.limit) || 513, 1), 513);
  const query = `
    SELECT idCamara, nome, partido, estado,
           notaTransparencia, totalGastos, percentualPresenca
    FROM \`projeto-codex-br.${DATASET}.auditoria_completa_2023\`
    ORDER BY notaTransparencia DESC NULLS LAST
    LIMIT ${limitN}
  `;
  try {
    const [rows] = await bq.query({ query, location: BQ_LOCATION });
    return {
      rows,
      count: rows.length,
      fonte: 'bigquery_auditoria_completa_2023',
    };
  } catch (e) {
    console.error('getRanking:', e.message);
    return { rows: [], count: 0, erro: e.message, fonte: 'bigquery' };
  }
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
  // Pacotes novos (roteiro v2)
  price_starter_50: 50,
  price_pro_200: 200,
  price_analista_500: 500,
  // Pacotes legados (backward compat)
  price_starter_10: 10,
  price_pro_50: 50,
  price_ultra_200: 200,
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
  const comprado = d.creditos ?? d.credits ?? 0;
  const bonus = d.creditos_bonus ?? 0;
  return {
    saldo: comprado + bonus,
    saldoComprado: comprado,
    saldoBonus: bonus,
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
    // Pacotes novos (roteiro v2)
    price_starter_50:    process.env.STRIPE_PRICE_STARTER_50,
    price_pro_200:       process.env.STRIPE_PRICE_PRO_200,
    price_analista_500:  process.env.STRIPE_PRICE_ANALISTA_500,
    price_enterprise:    process.env.STRIPE_PRICE_ENTERPRISE,
    // Pacotes legados (backward compat)
    price_starter_10:    process.env.STRIPE_PRICE_STARTER_10,
    price_pro_50:        process.env.STRIPE_PRICE_PRO_50,
    price_ultra_200:     process.env.STRIPE_PRICE_ULTRA_200,
    price_ilimitado:     process.env.STRIPE_PRICE_ILIMITADO,
  };
  const priceId = priceEnvMap[packageId];
  if (!priceId) {
    throw new HttpsError(
      'failed-precondition',
      `Stripe n\u00e3o configurado para pacote "${packageId}". Defina a vari\u00e1vel STRIPE_PRICE_* correspondente nas Functions.`
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

  const mode = (packageId === 'price_ilimitado' || packageId === 'price_enterprise') ? 'subscription' : 'payment';
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
  const comprado = d.creditos ?? d.credits ?? 0;
  const bonus = d.creditos_bonus ?? 0;
  return { credits: comprado + bonus };
});

exports.consumeCredit = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const ref = db.doc(`usuarios/${uid}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const d = snap.data() || {};
    const comprado = d.creditos ?? d.credits ?? 0;
    const bonus = d.creditos_bonus ?? 0;
    const total = comprado + bonus;
    if (total < 1) return { ok: false, reason: 'Saldo insuficiente.' };
    let novoBonus = bonus;
    let novoComprado = comprado;
    if (novoBonus >= 1) novoBonus -= 1;
    else novoComprado -= 1;
    tx.set(
      ref,
      {
        creditos: novoComprado,
        creditos_bonus: novoBonus,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      },
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
          const plano = (pkg === 'price_ilimitado' || pkg === 'price_enterprise') ? 'ilimitado' : 'premium';
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
/** Valores monetários do Portal ("3.000.000,00") → número */
function parsePortalValorBRL(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const s = String(raw).trim().replace(/\s/g, '').replace(/R\$\s?/gi, '');
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalizeNomePortalAutor(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getPortalTransparenciaApiKey() {
  const key = process.env.PORTAL_TRANSPARENCIA_API_KEY;
  if (!key || String(key).trim() === '') {
    throw new Error('PORTAL_TRANSPARENCIA_API_KEY não configurada nas Cloud Functions.');
  }
  return String(key).trim();
}

function portalApiGet(pathWithLeadingSlash) {
  const key = getPortalTransparenciaApiKey();
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.portaldatransparencia.gov.br',
      path: pathWithLeadingSlash,
      headers: { Accept: 'application/json', 'chave-api-dados': key },
    };
    https.get(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Portal API JSON: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

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

/** Anos CEAP quando o cliente não envia lista: 2019 → ano atual (cota por ano civil na API da Câmara) */
function defaultCeapAnos() {
  const y = new Date().getFullYear();
  const minY = 2019;
  const out = [];
  for (let a = y; a >= minY; a--) out.push(a);
  return out;
}

async function fetchDespesasAno(deputadoId, ano, maxPages = 12) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/despesas?ano=${ano}&pagina=${p}&itens=100&ordem=DESC&ordenarPor=dataDocumento`;
    let j;
    try {
      j = await fetchJson(url);
    } catch {
      break;
    }
    const dados = j?.dados ?? [];
    if (dados.length === 0) break;
    out.push(...dados);
    if (dados.length < 100) break;
  }
  return out;
}

exports.getAuditoriaPolitico = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const body = req.data || {};
  const { nome, idCamara } = body;
  /** @type {number[]} */
  let anos = Array.isArray(body.anos) ? body.anos.map(Number).filter((n) => n >= 2000 && n <= 2100) : null;
  if (!anos || anos.length === 0) {
    const legacy = body.ano != null ? Number(body.ano) : null;
    anos = legacy && Number.isFinite(legacy) ? [legacy] : defaultCeapAnos();
  }
  anos = [...new Set(anos)].sort((a, b) => b - a);

  if (!idCamara && !nome) throw new HttpsError('invalid-argument', 'idCamara ou nome obrigatório.');

  let deputadoId = idCamara;

  // Se não tiver idCamara, busca pelo nome (legislatura 57)
  if (!deputadoId && nome) {
    try {
      const searchUrl = `https://dadosabertos.camara.leg.br/api/v2/deputados?nome=${encodeURIComponent(nome)}&ordem=ASC&ordenarPor=nome&idLegislatura=57`;
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
    const byKey = new Map();
    for (const ano of anos) {
      const chunk = await fetchDespesasAno(deputadoId, ano);
      for (const d of chunk) {
        const k = d?.urlDocumento
          ? String(d.urlDocumento)
          : `${d?.codDocumento ?? ''}|${d?.dataDocumento ?? ''}|${d?.numDocumento ?? ''}|${d?.valorLiquido ?? d?.valorDocumento ?? ''}|${d?.tipoDespesa ?? ''}`;
        if (!byKey.has(k)) byKey.set(k, d);
      }
    }

    const despesas = [...byKey.values()].map((d) => {
      const vlr = d?.vlrLiquido ?? d?.valorLiquido ?? d?.valorDocumento ?? 0;
      const reais = parseCamaraValorReais(vlr);
      return {
        ...d,
        valorLiquido: reais,
        vlrLiquido: reais,
      };
    });

    despesas.sort((a, b) => {
      const ta = new Date(a.dataDocumento || 0).getTime();
      const tb = new Date(b.dataDocumento || 0).getTime();
      return tb - ta;
    });

    return {
      despesas,
      total: despesas.length,
      deputadoId,
      anosCeap: anos,
      fonte: 'camara_api_v2',
    };
  } catch (e) {
    console.error('Erro ao buscar despesas CEAP:', e.message);
    return { despesas: [], fonte: 'camara', erro: e.message };
  }
});

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

async function portalFetchEmendasPorAno(ano, query) {
  const out = [];
  for (let p = 1; p <= 50; p++) {
    const path = `/api-de-dados/emendas?ano=${ano}&${query}&pagina=${p}`;
    let page;
    try {
      page = await portalApiGet(path);
    } catch (e) {
      console.error('portal emendas page', ano, p, e.message);
      break;
    }
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 15) break;
    await sleepMs(350);
  }
  return out;
}

async function portalFetchDocumentosEmenda(codigoEmenda, maxPages = 4) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const path = `/api-de-dados/emendas/documentos/${encodeURIComponent(codigoEmenda)}?pagina=${p}`;
    let page;
    try {
      page = await portalApiGet(path);
    } catch (e) {
      console.error('portal emendas docs', codigoEmenda, p, e.message);
      break;
    }
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 15) break;
    await sleepMs(350);
  }
  return out;
}

function parsePtDataSortKey(dataStr) {
  const p = String(dataStr || '').split('/');
  if (p.length !== 3) return 0;
  const [dd, mm, yy] = p;
  const t = new Date(`${yy}-${mm}-${dd}`).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Emendas parlamentares (Portal da Transparência) + documentos por fase (empenho → … → pagamento).
 * Chave API: PORTAL_TRANSPARENCIA_API_KEY — header HTTP chave-api-dados (Console/Secret Gen 2).
 */
exports.getEmendasParlamentar = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const body = req.data || {};
  const nomeAutor = String(body.nomeAutor || body.nome || '').trim();
  const codigoAutorRaw = body.codigoAutor ?? body.idAutor ?? body.idCamara;
  const codigoAutor = codigoAutorRaw != null && String(codigoAutorRaw).trim() !== ''
    ? String(codigoAutorRaw).replace(/\D/g, '')
    : '';
  const politicoDocId = String(body.politicoDocId || body.deputadoId || '').trim();
  const maxComDocs = Math.min(20, Math.max(0, Number(body.maxEmendasComDocumentos) || 12));

  let anos = Array.isArray(body.anos) ? body.anos.map(Number).filter((n) => n >= 2000 && n <= 2100) : null;
  if (!anos || anos.length === 0) anos = defaultCeapAnos();
  anos = [...new Set(anos)].sort((a, b) => b - a);

  if ((!nomeAutor && !codigoAutor) || !politicoDocId) {
    throw new HttpsError('invalid-argument', 'politicoDocId e nomeAutor ou codigoAutor são obrigatórios.');
  }

  const nomeQuery = nomeAutor ? normalizeNomePortalAutor(nomeAutor) : '';
  const byCodigo = new Map();

  function anoDoCodigoEmenda(cod) {
    const m = String(cod || '').match(/^(\d{4})/);
    return m ? Number(m[1]) : null;
  }

  /** Mantém o registro com maior valor empenhado (visão consolidada); evita misturar linhas por ano da mesma emenda. */
  function mergeEmendaRow(prev, next) {
    if (!prev) return next;
    const ePrev = parsePortalValorBRL(prev.valorEmpenhado);
    const eNext = parsePortalValorBRL(next.valorEmpenhado);
    if (eNext > ePrev) return next;
    if (eNext < ePrev) return prev;
    const yPrev = Number(prev.ano) || anoDoCodigoEmenda(prev.codigoEmenda) || 0;
    const yNext = Number(next.ano) || anoDoCodigoEmenda(next.codigoEmenda) || 0;
    return yNext >= yPrev ? next : prev;
  }

  async function ingestAnos(queryFn) {
    for (const ano of anos) {
      const chunk = await portalFetchEmendasPorAno(ano, queryFn(ano));
      for (const e of chunk) {
        const cod = e?.codigoEmenda;
        if (!cod) continue;
        byCodigo.set(cod, mergeEmendaRow(byCodigo.get(cod), e));
      }
      await sleepMs(400);
    }
  }

  try {
    if (codigoAutor) {
      await ingestAnos(() => `codigoAutor=${encodeURIComponent(codigoAutor)}`);
    }
    // id Câmara ≠ codigoAutor do Portal — se vier vazio, repetir com nome normalizado
    if (byCodigo.size === 0 && nomeQuery) {
      byCodigo.clear();
      await ingestAnos(() => `nomeAutor=${encodeURIComponent(nomeQuery)}`);
    }

    const emendas = [...byCodigo.values()].map((raw) => {
      const cod = String(raw.codigoEmenda);
      const emp = parsePortalValorBRL(raw.valorEmpenhado);
      const liq = parsePortalValorBRL(raw.valorLiquidado);
      const pag = parsePortalValorBRL(raw.valorPago);
      const taxa = emp > 0 ? Math.round((pag / emp) * 1000) / 10 : 0;
      const loc = String(raw.localidadeDoGasto || '').trim();
      const municipioNome = loc.replace(/\s*\(UF\)\s*$/i, '').trim() || loc;
      return {
        id: cod,
        codigo: cod,
        parlamentarId: politicoDocId,
        autorNome: raw.nomeAutor || raw.autor || nomeAutor,
        ano: Number(raw.ano) || null,
        tipo: raw.tipoEmenda || '',
        municipioNome,
        municipio: municipioNome,
        localidade: loc,
        funcao: raw.funcao || '',
        subfuncao: raw.subfuncao || '',
        objetoResumo: [raw.funcao, raw.subfuncao].filter(Boolean).join(' · '),
        valorEmpenhado: emp,
        valorLiquidado: liq,
        valorPago: pag,
        taxaExecucao: taxa,
        linkPortal: `https://portaldatransparencia.gov.br/emendas/consulta?codigoEmenda=${encodeURIComponent(cod)}`,
        urlPortal: `https://portaldatransparencia.gov.br/emendas/consulta?codigoEmenda=${encodeURIComponent(cod)}`,
      };
    });

    emendas.sort((a, b) => (b.valorEmpenhado || 0) - (a.valorEmpenhado || 0));

    const comDoc = emendas.slice(0, maxComDocs);
    for (const em of comDoc) {
      const docs = await portalFetchDocumentosEmenda(em.codigo);
      const porFase = {};
      const timeline = [];
      for (const d of docs) {
        const fase = String(d.fase || 'Documento');
        porFase[fase] = (porFase[fase] || 0) + 1;
        timeline.push({
          data: d.data,
          fase: d.fase,
          codigoDocumento: d.codigoDocumento,
          codigoDocumentoResumido: d.codigoDocumentoResumido,
          especieTipo: d.especieTipo,
          linkConsultaDocumento: d.codigoDocumento
            ? `https://portaldatransparencia.gov.br/consulta?q=${encodeURIComponent(d.codigoDocumento)}`
            : '',
        });
      }
      timeline.sort((a, b) => parsePtDataSortKey(b.data) - parsePtDataSortKey(a.data));
      em.documentosPorFase = porFase;
      em.documentosTimeline = timeline.slice(0, 60);
      em.totalDocumentosRastreados = docs.length;
      await sleepMs(400);
    }

    const totaisAgregados = emendas.reduce(
      (acc, e) => ({
        valorEmpenhado: acc.valorEmpenhado + (e.valorEmpenhado || 0),
        valorLiquidado: acc.valorLiquidado + (e.valorLiquidado || 0),
        valorPago: acc.valorPago + (e.valorPago || 0),
      }),
      { valorEmpenhado: 0, valorLiquidado: 0, valorPago: 0 },
    );

    return {
      emendas,
      total: emendas.length,
      anosConsulta: anos,
      totaisAgregados,
      fonte: 'portal_transparencia_api',
    };
  } catch (e) {
    console.error('getEmendasParlamentar:', e.message);
    return { emendas: [], total: 0, fonte: 'portal_transparencia_api', erro: e.message, anosConsulta: anos };
  }
});

function parseUfFromLocalidadePortal(loc) {
  const m = String(loc || '').match(/\(([A-Z]{2})\)\s*$/i);
  return m ? m[1].toUpperCase() : '';
}

function emendaTipoPixPortal(tipoEmenda) {
  const t = String(tipoEmenda || '').toLowerCase();
  return (
    t.includes('pix')
    || t.includes('transferência especial')
    || t.includes('transferencia especial')
    || t.includes('transferência direta')
    || t.includes('transferencia direta')
  );
}

/**
 * Pontos geográficos para mapa de emendas (Nominatim + cache em memória por cold start).
 * Não substitui getEmendasParlamentar — uso leve para visualização.
 */
exports.getEmendasMapaPontos = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  const body = req.data || {};
  const nomeAutor = String(body.nomeAutor || body.nome || '').trim();
  const codigoAutorRaw = body.codigoAutor ?? body.idAutor ?? body.idCamara;
  const codigoAutor = codigoAutorRaw != null && String(codigoAutorRaw).trim() !== ''
    ? String(codigoAutorRaw).replace(/\D/g, '')
    : '';
  const politicoDocId = String(body.politicoDocId || body.deputadoId || '').trim();
  const maxGeo = Math.min(40, Math.max(5, Number(body.maxPontos) || 22));

  let anos = Array.isArray(body.anos) ? body.anos.map(Number).filter((n) => n >= 2000 && n <= 2100) : null;
  if (!anos || anos.length === 0) anos = defaultCeapAnos();
  anos = [...new Set(anos)].sort((a, b) => b - a);

  if ((!nomeAutor && !codigoAutor) || !politicoDocId) {
    throw new HttpsError('invalid-argument', 'politicoDocId e nomeAutor ou codigoAutor são obrigatórios.');
  }

  const nomeQuery = nomeAutor ? normalizeNomePortalAutor(nomeAutor) : '';
  const byCodigo = new Map();

  function mergeEmendaRow(prev, next) {
    if (!prev) return next;
    const ePrev = parsePortalValorBRL(prev.valorEmpenhado);
    const eNext = parsePortalValorBRL(next.valorEmpenhado);
    if (eNext > ePrev) return next;
    if (eNext < ePrev) return prev;
    return next;
  }

  const geoMemo = new Map();
  const GEO_CACHE_DAYS = 90;
  const GEO_CACHE_MS = GEO_CACHE_DAYS * 24 * 60 * 60 * 1000;

  function geocodeCacheDocId(municipio, uf) {
    const key = `${String(municipio).trim().toLowerCase()}|${String(uf || '').toUpperCase()}`;
    const safe = key.replace(/[^a-zA-Z0-9|_-]/g, '_').replace(/\|/g, '__');
    return safe.length > 700 ? safe.slice(0, 700) : safe;
  }

  async function nominatimLookup(municipio, uf) {
    const key = `${String(municipio).trim().toLowerCase()}|${String(uf || '').toUpperCase()}`;
    if (geoMemo.has(key)) return geoMemo.get(key);

    const cacheId = geocodeCacheDocId(municipio, uf);
    const cacheRef = db.collection('geocode_cache').doc(cacheId);
    try {
      const snap = await cacheRef.get();
      if (snap.exists) {
        const c = snap.data();
        const ts = c.fetchedAt?.toMillis?.() ?? 0;
        if (Date.now() - ts < GEO_CACHE_MS) {
          if (c.lat == null || c.lng == null) {
            geoMemo.set(key, null);
            return null;
          }
          const coords = { lat: Number(c.lat), lng: Number(c.lng) };
          geoMemo.set(key, coords);
          return coords;
        }
      }
    } catch (e) {
      console.warn('geocode_cache read:', e.message);
    }

    const q = `${municipio}, ${uf || ''}, Brasil`.replace(/,\s*,/g, ',').trim();
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 14000);
    let coords = null;
    try {
      const r = await fetch(url, {
        signal: ac.signal,
        headers: {
          'User-Agent': 'TransparenciaBR-Ingest/1.0 (dados públicos)',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });
      clearTimeout(t);
      if (!r.ok) {
        geoMemo.set(key, null);
        try {
          await cacheRef.set({
            municipio: String(municipio).slice(0, 200),
            uf: String(uf || '').slice(0, 4),
            lat: null,
            lng: null,
            fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
            fonte: 'nominatim_miss',
          });
        } catch {/* ignore */}
        return null;
      }
      const j = await r.json();
      if (!Array.isArray(j) || !j[0]) {
        geoMemo.set(key, null);
        try {
          await cacheRef.set({
            municipio: String(municipio).slice(0, 200),
            uf: String(uf || '').slice(0, 4),
            lat: null,
            lng: null,
            fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
            fonte: 'nominatim_empty',
          });
        } catch {/* ignore */}
        return null;
      }
      coords = { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
    } catch {
      clearTimeout(t);
      coords = null;
    }
    geoMemo.set(key, coords);
    try {
      await cacheRef.set({
        municipio: String(municipio).slice(0, 200),
        uf: String(uf || '').slice(0, 4),
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        fonte: 'nominatim',
      });
    } catch (e) {
      console.warn('geocode_cache write:', e.message);
    }
    return coords;
  }

  async function ingestMapaAnos(queryFn) {
    for (const ano of anos) {
      const chunk = await portalFetchEmendasPorAno(ano, queryFn(ano));
      for (const e of chunk) {
        const cod = e?.codigoEmenda;
        if (!cod) continue;
        byCodigo.set(cod, mergeEmendaRow(byCodigo.get(cod), e));
      }
      await sleepMs(400);
    }
  }

  try {
    if (codigoAutor) {
      await ingestMapaAnos(() => `codigoAutor=${encodeURIComponent(codigoAutor)}`);
    }
    if (byCodigo.size === 0 && nomeQuery) {
      byCodigo.clear();
      await ingestMapaAnos(() => `nomeAutor=${encodeURIComponent(nomeQuery)}`);
    }

    const rows = [...byCodigo.values()].map((raw) => {
      const emp = parsePortalValorBRL(raw.valorEmpenhado);
      const pag = parsePortalValorBRL(raw.valorPago);
      const loc = String(raw.localidadeDoGasto || '').trim();
      const municipioNome = loc.replace(/\s*\(UF\)\s*$/i, '').trim() || loc;
      const uf = parseUfFromLocalidadePortal(loc);
      return {
        codigo: String(raw.codigoEmenda),
        municipio: municipioNome,
        uf,
        valor: emp,
        valorPago: pag,
        tipoPix: emendaTipoPixPortal(raw.tipoEmenda),
        tipoLabel: String(raw.tipoEmenda || ''),
      };
    });

    rows.sort((a, b) => (b.valor || 0) - (a.valor || 0));

    let emendasPix = 0;
    let emendasProjeto = 0;
    for (const r of rows) {
      if (r.tipoPix) emendasPix += 1;
      else emendasProjeto += 1;
    }

    const totais = rows.reduce(
      (acc, r) => ({
        valorEmpenhado: acc.valorEmpenhado + (r.valor || 0),
        valorPago: acc.valorPago + (r.valorPago || 0),
      }),
      { valorEmpenhado: 0, valorPago: 0 },
    );

    const pontos = [];
    for (const r of rows) {
      if (!r.municipio || pontos.length >= maxGeo) break;
      const coords = await nominatimLookup(r.municipio, r.uf);
      await sleepMs(1100);
      if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
        pontos.push({
          lat: coords.lat,
          lng: coords.lng,
          municipio: r.municipio,
          valor: r.valor,
          tipoPix: r.tipoPix,
          tipo: r.tipoLabel,
        });
      }
    }

    return {
      pontos,
      totalEmendas: rows.length,
      emendasPix,
      emendasProjeto,
      totaisAgregados: totais,
      anosConsulta: anos,
      fonte: 'portal_transparencia_api+nominatim',
    };
  } catch (e) {
    console.error('getEmendasMapaPontos:', e.message);
    return {
      pontos: [],
      totalEmendas: 0,
      emendasPix: 0,
      emendasProjeto: 0,
      erro: e.message,
      fonte: 'portal_transparencia_api+nominatim',
    };
  }
});

/** Prefixos permitidos para proxy GET à API de Dados do Portal (segurança). */
const PORTAL_PROXY_PREFIXES = [
  '/api-de-dados/emendas',
  '/api-de-dados/contratos',
  '/api-de-dados/despesas',
  '/api-de-dados/servidores',
  '/api-de-dados/cnep',
  '/api-de-dados/ceis',
  '/api-de-dados/licitacoes',
  '/api-de-dados/transferencias',
];

/**
 * Proxy autenticado para GET na API de Dados do Portal da Transparência.
 * pathAndQuery: ex. "/api-de-dados/emendas?ano=2024&nomeAutor=X&pagina=1"
 * Só aceita prefixos em PORTAL_PROXY_PREFIXES (evita abuso da chave).
 */
exports.portalTransparenciaProxy = onCall(OPTS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

  let raw = String(req.data?.path || req.data?.pathAndQuery || '').trim();
  if (!raw.startsWith('/')) raw = `/${raw}`;
  if (raw.length > 900) throw new HttpsError('invalid-argument', 'path muito longo.');

  const pathOnly = raw.split('?')[0];
  const allowed = PORTAL_PROXY_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`));
  if (!allowed) {
    throw new HttpsError(
      'invalid-argument',
      `Rota não permitida. Use um dos prefixos: ${PORTAL_PROXY_PREFIXES.join(', ')}`,
    );
  }

  try {
    const data = await portalApiGet(raw);
    return { ok: true, data, path: raw, fonte: 'portal_transparencia_api' };
  } catch (e) {
    console.error('portalTransparenciaProxy:', raw, e.message);
    return { ok: false, erro: e.message, path: raw };
  }
});

// ─────────────────────────────────────────────
// 10. MOTOR FORENSE (análise cruzada + scoring + flags)
//     Módulo separado: forensicEngine.js
// ─────────────────────────────────────────────
const { registerForensicFunctions } = require('./forensicEngine');
const forensic = registerForensicFunctions({
  onCall, HttpsError, db, bq, DATASET, BQ_LOCATION, OPTS,
});
exports.forensicEngine = forensic.forensicEngine;
exports.getForensicCache = forensic.getForensicCache;
exports.getAtividadeParlamentar = forensic.getAtividadeParlamentar;

const { registerGetGabineteDeputado } = require('./getGabineteDeputado');
const gabineteMod = registerGetGabineteDeputado({ onCall, HttpsError, admin, OPTS });
exports.getGabineteDeputado = gabineteMod.getGabineteDeputado;

// ─────────────────────────────────────────────
// 11. RANKING SEMANAL (scheduled — toda segunda 03:00 Belém)
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
