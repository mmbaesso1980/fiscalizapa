/**
 * Script completo de limpeza Firebase:
 * 1. Migrar users → usuarios
 * 2. Setar doc admin com creditos_ilimitados
 * 3. Deletar coleções lixo
 *
 * Roda via GitHub Actions com FIREBASE_SERVICE_ACCOUNT.
 * NÃO requer interação manual.
 */
const path = require("path");

let admin;
try {
  admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
} catch {
  console.error("firebase-admin não encontrado. Rode: cd functions && npm install");
  process.exit(1);
}

// Inicializar com credenciais do GOOGLE_APPLICATION_CREDENTIALS ou service account
if (!admin.apps.length) {
  const saJson = process.env.FIREBASE_SA_JSON;
  if (saJson) {
    const sa = JSON.parse(saJson);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
    });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();
const ADMIN_UID = "X8cHski54Dd6FiHULRJSk3Mjbol2";

const JUNK_COLLECTIONS = [
  "analyses",
  "credit_logs",
  "credit_wallets",
  "politicos",
  "system_config",
  "system_logs",
  "test",
];

async function step1_migrarUsers() {
  console.log("\n═══ STEP 1: Migrar users → usuarios ═══");
  const usersSnap = await db.collection("users").get();
  if (usersSnap.empty) {
    console.log("  Coleção 'users' está vazia ou não existe. Nada a migrar.");
    return 0;
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
  console.log(`  OK: ${n} documento(s) mesclado(s) em usuarios/{uid}.`);
  return n;
}

async function step2_setAdmin() {
  console.log("\n═══ STEP 2: Configurar conta admin ═══");
  const adminRef = db.collection("usuarios").doc(ADMIN_UID);
  const existing = await adminRef.get();

  const adminData = {
    creditos_ilimitados: true,
    role: "admin",
    plano: "enterprise",
    email: "mmbaesso@hotmail.com",
  };

  if (existing.exists) {
    await adminRef.update(adminData);
    console.log(`  OK: Doc usuarios/${ADMIN_UID} atualizado com admin fields.`);
  } else {
    await adminRef.set({
      ...adminData,
      creditos: 9999,
      creditos_bonus: 9999,
      dossies_gratuitos_restantes: 999,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  OK: Doc usuarios/${ADMIN_UID} criado com admin fields.`);
  }

  // Set custom claims via Auth
  try {
    await admin.auth().setCustomUserClaims(ADMIN_UID, { admin: true });
    console.log(`  OK: Custom claims {admin:true} setados para ${ADMIN_UID}.`);
  } catch (e) {
    console.error(`  WARN: Não conseguiu setar custom claims: ${e.message}`);
  }
}

async function step3_deleteJunkCollections() {
  console.log("\n═══ STEP 3: Deletar coleções lixo ═══");

  for (const col of JUNK_COLLECTIONS) {
    const snap = await db.collection(col).limit(500).get();
    if (snap.empty) {
      console.log(`  ${col}: vazia/inexistente — skip.`);
      continue;
    }

    let batch = db.batch();
    let count = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    await batch.commit();
    console.log(`  ${col}: ${count} documento(s) deletado(s).`);

    // Se tinha mais de 500, avisar
    if (snap.size === 500) {
      console.log(`  ⚠️  ${col} pode ter mais docs — rodar novamente se necessário.`);
    }
  }

  // Deletar coleção legada 'users' APÓS migração
  console.log("\n  Deletando coleção legada 'users'...");
  const usersSnap = await db.collection("users").limit(500).get();
  if (usersSnap.empty) {
    console.log("  users: vazia — skip.");
  } else {
    let batch = db.batch();
    let count = 0;
    for (const doc of usersSnap.docs) {
      batch.delete(doc.ref);
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    await batch.commit();
    console.log(`  users: ${count} documento(s) deletado(s).`);
  }
}

async function main() {
  console.log("🔧 Firebase Cleanup — FiscalizaPa (projeto: fiscallizapa)");
  console.log("══════════════════════════════════════════════════════════");

  await step1_migrarUsers();
  await step2_setAdmin();
  await step3_deleteJunkCollections();

  console.log("\n✅ Limpeza concluída com sucesso!");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Erro fatal:", e);
  process.exit(1);
});
