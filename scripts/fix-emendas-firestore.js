/**
 * fix-emendas-firestore.js
 * Corrige dados de emendas no Firestore:
 * 1. uf truncado -> extrai de localidade
 * 2. valores string -> converte pra number
 * 3. municipioNome ausente -> extrai de localidade
 *
 * Uso: cd functions && node ../scripts/fix-emendas-firestore.js
 */
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

async function fix() {
  const snap = await db.collection("emendas").get();
  console.log(`Total emendas: ${snap.size}`);
  let fixed = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const updates = {};
    // Fix uf truncado
    if (d.localidade && d.localidade.includes('(')) {
      const m = d.localidade.match(/\(([^)]+)\)/);
      if (m && (!d.uf || d.uf.length < 2)) updates.uf = m[1];
    }
    // Fix valores string -> number
    for (const k of ['valorEmpenhado','valorPago','valorLiquidado']) {
      if (typeof d[k] === 'string') {
        updates[k] = parseFloat(d[k].replace(/\./g,'').replace(',','.')) || 0;
      }
    }
    // Add municipioNome
    if (d.localidade && !d.municipioNome) {
      updates.municipioNome = d.localidade.split('(')[0].trim();
    }
    if (Object.keys(updates).length) {
      await doc.ref.update(updates);
      fixed++;
    }
  }
  console.log(`Fixed ${fixed} / ${snap.size} docs.`);
  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
