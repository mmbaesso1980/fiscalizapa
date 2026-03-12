const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

exports.initUserProfile = onCall({ region: "southamerica-east1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login necessario");
  const uid = request.auth.uid;
  const userRef = db.doc("users/" + uid);
  const snap = await userRef.get();
  if (snap.exists) return { ok: true, existing: true };
  const now = FieldValue.serverTimestamp();
  await userRef.set({
    name: request.auth.token.name || "",
    email: request.auth.token.email || "",
    auth_provider: request.auth.token.firebase.sign_in_provider || "unknown",
    created_at: now,
    plan_type: "FREE",
    trial_expires_at: null,
    language: "pt",
    points: 0,
  });
  await db.doc("credit_wallets/" + uid).set({
    daily_free_total: 20,
    daily_free_used: 0,
    daily_premium_total: 100,
    daily_premium_used: 0,
    extra_credits_balance: 0,
  });
  return { ok: true, existing: false };
});

exports.consumeCredit = onCall({ region: "southamerica-east1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login necessario");
  const uid = request.auth.uid;
  const walletRef = db.doc("credit_wallets/" + uid);
  const userRef = db.doc("users/" + uid);
  const results = await Promise.all([walletRef.get(), userRef.get()]);
  const walletSnap = results[0];
  const userSnap = results[1];
  if (!walletSnap.exists) throw new HttpsError("not-found", "Wallet nao encontrada");
  const w = walletSnap.data();
  const plan = userSnap.data() ? userSnap.data().plan_type : "FREE";
  if (plan === "FREE" && w.daily_free_used < w.daily_free_total) {
    await walletRef.update({ daily_free_used: FieldValue.increment(1) });
    return { ok: true, source: "daily_free" };
  }
  if (plan === "PREMIUM" && w.daily_premium_used < w.daily_premium_total) {
    await walletRef.update({ daily_premium_used: FieldValue.increment(1) });
    return { ok: true, source: "daily_premium" };
  }
  if (w.extra_credits_balance > 0) {
    await walletRef.update({ extra_credits_balance: FieldValue.increment(-1) });
    return { ok: true, source: "extra" };
  }
  return { ok: false, reason: "sem_creditos" };
});

exports.resetDailyCredits = onSchedule({ schedule: "0 0 * * *", timeZone: "America/Belem", region: "southamerica-east1" }, async () => {
  const snap = await db.collection("credit_wallets").get();
  const batch = db.batch();
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, { daily_free_used: 0, daily_premium_used: 0 });
  });
  await batch.commit();
});

// stripe initialized in handler

exports.createCheckoutSession = onCall(async (request) => {
  if (!request.auth) throw new Error('Not authenticated');
  const { priceId } = request.data;
  const stripe = require('stripe')(process.env.STRIPE_SECRET);
  const session = await stripe.checkout.sessions.create({
    mode: priceId === 'price_sub' ? 'subscription' : 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: 'https://fiscallizapa.web.app/dashboard?success=true',
    cancel_url: 'https://fiscallizapa.web.app/creditos?canceled=true',
    client_reference_id: request.auth.uid,
  });
  return { url: session.url };
});
