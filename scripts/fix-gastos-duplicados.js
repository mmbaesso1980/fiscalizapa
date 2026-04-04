const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fixDeputado(depId) {
  const gastosRef = db.collection("deputados_federais").doc(String(depId)).collection("gastos");
  const snap = await gastosRef.get();
  if (snap.empty) return { depId, total: 0, uuids: 0, kept: 0, keptTotal: 0 };
  let uuidCount = 0, keptCount = 0, keptTotal = 0;
  let batch = db.batch();
  let batchCount = 0;
  for (const doc of snap.docs) {
    if (UUID_RE.test(doc.id)) {
      batch.delete(doc.ref);
      batchCount++;
      uuidCount++;
      if (batchCount >= 490) { await batch.commit(); batch = db.batch(); batchCount = 0; }
    } else {
      const d = doc.data();
      keptTotal += parseFloat(d.valorDocumento || d.valor || d.valorLiquido || 0);
      keptCount++;
    }
  }
  if (batchCount > 0) await batch.commit();
  if (keptCount > 0) {
    await db.collection("deputados_federais").doc(String(depId)).update({
      gastosCeapTotal: Math.round(keptTotal * 100) / 100,
      gastosCeapNotas: keptCount
    });
  }
  return { depId, total: snap.size, uuids: uuidCount, kept: keptCount, keptTotal: Math.round(keptTotal * 100) / 100 };
}

async function main() {
  console.log("=== FIX GASTOS DUPLICADOS ===");
  const depsSnap = await db.collection("deputados_federais").get();
  console.log("Deputados: " + depsSnap.size);
  let totalUuids = 0, totalKept = 0, i = 0;
  for (const dep of depsSnap.docs) {
    i++;
    try {
      const r = await fixDeputado(dep.id);
      totalUuids += r.uuids;
      totalKept += r.kept;
      if (r.uuids > 0) console.log("[" + i + "/" + depsSnap.size + "] " + dep.id + ": " + r.total + " docs, deletados " + r.uuids + " UUIDs, mantidos " + r.kept + " (R$ " + r.keptTotal + ")");
      else if (i % 50 === 0) console.log("[" + i + "/" + depsSnap.size + "] progresso...");
    } catch (e) { console.error("ERRO " + dep.id + ": " + e.message); }
  }
  console.log("\n=== RESULTADO ===");
  console.log("UUIDs deletados: " + totalUuids);
  console.log("Docs mantidos: " + totalKept);
}

main().then(function() { process.exit(0); }).catch(function(e) { console.error(e); process.exit(1); });
