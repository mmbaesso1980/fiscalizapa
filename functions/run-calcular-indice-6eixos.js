#!/usr/bin/env node
/**
 * run-calcular-indice-6eixos.js
 * Pipeline completo: 6 eixos + indice final para TODOS os deputados.
 * Coleta dados reais da Camara API.
 *
 * Eixo 1 - Presenca e Assiduidade (20%) - plenario + comissoes
 * Eixo 2 - Protagonismo e Articulacao (20%) - relatorias, cargos
 * Eixo 3 - Producao Legislativa Qualificada (20%) - PL/PEC/PLP
 * Eixo 4 - Fiscalizacao e Controle (15%) - RIC, PFC, REQ
 * Eixo 5 - Posicionamento e Fidelidade (15%) - votacoes nominais
 * Eixo 6 - Eficiencia Fiscal e Custo do Mandato (10%) - CEAP
 *
 * Uso: node run-calcular-indice-6eixos.js [--only=204536]
 */
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2";
const DELAY_MS = 400;
const YEARS = [2023, 2024, 2025, 2026];
const COD_SESSAO_DELIBERATIVA = 110;
const LEGISLATURA = 57;
const TETO_CEAP_ANUAL = 540000; // ~R$45k/mes

const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith("--only="));
const ONLY_ID = onlyArg ? onlyArg.split("=")[1] : null;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPaginated(url, params, maxPages = 50) {
  const all = [];
  let page = 1;
  while (page <= maxPages) {
    try {
      const resp = await axios.get(url, {
        params: { ...params, pagina: page, itens: 100 },
        headers: { Accept: "application/json" },
        timeout: 30000,
      });
      const dados = resp.data.dados;
      if (!dados || dados.length === 0) break;
      all.push(...dados);
      if (dados.length < 100) break;
      page++;
      await delay(DELAY_MS);
    } catch (err) {
            const st = err.response && err.response.status;
      if (st === 404 || st === 400) break;
      console.error(`  fetch err ${url} p${page}: ${err.message}`);
      break;
    }
  }
  return all;
}

// ========== EIXO 1: PRESENCA E ASSIDUIDADE (20%) ==========
// 70% plenario + 30% comissoes

async function fetchSessoesPlenario() {
  const todas = {};
  for (const year of YEARS) {
    const hoje = new Date();
    const dataFim = year < hoje.getFullYear() ? `${year}-12-31` : hoje.toISOString().split("T")[0];
    const sessoes = await fetchPaginated(`${CAMARA_API}/eventos`, {
      dataInicio: `${year}-02-01`,
      dataFim,
      codTipoEvento: COD_SESSAO_DELIBERATIVA,
      ordem: "ASC",
      ordenarPor: "dataHoraInicio",
    });
    const realizadas = sessoes.filter(s => s.situacao && s.situacao !== "Cancelada" && s.situacao !== "Cancelado");
    todas[year] = { sessoes: realizadas, ids: new Set(realizadas.map(s => s.id)) };
    console.log(`  Plenario ${year}: ${realizadas.length} sessoes`);
    await delay(DELAY_MS);
  }
  return todas;
}

async function calcEixo1(depId, sessoesPlenario) {
  // Presenca plenario
  let totalPlenPresente = 0, totalPlenSessoes = 0;
  for (const year of YEARS) {
    const sp = sessoesPlenario[year];
    if (!sp || sp.sessoes.length === 0) continue;
    const eventos = await fetchPaginated(`${CAMARA_API}/deputados/${depId}/eventos`, {
      dataInicio: `${year}-02-01`,
      dataFim: year < new Date().getFullYear() ? `${year}-12-31` : new Date().toISOString().split("T")[0],
      ordem: "ASC",
      ordenarPor: "dataHoraInicio",
    }, 20);
    const presentes = new Set(eventos.filter(e => sp.ids.has(e.id)).map(e => e.id));
    totalPlenPresente += Math.min(presentes.size, sp.sessoes.length);
    totalPlenSessoes += sp.sessoes.length;
    await delay(DELAY_MS);
  }
  const pctPlenario = totalPlenSessoes > 0 ? (totalPlenPresente / totalPlenSessoes) * 100 : 0;

  // Presenca comissoes - usar orgaos do deputado
  let pctComissoes = 50; // fallback
  try {
    const orgaos = await fetchPaginated(`${CAMARA_API}/deputados/${depId}/orgaos`, {}, 5);
    const comissoes = orgaos.filter(o => o.siglaOrgao && o.siglaOrgao.startsWith("C"));
    pctComissoes = comissoes.length > 0 ? Math.min(100, comissoes.length * 15) : 30;
  } catch (e) { /* fallback */ }

  const eixo1 = 0.7 * pctPlenario + 0.3 * pctComissoes;
  return {
    eixo1: Number(Math.min(100, Math.max(0, eixo1)).toFixed(1)),
    presencaPlenario: Number(pctPlenario.toFixed(1)),
    presencaComissoes: Number(pctComissoes.toFixed(1)),
    sessoesPresente: totalPlenPresente,
    sessoesTotal: totalPlenSessoes,
  };
}

// ========== EIXO 2: PROTAGONISMO E ARTICULACAO (20%) ==========
// Relatorias, cargos em orgaos, liderancas

async function calcEixo2(depId) {
  let pontos = 0;

  // Relatorias
  try {
    const relatorias = await fetchPaginated(`${CAMARA_API}/proposicoes`, {
      idDeputadoRelator: depId,
      ano: 2025,
      ordem: "DESC",
      ordenarPor: "id",
    }, 5);
    pontos += Math.min(relatorias.length * 5, 30);
  } catch (e) { /* skip */ }

  // Orgaos com cargo (presidente, vice, etc)
  try {
    const orgaos = await fetchPaginated(`${CAMARA_API}/deputados/${depId}/orgaos`, {}, 5);
    orgaos.forEach(o => {
      const titulo = (o.titulo || "").toLowerCase();
      if (titulo.includes("presidente")) pontos += 15;
      else if (titulo.includes("vice")) pontos += 10;
      else if (titulo.includes("titular")) pontos += 3;
    });
  } catch (e) { /* skip */ }

    // Frentes removidas (API 400)

  const eixo2 = Math.min(100, pontos);
  return { eixo2: Number(eixo2.toFixed(1)) };
}

// ========== EIXO 3: PRODUCAO LEGISLATIVA QUALIFICADA (20%) ==========

async function calcEixo3(depId) {
  let pontos = 0;
  const tiposRelevantes = ["PL", "PEC", "PLP", "PDL"];

  for (const year of YEARS) {
    try {
      const props = await fetchPaginated(`${CAMARA_API}/proposicoes`, {
        idDeputadoAutor: depId,
        ano: year,
        ordem: "DESC",
        ordenarPor: "id",
      }, 5);

      props.forEach(p => {
        const sigla = (p.siglaTipo || "").toUpperCase();
        if (tiposRelevantes.includes(sigla)) {
          pontos += sigla === "PEC" ? 4 : sigla === "PLP" ? 3 : 2;
        } else if (sigla === "REQ") {
          pontos += 1;
        } else {
          pontos += 2;
        }
      });
    } catch (e) { /* skip */ }
    await delay(DELAY_MS);
  }

  const eixo3 = Math.min(100, pontos);
  return { eixo3: Number(eixo3.toFixed(1)), totalProposicoes: pontos };
}

// ========== EIXO 4: FISCALIZACAO E CONTROLE (15%) ==========

async function calcEixo4(depId) {
  let pontos = 0;
  const tiposFiscalizacao = ["RIC", "PFC", "PDC", "RCP"];

  for (const year of YEARS) {
    try {
      const props = await fetchPaginated(`${CAMARA_API}/proposicoes`, {
        idDeputadoAutor: depId,
        ano: year,
        ordem: "DESC",
        ordenarPor: "id",
      }, 5);

      props.forEach(p => {
        const sigla = (p.siglaTipo || "").toUpperCase();
        if (tiposFiscalizacao.includes(sigla)) {
          pontos += sigla === "RCP" ? 10 : sigla === "PFC" ? 8 : 5;
        }
      });
    } catch (e) { /* skip */ }
    await delay(DELAY_MS);
  }

  const eixo4 = Math.min(100, pontos);
  return { eixo4: Number(eixo4.toFixed(1)) };
}

// ========== EIXO 5: POSICIONAMENTO E FIDELIDADE (15%) ==========

async function calcEixo5(depId) {
  let totalVotacoes = 0;
  let presencaVotacoes = 0;

  // Buscar votacoes do deputado
  try {
    for (const year of [2024, 2025, 2026]) {
      const votacoes = await fetchPaginated(`${CAMARA_API}/deputados/${depId}/eventos`, {
        dataInicio: `${year}-02-01`,
        dataFim: year < new Date().getFullYear() ? `${year}-12-31` : new Date().toISOString().split("T")[0],
        ordem: "ASC",
        ordenarPor: "dataHoraInicio",
      }, 10);
      // Filtrar eventos que sao votacoes
      const vots = votacoes.filter(v => {
        const desc = (v.descricaoTipo || "").toLowerCase();
        return desc.includes("deliberativ") || desc.includes("vota");
      });
      totalVotacoes += vots.length;
      presencaVotacoes += vots.length; // se aparece no evento, estava presente
      await delay(DELAY_MS);
    }
  } catch (e) { /* skip */ }

  const pctVotacoes = totalVotacoes > 0 ? Math.min(100, (presencaVotacoes / Math.max(totalVotacoes, 1)) * 100) : 50;

  // Score base: 40% presenca votacoes + 60% participacao ativa
  const eixo5 = Math.min(100, 0.4 * pctVotacoes + 0.6 * Math.min(100, totalVotacoes * 2));
  return { eixo5: Number(eixo5.toFixed(1)), totalVotacoes };
}

// ========== EIXO 6: EFICIENCIA FISCAL (10%) ==========
async function calcEixo6(depId) {
  let gastoTotal = 0;
  try {
    const doc = await db.collection("deputados_federais").doc(String(depId)).get();
    if (doc.exists) {
      const data = doc.data();
      const ceap = data.totalGastos || data.totalGasto || 0;
      const vg = (data.verbaGabinete && data.verbaGabinete.totalGasto) ? data.verbaGabinete.totalGasto : 0;
      gastoTotal = ceap + vg;
    }
  } catch (e) { /* skip */ }

  const TETO = 5616000;
  const pctGasto = TETO > 0 ? gastoTotal / TETO : 0;
  const eixo6 = Math.max(0, Math.min(100, (1 - pctGasto) * 100));
  return { eixo6: Number(eixo6.toFixed(1)), gastoTotal };
}

// ========== INDICE FINAL ==========

function calcIndice(e1, e2, e3, e4, e5, e6) {
  const indice = 0.20 * e1 + 0.20 * e2 + 0.20 * e3 + 0.15 * e4 + 0.15 * e5 + 0.10 * e6;
  return Number(Math.min(100, Math.max(0, indice)).toFixed(1));
}

function classificar(score) {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bom";
  if (score >= 40) return "Regular";
  if (score >= 20) return "Ruim";
  return "Pessimo";
}

// ========== MAIN ==========

async function main() {
  console.log("=== Pipeline 6 Eixos TransparenciaBR ===");
  if (ONLY_ID) console.log(`Modo filtrado: apenas deputado ${ONLY_ID}`);

  // 1) Buscar sessoes plenario (global)
  console.log("\n--- Buscando sessoes plenario ---");
  const sessoesPlenario = await fetchSessoesPlenario();
  let totalSessoes = 0;
  for (const y of YEARS) totalSessoes += (sessoesPlenario[y] || { sessoes: [] }).sessoes.length;
  console.log(`Total sessoes deliberativas: ${totalSessoes}\n`);

  // 2) Buscar deputados do Firestore
  let snap;
  if (ONLY_ID) {
    const doc = await db.collection("deputados_federais").doc(ONLY_ID).get();
    snap = doc.exists ? { docs: [doc], empty: false } : { docs: [], empty: true };
  } else {
    snap = await db.collection("deputados_federais").limit(520).get();
  }
  if (snap.empty) { console.log("Nenhum deputado encontrado."); process.exit(1); }
  console.log(`Deputados a processar: ${snap.docs.length}\n`);

  // 3) Processar cada deputado
  const resultados = [];
  for (let i = 0; i < snap.docs.length; i++) {
    const doc = snap.docs[i];
    const depId = doc.id;
    const data = doc.data();
    const nome = data.nome || depId;
    console.log(`[${i + 1}/${snap.docs.length}] ${nome} (${depId})`);

    try {
      const r1 = await calcEixo1(depId, sessoesPlenario);
      console.log(`  E1 Presenca: ${r1.eixo1} (plen=${r1.presencaPlenario}%, com=${r1.presencaComissoes}%)`);

      const r2 = await calcEixo2(depId);
      console.log(`  E2 Protagonismo: ${r2.eixo2}`);

      const r3 = await calcEixo3(depId);
      console.log(`  E3 Producao: ${r3.eixo3}`);

      const r4 = await calcEixo4(depId);
      console.log(`  E4 Fiscalizacao: ${r4.eixo4}`);

      const r5 = await calcEixo5(depId);
      console.log(`  E5 Posicionamento: ${r5.eixo5}`);

      const r6 = await calcEixo6(depId);
      console.log(`  E6 Eficiencia: ${r6.eixo6} (gastos: R$${r6.gastoTotal.toLocaleString()})`);

      const indice = calcIndice(r1.eixo1, r2.eixo2, r3.eixo3, r4.eixo4, r5.eixo5, r6.eixo6);
      const classificacao = classificar(indice);
      console.log(`  INDICE: ${indice} - ${classificacao}\n`);

      // Salvar no Firestore
      const updateData = {
        eixo1_presenca: r1.eixo1,
        eixo2_protagonismo: r2.eixo2,
        eixo3_producao: r3.eixo3,
        eixo4_fiscalizacao: r4.eixo4,
        eixo5_posicionamento: r5.eixo5,
        eixo6_eficiencia: r6.eixo6,
        indice_transparenciabr: indice,
        classificacao_transparenciabr: classificacao,
        presencaPlenarioPct: r1.presencaPlenario,
        presencaComissoesPct: r1.presencaComissoes,
        sessoesPresente: r1.sessoesPresente,
        sessoesTotal: r1.sessoesTotal,
        presencaPct: r1.presencaPlenario,
        presencaClassificacao: r1.presencaPlenario >= 90 ? "Excelente" :
          r1.presencaPlenario >= 70 ? "Bom" :
          r1.presencaPlenario >= 50 ? "Regular" :
          r1.presencaPlenario >= 30 ? "Ruim" : "Pessimo",
        presencaEstimativa: false,
        indiceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection("deputados_federais").doc(depId).set(updateData, { merge: true });

      // Tambem salvar em politicos se existir
      try {
        const polDoc = await db.collection("politicos").doc(depId).get();
        if (polDoc.exists) {
          await db.collection("politicos").doc(depId).set(updateData, { merge: true });
        }
      } catch (e) { /* skip */ }

      resultados.push({ depId, nome, indice, classificacao });
    } catch (err) {
      console.error(`  ERRO processando ${nome}: ${err.message}\n`);
    }
  }

  // 4) Resumo
  console.log("\n=== RESUMO ===");
  resultados.sort((a, b) => b.indice - a.indice);
  resultados.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.nome}: ${r.indice} (${r.classificacao})`);
  });
  console.log(`\n${resultados.length} deputados processados com sucesso.`);
  process.exit(0);
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
