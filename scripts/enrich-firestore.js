/**
 * Enriquece `deputados_federais` com dados da API aberta da Câmara (lista paginada + merge).
 *
 * Credenciais (qualquer uma):
 *   gcloud auth application-default login
 *   export GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json
 *
 * Uso:
 *   node scripts/enrich-firestore.js
 *
 * Projeto Firebase: fiscallizapa
 */

const path = require("path");
let admin;
try {
  admin = require("firebase-admin");
} catch {
  admin = require(path.join(__dirname, "../functions/node_modules/firebase-admin"));
}

const PROJECT_ID = "fiscallizapa";
const CAMARA_LIST = "https://dadosabertos.camara.leg.br/api/v2/deputados";
const BATCH_SIZE = 400;
const PAGE_SLEEP_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });
}

const db = admin.firestore();

function absolutizeFoto(url, idCamara) {
  let u = String(url || "").trim();
  if (u && !/^https?:\/\//i.test(u)) {
    u = u.startsWith("//") ? `https:${u}` : `https://www.camara.leg.br${u.startsWith("/") ? "" : "/"}${u}`;
  }
  if (!u && Number.isFinite(idCamara)) {
    u = `https://www.camara.leg.br/img/deputados/med/${idCamara}.jpg`;
  }
  return u || null;
}

function mapListItem(dep) {
  const idC = dep.id != null ? parseInt(String(dep.id), 10) : NaN;
  const nome = (dep.nome || "").trim();
  const siglaPartido = (dep.siglaPartido || "").trim();
  const siglaUf = (dep.siglaUf || "").trim();
  const urlFoto = absolutizeFoto(dep.urlFoto, idC);
  return {
    idCamara: Number.isFinite(idC) ? idC : null,
    nome: nome || null,
    nomeCompleto: nome || null,
    siglaPartido: siglaPartido || null,
    partido: siglaPartido || null,
    siglaUf: siglaUf || null,
    uf: siglaUf || null,
    urlFoto,
    ultimoStatus: {
      nomeEleitoral: nome,
      siglaPartido,
      siglaUf,
      urlFoto: dep.urlFoto || null,
    },
    enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function fetchAllDeputadosLista() {
  const all = [];
  let pagina = 1;
  for (;;) {
    const url = `${CAMARA_LIST}?pagina=${pagina}&itens=100&ordem=ASC&ordenarPor=nome`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`API Câmara HTTP ${res.status} (página ${pagina})`);
    }
    const json = await res.json();
    const dados = Array.isArray(json.dados) ? json.dados : [];
    if (!dados.length) break;
    all.push(...dados);
    console.log(`  … lista página ${pagina}: +${dados.length} (total ${all.length})`);
    if (dados.length < 100) break;
    pagina++;
    await sleep(PAGE_SLEEP_MS);
  }
  return all;
}

async function main() {
  console.log(`=== enrich-firestore (${PROJECT_ID}) — lista API + merge em deputados_federais ===`);
  console.log("Credencial: application-default (gcloud auth application-default login) ou GOOGLE_APPLICATION_CREDENTIALS\n");

  const deputados = await fetchAllDeputadosLista();
  if (!deputados.length) {
    console.error("Nenhum deputado retornado pela API.");
    process.exit(1);
  }

  let batch = db.batch();
  let batchCount = 0;
  let total = 0;

  for (const dep of deputados) {
    const docId = String(dep.id);
    const patch = mapListItem(dep);
    if (!patch.nome) continue;

    const ref = db.collection("deputados_federais").doc(docId);
    batch.set(ref, patch, { merge: true });
    batchCount++;
    total++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`  commit batch (${total}/${deputados.length})`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`  commit final (${batchCount} docs)`);
  }

  console.log(`\nConcluído: ${total} documentos mesclados em deputados_federais/{idCamara}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
