/**
 * fix-emendas-firestore.js
 * Corrige dados de emendas no Firestore:
 * 1. uf truncado -> extrai de localidade
 * 2. valores string -> converte pra number (valorEmpenhado, valorPago, valorLiquidado, ano, taxaExecucao, idhLocal)
 * 3. municipioNome ausente -> extrai de localidade
 *
 * Uso: cd functions && node ../engines/scripts/fix-emendas-firestore.js [--dry-run]
 */
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Converte string para número (float), tratando formato brasileiro (1.234,56),
 * removendo R$, espaços e tratando nulos.
 */
function parseNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v
      .replace(/R\$/g, '')
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    return parseFloat(s) || 0;
  }
  return 0;
}

async function fix() {
  if (DRY_RUN) console.log("MODO DRY-RUN: Nenhuma alteração será gravada.");

  const snap = await db.collection("emendas").get();
  console.log(`Total emendas: ${snap.size}`);
  let fixed = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const updates = {};

    // 1. Fix uf truncado
    if (d.localidade && d.localidade.includes('(')) {
      const m = d.localidade.match(/\(([^)]+)\)/);
      if (m && (!d.uf || d.uf.length < 2)) {
        updates.uf = m[1];
      }
    }

    // 2. Fix valores string -> number
    // Campos monetários
    for (const k of ['valorEmpenhado', 'valorPago', 'valorLiquidado']) {
      if (typeof d[k] === 'string') {
        const val = parseNumber(d[k]);
        updates[k] = val;
      }
    }

    // Campos adicionais
    if (typeof d.ano === 'string') {
      const val = parseInt(d.ano.replace(/\D/g, ''), 10);
      if (!isNaN(val)) updates.ano = val;
    }
    if (typeof d.taxaExecucao === 'string') {
      updates.taxaExecucao = parseNumber(d.taxaExecucao);
    }
    if (typeof d.idhLocal === 'string') {
      updates.idhLocal = parseNumber(d.idhLocal);
    }

    // 3. Add municipioNome
    if (d.localidade && !d.municipioNome) {
      updates.municipioNome = d.localidade.split('(')[0].trim();
    }

    if (Object.keys(updates).length) {
      if (!DRY_RUN) {
        await doc.ref.update(updates);
      } else {
        console.log(`[DRY-RUN] Seria atualizado doc ${doc.id}:`, updates);
      }
      fixed++;
    }
  }
  console.log(`${DRY_RUN ? 'Simulado' : 'Fixed'} ${fixed} / ${snap.size} docs.`);
  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
