/**
 * run-ingest-votacoes.js
 * Ingestao de votacoes nominais da Camara dos Deputados
 * API: https://dadosabertos.camara.leg.br/api/v2
 * Resolve Issue #4
 */

const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const DELAY_MS = 1500;
const LEGISLATURA = 57;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "Accept": "application/json" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return res.json();
}

async function getVotacoesPlenario() {
  const now = new Date();
  const year = now.getFullYear();
  let allVotacoes = [];

  // Busca votacoes do ano atual e anterior
  for (const y of [year, year - 1]) {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const url = `${BASE}/votacoes?legislatura=${LEGISLATURA}&dataInicio=${y}-01-01&dataFim=${y}-12-31&ordem=DESC&ordenarPor=dataHoraRegistro&pagina=${page}&itens=100`;
      const data = await fetchJSON(url);
      if (data.dados && data.dados.length > 0) {
        allVotacoes = allVotacoes.concat(data.dados);
        page++;
        await delay(DELAY_MS);
      } else {
        hasMore = false;
      }
    }
  }
  return allVotacoes;
}

async function getVotosDeVotacao(votacaoId) {
  const url = `${BASE}/votacoes/${votacaoId}/votos`;
  const data = await fetchJSON(url);
  return data.dados || [];
}

async function main() {
  console.log("=== Ingestao de Votacoes Nominais ===");
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;

  const votacoes = await getVotacoesPlenario();
  console.log(`Total de votacoes encontradas: ${votacoes.length}`);

  for (const votacao of votacoes) {
    try {
      const votacaoId = votacao.id;
      const votos = await getVotosDeVotacao(votacaoId);

      // Contabilizar votos
      const resumo = { sim: 0, nao: 0, abstencao: 0, obstrucao: 0, ausente: 0 };
      for (const v of votos) {
        const tipo = (v.tipoVoto || "").toLowerCase();
        if (tipo === "sim") resumo.sim++;
        else if (tipo.includes("n") && tipo.includes("o")) resumo.nao++;
        else if (tipo.includes("abst")) resumo.abstencao++;
        else if (tipo.includes("obstr")) resumo.obstrucao++;
        else resumo.ausente++;
      }

      const doc = {
        votacaoId,
        data: votacao.dataHoraRegistro || votacao.data || null,
        siglaOrgao: votacao.siglaOrgao || "Plenario",
        descricao: votacao.descricao || "",
        aprovacao: votacao.aprovacao !== undefined ? votacao.aprovacao : null,
        resumoVotos: resumo,
        totalVotos: votos.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection("votacoes").doc(String(votacaoId)).set(doc, { merge: true });

      // Salvar votos individuais como subcollection
      const batch = db.batch();
      let batchCount = 0;
      for (const v of votos) {
        const deputadoId = v.deputado_ ? String(v.deputado_.id) : "unknown";
        const votoRef = db.collection("votacoes").doc(String(votacaoId))
          .collection("votos").doc(deputadoId);
        batch.set(votoRef, {
          deputadoId,
          nome: v.deputado_ ? v.deputado_.nome : "",
          siglaPartido: v.deputado_ ? v.deputado_.siglaPartido : "",
          siglaUf: v.deputado_ ? v.deputado_.siglaUf : "",
          voto: v.tipoVoto || "",
          dataHora: votacao.dataHoraRegistro || null
        });
        batchCount++;
        if (batchCount >= 490) {
          await batch.commit();
          batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();

      // Indexar voto por deputado (para timeline)
      for (const v of votos) {
        if (v.deputado_ && v.deputado_.id) {
          const depId = String(v.deputado_.id);
          const votoDepRef = db.collection("politicos").doc(depId)
            .collection("votacoes").doc(String(votacaoId));
          await votoDepRef.set({
            votacaoId,
            data: votacao.dataHoraRegistro || null,
            descricao: votacao.descricao || "",
            voto: v.tipoVoto || "",
            siglaOrgao: votacao.siglaOrgao || "Plenario"
          }, { merge: true });
        }
      }

      successCount++;
      console.log(`  [${successCount}/${votacoes.length}] Votacao ${votacaoId} - ${votos.length} votos`);
    } catch (err) {
      console.error(`  ERRO votacao ${votacao.id}: ${err.message}`);
      errorCount++;
    }
    await delay(DELAY_MS);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== Ingestao Votacoes Completa ===");
  console.log(`Sucesso: ${successCount} | Erros: ${errorCount}`);
  console.log(`Tempo total: ${elapsed} minutos`);
  process.exit(0);
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
