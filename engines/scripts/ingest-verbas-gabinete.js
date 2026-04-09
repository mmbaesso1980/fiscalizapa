/**
 * ingest-verbas-gabinete.js
 * Puxa funcionarios do gabinete de cada deputado
 * API: https://dadosabertos.camara.leg.br/api/v2/deputados/{id}/funcionarios
 * Grava em: deputados_federais/{id}/verbas_gabinete/{nome_hash}
 *
 * Uso: cd functions && node ../engines/scripts/ingest-verbas-gabinete.js
 */
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function hash(str) {
  return crypto.createHash("md5").update(str).digest("hex").substring(0, 12);
}

async function fetchFuncionarios(depId) {
  const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${depId}/funcionarios`;
  try {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(5000); return fetchFuncionarios(depId); }
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const json = await res.json();
    return json.dados || [];
  } catch (err) {
    return [];
  }
}

async function main() {
  console.log("=== INGEST VERBAS GABINETE ===");
  const snap = await db.collection("deputados_federais").get();
  const deps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`${deps.length} deputados.`);

  let totalFuncionarios = 0, depsComGabinete = 0;
  for (const dep of deps) {
    const funcs = await fetchFuncionarios(dep.id);
    if (!funcs.length) { await sleep(200); continue; }
    depsComGabinete++;
    let totalGab = 0;
    const batch = db.batch();
    for (const f of funcs) {
      const nome = f.nome || f.nomeServidor || 'Desconhecido';
      const docId = hash(`${dep.id}_${nome}`);
      const ref = db.collection("deputados_federais").doc(dep.id).collection("verbas_gabinete").doc(docId);
      const remuneracao = f.remuneracao || f.valor || f.remuneracaoMensal || 0;
      batch.set(ref, {
        nome: nome,
        cargo: f.cargo || f.funcao || f.grupoCargo || '',
        periodo: f.periodoExercicio || f.periodo || '',
        remuneracao: typeof remuneracao === 'string' ? parseFloat(remuneracao.replace(/\./g,'').replace(',','.')) || 0 : remuneracao,
        vinculo: f.tipoVinculo || f.vinculo || '',
        ingestedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      totalGab += typeof remuneracao === 'number' ? remuneracao : 0;
    }
    await batch.commit();
    // Atualiza resumo no doc raiz
    await db.collection("deputados_federais").doc(dep.id).set({
      gabineteResumo: {
        totalFuncionarios: funcs.length,
        custoTotal: totalGab,
        atualizado: new Date().toISOString()
      }
    }, { merge: true });
    console.log(` ${dep.nome || dep.id}: ${funcs.length} funcionários`);
    totalFuncionarios += funcs.length;
    await sleep(300);
  }
  console.log(`\nTotal: ${totalFuncionarios} funcionários de ${depsComGabinete} deputados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
