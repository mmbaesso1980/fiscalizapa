/**
 * run-ingest-emendas-v4.js
 * Bloco 6 - Emendas Parlamentares v4
 * Fixes: Better error logging, API response debugging
 */
const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "fiscallizapa" });
}
const db = admin.firestore();
const API_KEY = process.env.PORTAL_API_KEY || "717a95e01b072090f41940282eab700a";
const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

const IDH_UF = {
  AC:0.663,AL:0.649,AM:0.674,AP:0.674,BA:0.667,CE:0.682,DF:0.824,
  ES:0.740,GO:0.735,MA:0.639,MG:0.731,MS:0.729,MT:0.725,PA:0.646,
  PB:0.658,PE:0.673,PI:0.646,PR:0.749,RJ:0.761,RN:0.684,RO:0.690,
  RR:0.674,RS:0.769,SC:0.774,SE:0.665,SP:0.783,TO:0.699
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
let apiErrorLogged = false;

async function fetchPage(nome, ano, pagina) {
  const url = `${BASE}/emendas?ano=${ano}&nomeAutor=${encodeURIComponent(nome)}&pagina=${pagina}`;
  try {
    const res = await fetch(url, { headers: { "chave-api-dados": API_KEY } });
    if (!apiErrorLogged && !res.ok) {
      console.log(`API ERROR: status=${res.status} for ${nome} ${ano}`);
      const body = await res.text();
      console.log(`API BODY: ${body.substring(0, 200)}`);
      apiErrorLogged = true;
    }
    if (res.status === 429) { await sleep(10000); return fetchPage(nome, ano, pagina); }
    if (!res.ok) return [];
    const data = await res.json();
    if (!apiErrorLogged && pagina === 1 && data.length > 0) {
      console.log(`FIRST RESULT SAMPLE: ${JSON.stringify(data[0]).substring(0, 300)}`);
      apiErrorLogged = true;
    }
    return data;
  } catch (err) {
    console.log(`FETCH ERROR: ${err.message} for ${nome} ${ano}`);
    return [];
  }
}

async function fetchAll(nome, ano) {
  let all = [], p = 1;
  while (true) {
    const page = await fetchPage(nome, ano, p);
    if (!page || page.length === 0) break;
    all = all.concat(page);
    if (page.length < 15) break;
    p++;
    await sleep(700);
  }
  return all;
}

function analisar(e) {
  const alertas = [];
  const emp = e.valorEmpenhado || 0;
  const pag = e.valorPago || 0;
  const taxa = emp > 0 ? (pag / emp * 100) : 0;
  if (emp > 0 && taxa < 30) alertas.push(`BAIXA EXECUCAO: ${taxa.toFixed(0)}% pago.`);
  if (emp > 0 && pag === 0) alertas.push(`SEM PAGAMENTO: Empenhado mas nada pago.`);
  if (emp > 5000000) alertas.push(`VALOR ELEVADO: R$ ${(emp/1e6).toFixed(1)}M.`);
  const loc = e.localidadeDoGasto || '';
  const uf = loc.substring(0, 2).toUpperCase();
  const idh = IDH_UF[uf];
  if (idh && idh < 0.67) alertas.push(`REGIAO VULNERAVEL: IDH ${idh.toFixed(3)} (${uf}).`);
  const tipo = (e.tipoEmenda || '').toUpperCase();
  if (tipo.includes('RELATOR')) alertas.push(`EMENDA DE RELATOR (RP9).`);
  if (tipo.includes('ESPECIAL')) alertas.push(`TRANSFERENCIA ESPECIAL.`);
  const funcao = (e.nomeFuncao || e.codigoFuncao || '').toUpperCase();
  const isShow = funcao.includes('CULTURA') || funcao.includes('DESPORTO') || funcao.includes('LAZER');
  if (isShow && idh && idh < 0.70) alertas.push(`SHOW EM REGIAO CARENTE: ${funcao}.`);
  if (isShow && emp > 1000000) alertas.push(`SHOW MILIONARIO: R$ ${(emp/1e6).toFixed(1)}M.`);
  return {
    taxaExecucao: Math.round(taxa), alertas,
    criticidade: alertas.length >= 3 ? 'ALTA' : alertas.length >= 1 ? 'MEDIA' : 'BAIXA',
    idhLocal: idh || null, ufLocal: uf, isShow
  };
}

async function main() {
  console.log("=== EMENDAS v4 - Bloco 6 ===");
  console.log(`API_KEY: ${API_KEY.substring(0,6)}...${API_KEY.substring(API_KEY.length-4)}`);

  // Test API first
  console.log("\nTesting API with known query...");
  const testUrl = `${BASE}/emendas?ano=2024&pagina=1`;
  const testRes = await fetch(testUrl, { headers: { "chave-api-dados": API_KEY } });
  console.log(`Test (no author, 2024): status=${testRes.status}`);
  if (testRes.ok) {
    const testData = await testRes.json();
    console.log(`Test results: ${testData.length} emendas`);
    if (testData.length > 0) {
      console.log(`Sample keys: ${Object.keys(testData[0]).join(', ')}`);
      console.log(`Sample author: ${testData[0].nomeAutor || 'N/A'}`);
    }
  } else {
    const body = await testRes.text();
    console.log(`Test error body: ${body.substring(0, 300)}`);
    console.log("API KEY IS INVALID. Exiting.");
    process.exit(1);
  }

  const snap = await db.collection("deputados_federais").get();
  const deps = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.nome);
  console.log(`\n${deps.length} deputados federais encontrados.`);
  console.log(`Sample names: ${deps.slice(0,5).map(d => d.nome).join(', ')}`);

  const anos = [2023, 2024, 2025];
  let totalEmendas = 0, processedDeps = 0;

  for (const dep of deps) {
    let allEmendas = [];
    for (const ano of anos) {
      try {
        const em = await fetchAll(dep.nome, ano);
        allEmendas = allEmendas.concat(em.map(e => ({ ...e, anoConsulta: ano })));
      } catch (err) {
        console.log(` ERR ${dep.nome} ${ano}: ${err.message}`);
      }
    }
    if (!allEmendas.length) continue;
    processedDeps++;
    console.log(` ${dep.nome}: ${allEmendas.length} emendas`);

    let sumEmp = 0, sumPag = 0, alertCount = 0;
    for (const e of allEmendas) {
      const a = analisar(e);
      const eid = e.codigoEmenda || `${e.ano || e.anoConsulta}-${Math.random().toString(36).substr(2,8)}`;
      await db.collection("emendas").doc(String(eid)).set({
        parlamentarId: dep.id, autorId: dep.id, autorNome: dep.nome,
        autorPartido: dep.partido || '', autorUf: dep.uf || '',
        codigo: e.codigoEmenda || '', ano: e.ano || e.anoConsulta,
        tipo: e.tipoEmenda || '', localidade: e.localidadeDoGasto || '',
        uf: a.ufLocal, funcao: e.nomeFuncao || e.codigoFuncao || '',
        subfuncao: e.nomeSubfuncao || e.codigoSubfuncao || '',
        programa: e.nomePrograma || '',
        valorEmpenhado: e.valorEmpenhado || 0,
        valorLiquidado: e.valorLiquidado || 0,
        valorPago: e.valorPago || 0,
        taxaExecucao: a.taxaExecucao, alertas: a.alertas,
        criticidade: a.criticidade, idhLocal: a.idhLocal, isShow: a.isShow,
        ingestedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      sumEmp += e.valorEmpenhado || 0;
      sumPag += e.valorPago || 0;
      alertCount += a.alertas.length;
      totalEmendas++;
    }
    await db.collection("deputados_federais").doc(dep.id).set({
      emendasResumo: {
        total: allEmendas.length, empenhado: sumEmp, pago: sumPag,
        taxaExecucao: sumEmp > 0 ? Math.round(sumPag/sumEmp*100) : 0,
        alertas: alertCount, atualizado: new Date().toISOString()
      }
    }, { merge: true });
  }
  console.log(`\nConcluido: ${totalEmendas} emendas de ${processedDeps} deputados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
