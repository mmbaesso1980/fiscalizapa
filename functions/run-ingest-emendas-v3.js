/**
 * run-ingest-emendas-v3.js
 * Bloco 6 - Emendas Parlamentares v3 (CORRIGIDO)
 * 
 * FIXES:
 * 1. Usa projectId correto: fiscallizapa (onde o app le)
 * 2. Salva na collection TOP-LEVEL 'emendas' (compativel com EmendasAba.jsx)
 * 3. Le deputados de 'deputados_federais' (collection real do app)
 * 4. Analise critica completa: IDH, show/lazer, RP9, execucao
 *
 * Uso: cd functions && node run-ingest-emendas-v3.js
 * Requer: PORTAL_API_KEY no env ou usa default
 */
const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "fiscallizapa" });
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
  const liq = e.valorLiquidado || 0;
  const taxa = emp > 0 ? (pag / emp * 100) : 0;

  // Execucao
  if (emp > 0 && taxa < 30)
    alertas.push(`BAIXA EXECUCAO: ${taxa.toFixed(0)}% pago. Recurso parado.`);
  if (emp > 0 && pag === 0)
    alertas.push(`SEM PAGAMENTO: Empenhado mas nada pago.`);
  if (emp > 5000000)
    alertas.push(`VALOR ELEVADO: R$ ${(emp/1e6).toFixed(1)}M.`);

  // IDH
  const loc = e.localidadeDoGasto || '';
  const uf = loc.substring(0, 2).toUpperCase();
  const idh = IDH_UF[uf];
  if (idh && idh < 0.67)
    alertas.push(`REGIAO VULNERAVEL: IDH ${idh.toFixed(3)} (${uf}).`);

  // Tipo emenda
  const tipo = (e.tipoEmenda || '').toUpperCase();
  if (tipo.includes('RELATOR'))
    alertas.push(`EMENDA DE RELATOR (RP9): Menos transparente.`);
  if (tipo.includes('ESPECIAL'))
    alertas.push(`TRANSFERENCIA ESPECIAL: Sem convenio.`);

  // Show/Lazer em regiao carente
  const funcao = (e.nomeFuncao || e.codigoFuncao || '').toUpperCase();
  const isShow = funcao.includes('CULTURA') || funcao.includes('DESPORTO') ||
    funcao.includes('LAZER') || funcao.includes('SHOW') || funcao.includes('EVENTO');
  if (isShow && idh && idh < 0.70)
    alertas.push(`SHOW EM REGIAO CARENTE: ${funcao} com IDH ${idh.toFixed(3)}. Prioridade?`);
  if (isShow && emp > 1000000)
    alertas.push(`SHOW MILIONARIO: R$ ${(emp/1e6).toFixed(1)}M em evento.`);

  return {
    taxaExecucao: Math.round(taxa),
    alertas,
    criticidade: alertas.length >= 3 ? 'ALTA' : alertas.length >= 1 ? 'MEDIA' : 'BAIXA',
    idhLocal: idh || null,
    ufLocal: uf,
    isShow
  };
}

async function main() {
  console.log("=== EMENDAS v3 - Bloco 6 (CORRIGIDO) ===");
  console.log("Projeto: fiscallizapa | Collection: emendas (top-level)");

  // Read from deputados_federais (the real collection)
  const snap = await db.collection("deputados_federais").get();
  const deps = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.nome);
  console.log(`${deps.length} deputados federais encontrados.`);

  const anos = [2023, 2024, 2025];
  let totalEmendas = 0, processedDeps = 0;

  for (const dep of deps) {
    let allEmendas = [];
    for (const ano of anos) {
      try {
        const em = await fetchAll(dep.nome, ano);
        allEmendas = allEmendas.concat(em.map(e => ({ ...e, anoConsulta: ano })));
      } catch (err) {
        console.log(`  ERR ${dep.nome} ${ano}: ${err.message}`);
      }
    }

    if (!allEmendas.length) continue;
    processedDeps++;
    console.log(`  ${dep.nome}: ${allEmendas.length} emendas`);

    let sumEmp = 0, sumPag = 0, alertCount = 0;

    for (const e of allEmendas) {
      const a = analisar(e);
      const eid = e.codigoEmenda || `${e.ano || e.anoConsulta}-${Math.random().toString(36).substr(2,8)}`;

      // Save to TOP-LEVEL emendas collection (EmendasAba.jsx reads this)
      await db.collection("emendas").doc(String(eid)).set({
        parlamentarId: dep.id,
        autorId: dep.id,
        autorNome: dep.nome,
        autorPartido: dep.partido || '',
        autorUf: dep.uf || '',
        codigo: e.codigoEmenda || '',
        ano: e.ano || e.anoConsulta,
        tipo: e.tipoEmenda || '',
        localidade: e.localidadeDoGasto || '',
        uf: a.ufLocal,
        municipioNome: e.localidadeDoGasto || '',
        funcao: e.nomeFuncao || e.codigoFuncao || '',
        subfuncao: e.nomeSubfuncao || e.codigoSubfuncao || '',
        objetoResumo: e.nomeFuncao || '',
        programa: e.nomePrograma || '',
        valorEmpenhado: e.valorEmpenhado || 0,
        valorLiquidado: e.valorLiquidado || 0,
        valorPago: e.valorPago || 0,
        taxaExecucao: a.taxaExecucao,
        alertas: a.alertas,
        criticidade: a.criticidade,
        idhLocal: a.idhLocal,
        isShow: a.isShow,
        ingestedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      sumEmp += e.valorEmpenhado || 0;
      sumPag += e.valorPago || 0;
      alertCount += a.alertas.length;
      totalEmendas++;
    }

    // Update deputy with summary
    await db.collection("deputados_federais").doc(dep.id).set({
      emendasResumo: {
        total: allEmendas.length,
        empenhado: sumEmp,
        pago: sumPag,
        taxaExecucao: sumEmp > 0 ? Math.round(sumPag/sumEmp*100) : 0,
        alertas: alertCount,
        atualizado: new Date().toISOString()
      }
    }, { merge: true });
  }

  console.log(`\nConcluido: ${totalEmendas} emendas de ${processedDeps} deputados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
