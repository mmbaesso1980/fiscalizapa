/**
 * Migração única: coleção legada `users` → `usuarios` (mesmo UID).
 *
 * Uso (na raiz do repositório, com credenciais):
 *   export GOOGLE_APPLICATION_CREDENTIALS=/caminho/sa.json
 *   node scripts/migrarCollections.js
 *
 * Requer firebase-admin (já presente em functions/).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");

let admin;
try {
  admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
} catch {
  console.error("Instale dependências em functions/ (npm install) e tente novamente.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function migrar() {
  const usersSnap = await db.collection("users").get();
  if (usersSnap.empty) {
    console.log("Nenhum documento em 'users'.");
    return;
  }

  let batch = db.batch();
  let n = 0;
  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data();
    const destino = db.collection("usuarios").doc(docSnap.id);
    batch.set(
      destino,
      {
        ...data,
        creditos: data.creditos ?? data.credits ?? 0,
        isPaid: data.isPaid ?? false,
        migradoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    n += 1;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  console.log(`OK: ${usersSnap.size} documento(s) mesclado(s) em usuarios/{uid}.`);
}

migrar().catch((e) => {
  console.error(e);
  process.exit(1);
});
