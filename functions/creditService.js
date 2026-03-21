/**
 * creditService.js
 * Modulo de gestao de creditos - TransparenciaBR
 *
 * Collections Firestore:
 *   credit_wallets/{userId} - saldo atual do usuario
 *   credit_logs/{autoId} - log de todas transacoes
 *   sessions/{sessionId} - sessoes ativas (para prevenir login simultaneo)
 *   referrals/{userId} - dados de indicacao
 *
 * Tipos de transacao:
 *   PURCHASE - compra via Stripe
 *   TRIAL - creditos iniciais (signup)
 *   CONSUME_CHAT - gasto em chat IA (-1)
 *   CONSUME_ANALYSIS - gasto em analise completa (-2)
 *   BONUS - creditos bonus (promo, referral)
 *   REFERRAL_BONUS - bonus por indicacao
 *   REFUND - estorno
 */

const admin = require('firebase-admin');
const db = admin.firestore();

// ============================================
// ADMIN UIDs - Creditos infinitos
// ============================================
const ADMIN_UIDS = [
  'maurilio_uid_placeholder', // sera substituido pelo UID real do Firestore
];

// Verificar admin pelo campo isAdmin no Firestore (mais flexivel)
async function isAdmin(userId) {
  if (!userId) return false;
  try {
    const doc = await db.collection('users').doc(userId).get();
    return doc.exists && doc.data().isAdmin === true;
  } catch (e) {
    return false;
  }
}

// ============================================
// PACOTES DE CREDITOS (Stripe price mapping)
// ============================================
const CREDIT_PACKAGES = {
  'price_starter_10':  { credits: 10,     amount: 990,  name: 'Starter 10' },
  'price_pro_50':      { credits: 50,     amount: 3990, name: 'Pro 50' },
  'price_ultra_200':   { credits: 200,    amount: 9990, name: 'Ultra 200' },
  'price_ilimitado':   { credits: 999999, amount: 4990, name: 'Ilimitado Mensal' },
};

// Fallback por amount (centavos)
const AMOUNT_TO_CREDITS = {
  990:  10,
  2900: 10,
  3990: 50,
  4900: 25,
  4990: 999999,
  9990: 200,
};

const TRIAL_CREDITS = 5;
const REFERRAL_CREDITS = 10; // creditos por indicacao bem-sucedida
const REFERRAL_BONUS_NEW = 3; // bonus para quem foi indicado

// ============================================
// WALLET - Inicializar / Consultar
// ============================================
async function getWallet(userId) {
  // Admin sempre tem creditos infinitos
  const adminStatus = await isAdmin(userId);
  if (adminStatus) {
    return {
      saldo: 999999,
      totalComprado: 0,
      totalConsumido: 0,
      plano: 'admin',
      isAdmin: true,
      trialUsado: true,
    };
  }

  const ref = db.collection('credit_wallets').doc(userId);
  const doc = await ref.get();
  if (doc.exists) return doc.data();

  // Criar wallet com trial
  const wallet = {
    saldo: TRIAL_CREDITS,
    totalComprado: 0,
    totalConsumido: 0,
    plano: 'free',
    trialUsado: true,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(wallet);
  await logTransaction(userId, 'TRIAL', TRIAL_CREDITS, { descricao: 'Creditos iniciais de boas-vindas' });
  return { ...wallet, saldo: TRIAL_CREDITS };
}

// ============================================
// CREDITAR - Adicionar creditos
// ============================================
async function creditarCompra(userId, credits, metadata = {}) {
  const ref = db.collection('credit_wallets').doc(userId);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const current = doc.exists ? doc.data() : { saldo: 0, totalComprado: 0, totalConsumido: 0, plano: 'free' };
    const novoSaldo = (current.saldo || 0) + credits;
    const isPlan = credits >= 999999;
    tx.set(ref, {
      saldo: novoSaldo,
      totalComprado: (current.totalComprado || 0) + credits,
      plano: isPlan ? 'ilimitado' : (current.plano || 'free'),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await logTransaction(userId, 'PURCHASE', credits, metadata);
  return true;
}

// ============================================
// CONSUMIR - Debitar creditos
// ============================================
async function consumirCreditos(userId, amount, tipo, metadata = {}) {
  // Admin nao debita
  const adminStatus = await isAdmin(userId);
  if (adminStatus) return 999999;

  const ref = db.collection('credit_wallets').doc(userId);
  let novoSaldo;
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error('Wallet nao encontrada. Faca login novamente.');
    const wallet = doc.data();
    if (wallet.plano === 'ilimitado') {
      novoSaldo = wallet.saldo;
      return;
    }
    if ((wallet.saldo || 0) < amount) {
      throw new Error(`Creditos insuficientes. Saldo: ${wallet.saldo || 0}, necessario: ${amount}`);
    }
    novoSaldo = (wallet.saldo || 0) - amount;
    tx.update(ref, {
      saldo: novoSaldo,
      totalConsumido: admin.firestore.FieldValue.increment(amount),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await logTransaction(userId, tipo, -amount, metadata);
  return novoSaldo;
}

// ============================================
// TRIAL DIARIO - 1 deputado/dia gratis
// ============================================
async function checkTrialDiario(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const ref = db.collection('trial_diario').doc(`${userId}_${today}`);
  const doc = await ref.get();
  if (doc.exists) {
    return { permitido: false, motivo: 'Trial diario ja utilizado hoje.' };
  }
  await ref.set({
    userId,
    data: today,
    usadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { permitido: true };
}

// ============================================
// SESSOES - Prevenir login simultaneo
// ============================================
async function registerSession(userId, sessionId, deviceInfo = {}) {
  const sessionRef = db.collection('sessions').doc(userId);
  await sessionRef.set({
    sessionId,
    userId,
    deviceInfo,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function validateSession(userId, sessionId) {
  const sessionRef = db.collection('sessions').doc(userId);
  const doc = await sessionRef.get();
  if (!doc.exists) return { valid: true }; // sem sessao registrada, ok
  const data = doc.data();
  if (data.sessionId !== sessionId) {
    return { valid: false, motivo: 'Sessao invalida. Sua conta foi acessada em outro dispositivo.' };
  }
  // Atualizar timestamp
  await sessionRef.update({ atualizadoEm: admin.firestore.FieldValue.serverTimestamp() });
  return { valid: true };
}

async function invalidateOtherSessions(userId, currentSessionId) {
  await registerSession(userId, currentSessionId);
}

// ============================================
// REFERRAL - Sistema de indicacao
// ============================================
async function gerarCodigoReferral(userId) {
  const ref = db.collection('referrals').doc(userId);
  const doc = await ref.get();
  if (doc.exists && doc.data().codigo) {
    return doc.data().codigo;
  }
  // Gerar codigo unico
  const codigo = 'REF' + userId.slice(0, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  await ref.set({
    userId,
    codigo,
    totalIndicados: 0,
    totalCreditsGanhos: 0,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return codigo;
}

async function processarReferral(codigoReferral, novoUserId) {
  if (!codigoReferral || !novoUserId) return;
  // Buscar quem tem esse codigo
  const snap = await db.collection('referrals')
    .where('codigo', '==', codigoReferral)
    .limit(1).get();
  if (snap.empty) return;
  const referrerDoc = snap.docs[0];
  const referrerId = referrerDoc.data().userId;
  if (referrerId === novoUserId) return; // nao pode indicar a si mesmo

  // Evitar uso duplicado do mesmo link pelo mesmo usuario
  const usadoRef = db.collection('referral_uses').doc(`${codigoReferral}_${novoUserId}`);
  const usadoDoc = await usadoRef.get();
  if (usadoDoc.exists) return;
  await usadoRef.set({ codigoReferral, novoUserId, referrerId, usadoEm: admin.firestore.FieldValue.serverTimestamp() });

  // Creditar quem indicou
  await creditarBonus(referrerId, REFERRAL_CREDITS, 'REFERRAL_BONUS', {
    descricao: `Bonus por indicacao do usuario ${novoUserId}`,
    indicadoId: novoUserId,
  });

  // Creditar quem foi indicado (bonus extra)
  await creditarBonus(novoUserId, REFERRAL_BONUS_NEW, 'REFERRAL_BONUS', {
    descricao: `Bonus por ter sido indicado pelo codigo ${codigoReferral}`,
    referrerId,
  });

  // Atualizar stats do referral
  await referrerDoc.ref.update({
    totalIndicados: admin.firestore.FieldValue.increment(1),
    totalCreditsGanhos: admin.firestore.FieldValue.increment(REFERRAL_CREDITS),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function creditarBonus(userId, credits, tipo = 'BONUS', metadata = {}) {
  const ref = db.collection('credit_wallets').doc(userId);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const current = doc.exists ? doc.data() : { saldo: TRIAL_CREDITS, totalComprado: 0, totalConsumido: 0, plano: 'free' };
    tx.set(ref, {
      saldo: (current.saldo || 0) + credits,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await logTransaction(userId, tipo, credits, metadata);
}

// ============================================
// LOG - Registrar transacao
// ============================================
async function logTransaction(userId, tipo, credits, metadata = {}) {
  await db.collection('credit_logs').add({
    userId,
    tipo,
    credits,
    metadata,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ============================================
// HISTORICO - Buscar logs do usuario
// ============================================
async function getHistorico(userId, limit = 20) {
  const snap = await db.collection('credit_logs')
    .where('userId', '==', userId)
    .orderBy('criadoEm', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============================================
// RESOLVE CREDITS FROM STRIPE
// ============================================
function resolveCredits(priceId, amountTotal) {
  if (priceId && CREDIT_PACKAGES[priceId]) {
    return CREDIT_PACKAGES[priceId].credits;
  }
  if (amountTotal && AMOUNT_TO_CREDITS[amountTotal]) {
    return AMOUNT_TO_CREDITS[amountTotal];
  }
  return 0;
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  getWallet,
  creditarCompra,
  consumirCreditos,
  creditarBonus,
  logTransaction,
  getHistorico,
  resolveCredits,
  isAdmin,
  checkTrialDiario,
  registerSession,
  validateSession,
  invalidateOtherSessions,
  gerarCodigoReferral,
  processarReferral,
  CREDIT_PACKAGES,
  TRIAL_CREDITS,
  REFERRAL_CREDITS,
};
