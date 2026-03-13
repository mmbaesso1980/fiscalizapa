const admin = require("firebase-admin");
const https = require("https");

admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { accept: "application/json" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function main() {
  const uf = process.argv[2] || "PA";
  const ano = process.argv[3] || "2024";
  console.log("Ingestao: deputados de " + uf + ", ano " + ano);

  let url = "https://dadosabertos.camara.leg.br/api/v2/deputados?itens=100&ordem=ASC&ordenarPor=nome";
  if (uf !== "TODOS") url += "&siglaUf=" + uf;
  const depRes = await fetchJSON(url);
  const deputados = depRes.dados || [];
  console.log("Encontrados: " + deputados.length + " deputados");

  for (const dep of deputados) {
    const docId = String(dep.id);
    console.log("Processando: " + dep.nome + " (" + dep.siglaPartido + "-" + dep.siglaUf + ")");
    await db.collection("deputados_federais").doc(docId).set({
      nome: dep.nome, partido: dep.siglaPartido, uf: dep.siglaUf,
      cargo: "Deputado Federal", fotoUrl: dep.urlFoto, idCamara: dep.id,
      email: dep.email || "", legislatura: dep.idLegislatura,
      updated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    let pagina = 1;
    let totalDespesas = 0;
    while (pagina <= 20) {
      const gUrl = "https://dadosabertos.camara.leg.br/api/v2/deputados/" + dep.id + "/despesas?ano=" + ano + "&itens=100&pagina=" + pagina + "&ordem=DESC&ordenarPor=dataDocumento";
      let gRes;
      try { gRes = await fetchJSON(gUrl); } catch(e) { console.log("  Erro pagina " + pagina); break; }
      const despesas = gRes.dados || [];
      if (despesas.length === 0) break;

      const batch = db.batch();
      for (const d of despesas) {
        const gId = d.codDocumento ? String(d.codDocumento) : db.collection("_").doc().id;
        const ref = db.collection("deputados_federais").doc(docId).collection("gastos").doc(gId);
        batch.set(ref, {
          tipoDespesa: d.tipoDespesa, dataDocumento: d.dataDocumento,
          valor: d.valorDocumento || 0, valorLiquido: d.valorLiquido || 0,
          fornecedorNome: d.nomeFornecedor || "", cnpjCpf: d.cnpjCpfFornecedor || "",
          numDocumento: d.numDocumento || "", urlDocumento: d.urlDocumento || "",
          mes: d.mes, ano: d.ano
        }, { merge: true });
        totalDespesas++;
      }
      await batch.commit();
      if (despesas.length < 100) break;
      pagina++;
    }
    console.log("  -> " + totalDespesas + " despesas salvas");
    await new Promise(r => setTimeout(r, 300));
  }
  console.log("INGESTAO CONCLUIDA!");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
