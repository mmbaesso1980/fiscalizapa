/**
 * Executar uma vez localmente (não commitar credenciais):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/fixMasterAccount.js
 *
 * Cria/atualiza usuarios/{uid} para conta master (créditos altos + ilimitado + admin).
 */
const path = require('path');

let admin;
try {
  admin = require('firebase-admin');
} catch {
  // CI: firebase-admin está em functions/node_modules
  admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
}

let credential;
if (process.env.FIREBASE_SA_JSON) {
  // CI: service account como JSON string (GitHub Actions secret)
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SA_JSON));
} else {
  // Local: arquivo JSON
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, '..', 'service-account.json');
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    credential = admin.credential.cert(require(serviceAccountPath));
  } catch (e) {
    console.error(
      'Defina FIREBASE_SA_JSON ou GOOGLE_APPLICATION_CREDENTIALS.',
      e.message,
    );
    process.exit(1);
  }
}

admin.initializeApp({ credential });
const db = admin.firestore();

async function fix() {
  const uid = 'X8cHski54Dd6FiHULRJSk3Mjbol2';
  await db.collection('usuarios').doc(uid).set(
    {
      uid,
      email: 'mmbaesso@hotmail.com',
      creditos: 99999,
      creditos_bonus: 0,
      creditos_ilimitados: true,
      role: 'admin',
      isAdmin: true,
      plano: 'enterprise',
      dossies_gratuitos_restantes: 999,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log('Master account atualizada em usuarios/', uid);

  // Custom claims para rotas que verificam token
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log('Custom claims {admin:true} setados para', uid);
  } catch (e) {
    console.warn('Aviso: custom claims não setados:', e.message);
  }

  // Verificar resultado
  const doc = await db.collection('usuarios').doc(uid).get();
  console.log('Doc final:', JSON.stringify(doc.data(), null, 2));

  process.exit(0);
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
