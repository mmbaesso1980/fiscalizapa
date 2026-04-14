/**
 * Enriquece documentos em deputados_federais com dados de identidade da API
 * Dados Abertos da Câmara (sem chave).
 *
 * Uso:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json
 *   node scripts/enrich-firestore.js
 *
 * Projeto: fiscallizapa
 */

const path = require("path");
let admin;
try {
  admin = require("firebase-admin");
} catch {
  admin = require(path.join(__dirname, "../functions/node_modules/firebase-admin"));
}

const PROJECT_ID = "fiscallizapa";
const CAMARA_BASE = "https://dadosabertos.camara.leg.br/api/v2/deputados";
const SLEEP_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();

async function fetchDeputado(id) {
  const res = await fetch(`${CAMARA_BASE}/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.dados ?? null;
}

function mapCamaraToFirestore(d) {
  if (!d) return null;
  const us = d.ultimoStatus || {};
  const idC = d.id != null ? parseInt(String(d.id), 10) : NaN;
  let urlFoto = us.urlFoto || d.urlFoto || "";
  if (urlFoto && !/^https?:\/\//i.test(urlFoto)) {
    urlFoto = urlFoto.startsWith("//") ? `https:${urlFoto}` : `https://www.camara.leg.br${urlFoto.startsWith("/") ? "" : "/"}${urlFoto}`;
  }
  if (!urlFoto && Number.isFinite(idC)) {
    urlFoto = `https://www.camara.leg.br/img/deputados/med/${idC}.jpg`;
  }
  return {
    idCamara: Number.isFinite(idC) ? idC : null,
    nome: (us.nomeEleitoral || d.nome || "").trim() || null,
    nomeCompleto: (d.nome || "").trim() || null,
    nomeCivil: (d.nomeCivil || "").trim() || null,
    cpf: d.cpf != null ? String(d.cpf) : "",
    siglaPartido: (us.siglaPartido || d.siglaPartido || "").trim() || null,
    siglaUf: (us.siglaUf || d.siglaUf || "").trim() || null,
    urlFoto: urlFoto || null,
    situacao: (us.situacao || d.situacao || "").trim() || null,
    email: (d.email || us.email || "").trim() || null,
    gabinete: us.gabinete ?? d.gabinete ?? null,
    municipioNascimento: (d.municipioNascimento || "").trim() || null,
    ufNascimento: (d.ufNascimento || "").trim() || null,
    dataNascimento: d.dataNascimento || null,
    escolaridade: (d.escolaridade || "").trim() || null,
    sexo: (d.sexo || "").trim() || null,
    enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function hasIdentity(data) {
  const nome = data.nome || data.nomeCompleto;
  const partido = data.siglaPartido || data.partido;
  const foto = data.urlFoto;
  return Boolean(nome && partido && foto);
}

async function main() {
  console.log(`=== enrich-firestore (${PROJECT_ID}) ===`);
  const snap = await db.collection("deputados_federais").get();
  const docs = snap.docs;
  let i = 0;
  let updated = 0;
  let skipped = 0;

  for (const docSnap of docs) {
    i++;
    const data = docSnap.data() || {};
    if (hasIdentity(data)) {
      skipped++;
      if (i % 10 === 0) {
        console.log(`[${i}/${docs.length}] progress — updated ${updated}, skipped ${skipped}`);
      }
      continue;
    }

    const depId = docSnap.id;
    const camara = await fetchDeputado(depId);
    await sleep(SLEEP_MS);

    if (!camara) {
      console.warn(`  [${depId}] API sem dados`);
      if (i % 10 === 0) {
        console.log(`[${i}/${docs.length}] progress — updated ${updated}, skipped ${skipped}`);
      }
      continue;
    }

    const patch = mapCamaraToFirestore(camara);
    if (!patch || !patch.nome) {
      console.warn(`  [${depId}] map vazio`);
      continue;
    }

    await docSnap.ref.update(patch);
    updated++;
    console.log(`  [${depId}] OK — ${patch.nome}`);

    if (i % 10 === 0) {
      console.log(`[${i}/${docs.length}] progress — updated ${updated}, skipped ${skipped}`);
    }
  }

  console.log(`\nConcluído: ${updated} atualizados, ${skipped} já tinham identidade, ${docs.length} docs no total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
