/**
 * creditService.js
 * Modulo de gestao de creditos - TransparenciaBR
 * 
 * Collections Firestore:
 *   credit_wallets/{userId} - saldo atual do usuario
 *   credit_logs/{autoId} - log de todas transacoes
 *
 * Tipos de transacao:
 *   PURCHASE - compra via Stripe
 *   TRIAL - creditos iniciais (signup)
 *   CONSUME_CHAT - gasto em chat IA (-1)
 *   CONSUME_ANALYSIS - gasto em analise completa (-2)
 *   BONUS - creditos bonus (promo, referral)
 *   REFUND - estorno
 */

const admin = require('firebase-admin');
const db = admin.firestore();

// ============================================
// PACOTES DE CREDITOS (Stripe price mapping)
// ============================================
const CREDIT_PACKAGES = {
  'price_starter_10':    { credits: 10,  amount: 990,   name: 'Starter 10' },
  'price_pro_50':        { credits: 50,  amount: 3990,  name: 'Pro 50' },
  'price_ultra_200':     { credits: 200, amount: 9990,  name: 'Ultra 200' },
  'price_ilimitado':     { credits: 999999, amount: 4990, name: 'Ilimitado Mensal' },
};

// Fallback por amount (centavos) para compatibilidade com webhook existente
const AMOUNT_TO_CREDITS = {
  990:  10,
  2900: 10,
  3990: 50,
  4900: 25,
  4990: 999999,
  9990: 200,
};

const TRIAL_CREDITS = 5;

// ============================================
// WALLET - Inicializar / Consultar
// ============================================

/**
 * Retorna o saldo atual do usuario.
 * Se nao existir wallet, cria com creditos de trial.
 */
async function getWallet(userId) {
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
  
  // Log do trial
  await logTransaction(userId, 'TRIAL', TRIAL_CREDITS, {
    descricao: 'Creditos iniciais de boas-vindas',
  });
  
  return { ...wallet, saldo: TRIAL_CREDITS };
}

// ============================================
// CREDITAR - Adicionar creditos
// ============================================

/**
 * Adiciona creditos ao wallet do usuario.
 * Usado apos confirmacao de pagamento Stripe.
 */
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

/**
 * Consome creditos. Retorna true se sucesso, throw se insuficiente.
 * @param {string} userId
 * @param {number} amount - quantidade a debitar
 * @param {string} tipo - CONSUME_CHAT | CONSUME_ANALYSIS
 * @param {object} metadata - dados extras (politicianId, etc)
 */
async function consumirCreditos(userId, amount, tipo, metadata = {}) {
  const ref = db.collection('credit_wallets').doc(userId);
  
  let novoSaldo;
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error('Wallet nao encontrada. Faca login novamente.');
    
    const wallet = doc.data();
    
    // Plano ilimitado nao debita
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

/**
 * Resolve quantidade de creditos a partir de priceId ou amount.
 */
function resolveCredits(priceId, amountTotal) {
  // Tentar por priceId primeiro
  if (priceId && CREDIT_PACKAGES[priceId]) {
    return CREDIT_PACKAGES[priceId].credits;
  }
  // Fallback por amount
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
  logTransaction,
  getHistorico,
  resolveCredits,
  CREDIT_PACKAGES,
  TRIAL_CREDITS,
};
