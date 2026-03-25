/**
 * run-ingest-estaduais-pa.js
 * Ingest ALEPA state deputies into Firestore collection 'deputados'
 * Fixes Issue #2: Dep. Estaduais PA showing federal deputies
 * Data source: ALEPA official website (alepa.pa.gov.br)
 */
const admin = require("firebase-admin");

admin.initializeApp({ projectId: "fiscallizapa" });
const db = admin.firestore();

const ALEPA_BASE = "https://www.alepa.pa.gov.br";

// All 41 state deputies from ALEPA 61st legislature (2023-2027)
const DEPUTADOS_PA = [
  { nome: "Adriano Coelho", partido: "PDT", genero: "M" },
  { nome: "Ana Cunha", partido: "PSDB", genero: "F" },
  { nome: "Andreia Xarao", partido: "MDB", genero: "F" },
  { nome: "Angelo Ferrari", partido: "MDB", genero: "M" },
  { nome: "Antonio Tonheiro", partido: "PP", genero: "M" },
  { nome: "Aveilton", partido: "PSD", genero: "M" },
  { nome: "Bob Fllay", partido: "PRD", genero: "M" },
  { nome: "Braz", partido: "PDT", genero: "M" },
  { nome: "Carlos Bordalo", partido: "PT", genero: "M" },
  { nome: "Carlos Vinicios", partido: "MDB", genero: "M" },
  { nome: "Chamonzinho", partido: "MDB", genero: "M" },
  { nome: "Chicao", partido: "UB", genero: "M" },
  { nome: "Cilene Couto", partido: "PSDB", genero: "F" },
  { nome: "Coronel Neil", partido: "PL", genero: "M" },
  { nome: "Delegado Nilton Neves", partido: "PSD", genero: "M" },
  { nome: "Diana Belo", partido: "MDB", genero: "F" },
  { nome: "Dirceu Ten Caten", partido: "PT", genero: "M" },
  { nome: "Dr Wanderlan", partido: "MDB", genero: "M" },
  { nome: "Elias Santiago", partido: "PT", genero: "M" },
  { nome: "Eliel Faustino", partido: "UB", genero: "M" },
  { nome: "Eraldo Pimenta", partido: "MDB", genero: "M" },
  { nome: "Erick Monteiro", partido: "PSDB", genero: "M" },
  { nome: "Fabio Figueiras", partido: "PSB", genero: "M" },
  { nome: "Fabio Freitas", partido: "REP", genero: "M" },
  { nome: "Gustavo Sefer", partido: "PSD", genero: "M" },
  { nome: "Iran Lima", partido: "MDB", genero: "M" },
  { nome: "Joao Pingarilho", partido: "PODEMOS", genero: "M" },
  { nome: "Josue Paiva", partido: "REP", genero: "M" },
  { nome: "Livia Duarte", partido: "PSOL", genero: "F" },
  { nome: "Lu Ogawa", partido: "PP", genero: "M" },
  { nome: "Luth Rebelo", partido: "PP", genero: "M" },
  { nome: "Maria do Carmo", partido: "PT", genero: "F" },
  { nome: "Martinho Carmona", partido: "MDB", genero: "M" },
  { nome: "Paula Titan", partido: "MDB", genero: "F" },
  { nome: "Renato Oliveira", partido: "MDB", genero: "M" },
  { nome: "Rogerio Barra", partido: "PL", genero: "M" },
  { nome: "Ronie", partido: "MDB", genero: "M" },
  { nome: "Thiago Araujo", partido: "REP", genero: "M" },
  { nome: "Torrinho", partido: "MDB", genero: "M" },
  { nome: "Wescley Tomaz", partido: "AVANTE", genero: "M" },
  { nome: "Zeca Pirao", partido: "MDB", genero: "M" }
];

async function main() {
  console.log("=== Ingestao Dep. Estaduais PA (ALEPA) ===");
  console.log(`Total: ${DEPUTADOS_PA.length} deputados`);

  // Step 1: Delete existing wrong data
  console.log("\n[1/3] Limpando collection deputados (dados errados)...");
  const existing = await db.collection("deputados").get();
  let deleteCount = 0;
  const docs = existing.docs;
  for (let i = 0; i < docs.length; i += 500) {
    const batch = db.batch();
    docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleteCount += Math.min(500, docs.length - i);
  }
  console.log(`   Deletados ${deleteCount} documentos antigos.`);

  // Step 2: Insert correct data
  console.log("\n[2/3] Inserindo deputados estaduais do Para...");
  const batch = db.batch();
  for (const dep of DEPUTADOS_PA) {
    const id = dep.nome.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const fotoName = `DEPUTADO_${dep.nome.replace(/ /g, "%20")}.jpg`;
    const urlFoto = `${ALEPA_BASE}/Midia/Imagens/Deputados/${fotoName}`;

    batch.set(db.collection("deputados").doc(id), {
      nome: dep.nome,
      partido: dep.partido,
      uf: "PA",
      cargo: "Deputado Estadual",
      casa: "ALEPA",
      legislatura: 61,
      genero: dep.genero,
      urlFoto,
      urlAlepa: `${ALEPA_BASE}/Institucional/Deputados`,
      fonte: "ALEPA - Assembleia Legislativa do Estado do Para",
      dataIngestao: new Date().toISOString(),
      gastoTotal: 0,
      presenca: null,
      proposicoes: 0,
      processos: 0,
      scoreBruto: 0,
      scoreFinal: 0,
      classificacao: "Sem dados",
      idx: 0
    });
    console.log(`   + ${dep.nome} (${dep.partido})`);
  }
  await batch.commit();
  console.log(`\n   Inseridos ${DEPUTADOS_PA.length} deputados.`);

  // Step 3: Verify
  console.log("\n[3/3] Verificando...");
  const verify = await db.collection("deputados").get();
  console.log(`   Collection deputados: ${verify.size} documentos.`);
  console.log("\n=== Concluido ===");
}

main().catch(console.error);
