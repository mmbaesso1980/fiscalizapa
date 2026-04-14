/**
 * Executar uma vez localmente (não commitar credenciais):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/fixMasterAccount.js
 *
 * Cria/atualiza usuarios/{uid} para conta master (créditos altos + ilimitado + admin).
 */
const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, '..', 'service-account.json');

let credential;
try {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  credential = admin.credential.cert(require(serviceAccountPath));
} catch (e) {
  console.error(
    'Defina GOOGLE_APPLICATION_CREDENTIALS ou coloque service-account.json na raiz do repo.',
    e.message,
  );
  process.exit(1);
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
  process.exit(0);
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
