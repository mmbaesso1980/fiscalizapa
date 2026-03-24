/**
 * run-ingest-emendas.js
 * Bloco 6 - Robo de Emendas Parlamentares v2
 * Busca emendas do Portal da Transparencia (CGU) e salva no Firestore.
 * ANALISE CRITICA: cidade, uso, execucao, IDH, tipo emenda.
 *
 * Uso: cd functions && node run-ingest-emendas.js
 * Requer: PORTAL_API_KEY no .env
 */

const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "fiscalizapa-e3fd4" });
}
const db = admin.firestore();

const API_KEY = process.env.PORTAL_API_KEY || "717a95e01b072090f41940282eab700a";
const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

// IDH por UF (PNUD 2021)
const IDH_UF = {
  AC:0.663,AL:0.649,AM:0.674,AP:0.674,BA:0.667,CE:0.682,DF:0.824,
  ES:0.740,GO:0.735,MA:0.639,MG:0.731,MS:0.729,MT:0.725,PA:0.646,
  PB:0.658,PE:0.673,PI:0.646,PR:0.749,RJ:0.761,RN:0.684,RO:0.690,
  RR:0.674,RS:0.769,SC:0.774,SE:0.665,SP:0.783,TO:0.699
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(nome, ano, pagina) {
  const url = `${BASE}/emendas?ano=${ano}&nomeAutor=${encodeURIComponent(nome)}&pagina=${pagina}`;
  const res = await fetch(url, { headers: { "chave-api-dados": API_KEY } });
  if (res.status === 429) { await sleep(10000); return fetchPage(nome, ano, pagina); }
  if (!res.ok) return [];
  return res.json();
}

async function fetchAll(nome, ano) {
  let all = [], p = 1;
  while (true) {
    const page = await fetchPage(nome, ano, p);
    if (!page || page.length === 0) break;
    all = all.concat(page);
    if (page.length < 15) break; // default page size
    p++;
    await sleep(700);
  }
  return all;
}

function analisar(e) {
  const alertas = [];
  const emp = e.valorEmpenhado || 0;
  const pag = e.valorPago || 0;
  const liq = e.valorLiquidado || 0;
  const taxa = emp > 0 ? (pag / emp * 100) : 0;

  if (emp > 0 && taxa < 30)
    alertas.push(`BAIXA EXECUCAO: ${taxa.toFixed(0)}% pago. Recurso pode estar parado.`);
  if (emp > 0 && pag === 0)
    alertas.push(`SEM PAGAMENTO: Empenhado mas nada pago. Questionar destino.`);
  if (emp > 5000000)
    alertas.push(`VALOR ELEVADO: R$ ${(emp/1e6).toFixed(1)}M - escrutinio extra.`);

  const uf = (e.localidadeDoGasto || '').substring(0, 2).toUpperCase();
  const idh = IDH_UF[uf];
  if (idh && idh < 0.67)
    alertas.push(`REGIAO VULNERAVEL: IDH ${idh.toFixed(3)} (${uf}). Recurso atende necessidade?`);

  const tipo = (e.tipoEmenda || '').toUpperCase();
  if (tipo.includes('RELATOR'))
    alertas.push(`EMENDA DE RELATOR (RP9): Menos transparente historicamente.`);
  if (tipo.includes('ESPECIAL'))
    alertas.push(`TRANSFERENCIA ESPECIAL: Sem convenio, fiscalizacao limitada.`);

  // Verifica se funcao e show/entretenimento
  const funcao = (e.nomeFuncao || e.codigoFuncao || '').toUpperCase();
  if (funcao.includes('CULTURA') || funcao.includes('DESPORTO') || funcao.includes('LAZER'))
    alertas.push(`DESTINO SHOW/LAZER: Emenda para ${funcao}. Essencial em regiao com IDH ${idh || '?'}?`);

  return {
    taxa: Math.round(taxa),
    alertas,
    criticidade: alertas.length >= 3 ? 'ALTA' : alertas.length >= 1 ? 'MEDIA' : 'BAIXA',
    idhLocal: idh || null,
    ufLocal: uf
  };
}

async function main() {
  console.log("=== ROBO EMENDAS v2 - Bloco 6 ===");
  const snap = await db.collection("politicos").get();
  const deps = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.nome);
  console.log(`${deps.length} deputados.`);

  const anos = [2023, 2024, 2025];
  let total = 0, processed = 0;

  for (const dep of deps) {
    let all = [];
    for (const ano of anos) {
      try {
        const em = await fetchAll(dep.nome, ano);
        all = all.concat(em.map(e => ({ ...e, anoConsulta: ano })));
      } catch (err) { console.log(`  ERR ${dep.nome} ${ano}: ${err.message}`); }
    }
    if (!all.length) continue;
    processed++;
    console.log(`  ${dep.nome}: ${all.length} emendas`);

    const ref = db.collection("politicos").doc(dep.id);
    let sumEmp = 0, sumPag = 0, alertCount = 0;

    for (const e of all) {
      const a = analisar(e);
      const eid = e.codigoEmenda || `${e.ano || e.anoConsulta}-${Math.random().toString(36).substr(2,8)}`;
      await ref.collection("emendas").doc(String(eid)).set({
        codigo: e.codigoEmenda || '',
        ano: e.ano || e.anoConsulta,
        tipo: e.tipoEmenda || '',
        autor: e.nomeAutor || dep.nome,
        localidade: e.localidadeDoGasto || '',
        uf: a.ufLocal,
        municipio: e.codigoMunicipio || '',
        funcao: e.nomeFuncao || e.codigoFuncao || '',
        subfuncao: e.nomeSubfuncao || e.codigoSubfuncao || '',
        valorEmpenhado: e.valorEmpenhado || 0,
        valorLiquidado: e.valorLiquidado || 0,
        valorPago: e.valorPago || 0,
        taxaExecucao: a.taxa,
        alertas: a.alertas,
        criticidade: a.criticidade,
        idhLocal: a.idhLocal,
        ingestedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      sumEmp += e.valorEmpenhado || 0;
      sumPag += e.valorPago || 0;
      alertCount += a.alertas.length;
      total++;
    }

    await ref.set({
      emendasResumo: {
        total: all.length, empenhado: sumEmp, pago: sumPag,
        taxaExecucao: sumEmp > 0 ? Math.round(sumPag/sumEmp*100) : 0,
        alertas: alertCount,
        atualizado: new Date().toISOString()
      }
    }, { merge: true });
  }

  console.log(`\nDone: ${total} emendas de ${processed} deputados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
