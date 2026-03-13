const admin = require("firebase-admin");
const https = require("https");
if (!admin.apps.length) admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { accept: "application/json" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on("error", reject);
  });
}

async function main() {
  const ano = process.argv[2] || "2025";
  const startPage = parseInt(process.argv[3] || "1");
  console.log("Ingestao nacional, ano " + ano + ", a partir da pagina " + startPage);
  let allDeps = [];
  for (let p = startPage; p <= 6; p++) {
    const url = "https://dadosabertos.camara.leg.br/api/v2/deputados?itens=100&pagina=" + p + "&ordem=ASC&ordenarPor=nome";
    const res = await fetchJSON(url);
    const deps = res.dados || [];
    if (deps.length === 0) break;
    allDeps = allDeps.concat(deps);
    console.log("Pagina " + p + ": " + deps.length + " deputados");
  }
  console.log("Total: " + allDeps.length + " deputados");
  for (const dep of allDeps) {
    const docId = String(dep.id);
    await db.collection("deputados_federais").doc(docId).set({
      nome: dep.nome, partido: dep.siglaPartido, uf: dep.siglaUf,
      cargo: "Deputado Federal", fotoUrl: dep.urlFoto, idCamara: dep.id,
      email: dep.email || "", legislatura: dep.idLegislatura,
      updated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    let pagina = 1, totalD = 0;
    while (pagina <= 20) {
      const gUrl = "https://dadosabertos.camara.leg.br/api/v2/deputados/" + dep.id + "/despesas?ano=" + ano + "&itens=100&pagina=" + pagina + "&ordem=DESC&ordenarPor=dataDocumento";
      let gRes;
      try { gRes = await fetchJSON(gUrl); } catch(e) { break; }
      const despesas = gRes.dados || [];
      if (despesas.length === 0) break;
      const batch = db.batch();
      for (const d of despesas) {
        const gId = d.codDocumento ? String(d.codDocumento) : db.collection("_").doc().id;
        batch.set(db.collection("deputados_federais").doc(docId).collection("gastos").doc(gId), {
          tipoDespesa: d.tipoDespesa, dataDocumento: d.dataDocumento,
          valor: d.valorDocumento || 0, valorLiquido: d.valorLiquido || 0,
          fornecedorNome: d.nomeFornecedor || "", cnpjCpf: d.cnpjCpfFornecedor || "",
          numDocumento: d.numDocumento || "", urlDocumento: d.urlDocumento || "",
          mes: d.mes, ano: d.ano
        }, { merge: true });
        totalD++;
      }
      await batch.commit();
      if (despesas.length < 100) break;
      pagina++;
    }
    console.log(dep.nome + " (" + dep.siglaPartido + "-" + dep.siglaUf + "): " + totalD + " despesas");
    await new Promise(r => setTimeout(r, 200));
  }
  console.log("INGESTAO NACIONAL CONCLUIDA!");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
