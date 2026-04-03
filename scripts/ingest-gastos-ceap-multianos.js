/**
 * ingest-gastos-ceap-multianos.js
 * Puxa CEAP de todos os deputados, anos 2019-2026
 * Grava em Firestore: deputados_federais/{id}/gastos/{uuid}
 *
 * Uso: cd scripts && node ingest-gastos-ceap-multianos.js
 */
const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ANOS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

async function fetchGastosCamara(depId, ano, pagina) {
  const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${depId}/despesas?ano=${ano}&pagina=${pagina}&itens=100&ordem=DESC&ordenarPor=dataDocumento`;
  try {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(5000);
      return fetchGastosCamara(depId, ano, pagina);
    }
    if (!res.ok) return [];
    const json = await res.json();
    return json.dados || [];
  } catch (err) {
    console.log(` ERR fetch ${depId} ${ano} p${pagina}: ${err.message}`);
    return [];
  }
}

async function fetchAllGastos(depId, ano) {
  let all = [];
  let p = 1;

  while (true) {
    const page = await fetchGastosCamara(depId, ano, p);
    if (!page.length) break;
    all = all.concat(page);
    if (page.length < 100) break;
    p++;
    await sleep(300);
  }

  return all;
}

async function main() {
  console.log("=== INGEST GASTOS CEAP MULTI-ANO ===");
  const snap = await db.collection("deputados_federais").get();
  const deps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`${deps.length} deputados.`);

  let totalGastos = 0;

  for (const dep of deps) {
    let depTotal = 0;

    for (const ano of ANOS) {
      const gastos = await fetchAllGastos(dep.id, ano);
      if (!gastos.length) continue;

      let batch = db.batch();
      let batchCount = 0;

      for (const g of gastos) {
        const docId = `${dep.id}_${ano}_${g.codDocumento || g.numDocumento || Math.random().toString(36).substr(2, 8)}`;
        const ref = db
          .collection("deputados_federais")
          .doc(dep.id)
          .collection("gastos")
          .doc(docId);

        batch.set(ref, {
          ano: ano,
          mes: g.numMes || g.mes || 0,
          tipoDespesa: g.tipoDespesa || "",
          descricao: g.descricao || g.tipoDespesa || "",
          nomeFornecedor: g.nomeFornecedor || "",
          cnpjCpfFornecedor: g.cnpjCpfFornecedor || "",
          valorDocumento: g.valorDocumento || 0,
          valorLiquido: g.valorLiquido || g.valorDocumento || 0,
          valorGlosa: g.valorGlosa || 0,
          urlDocumento: g.urlDocumento || "",
          dataDocumento: (g.dataDocumento && g.dataDocumento.length >= 10)
            ? g.dataDocumento.substring(0, 10)
            : "",
          numDocumento: g.numDocumento || "",
          codDocumento: g.codDocumento || 0,
          parcela: g.parcela || 0,
          ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        batchCount++;

        if (batchCount >= 490) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      depTotal += gastos.length;
      await sleep(200);
    }

    if (depTotal > 0) {
      console.log(` ${dep.nome || dep.id}: ${depTotal} gastos`);
      totalGastos += depTotal;
    }
  }

  console.log(`\nTotal: ${totalGastos} gastos ingeridos.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
