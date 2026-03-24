/**
 * run-analisar-emendas.js
 * Bloco 6 - Analise critica de emendas ja ingeridas
 * Le emendas do Firestore e adiciona: IDH, taxa execucao, alertas criticos
 * User note: "a cidade que recebeu a emenda precisa mostrar pra que foi usado,
 * se foi usado, e o IDH. O robo deve ser critico, em especial com show
 * e a necessidade e a execucao da mesma."
 *
 * Uso: cd functions && node run-analisar-emendas.js
 */
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "fiscalizapa-e3fd4" });
const db = admin.firestore();

const IDH_UF = {
  AC:0.663,AL:0.649,AM:0.674,AP:0.674,BA:0.667,CE:0.682,DF:0.824,
  ES:0.740,GO:0.735,MA:0.639,MG:0.731,MS:0.729,MT:0.725,PA:0.646,
  PB:0.658,PE:0.673,PI:0.646,PR:0.749,RJ:0.761,RN:0.684,RO:0.690,
  RR:0.674,RS:0.769,SC:0.774,SE:0.665,SP:0.783,TO:0.699
};

function analisar(e) {
  const alertas = [];
  const emp = e.valorEmpenhado || 0;
  const pag = e.valorPago || 0;
  const taxa = emp > 0 ? (pag / emp * 100) : 0;

  // Execucao
  if (emp > 0 && taxa < 30)
    alertas.push(`BAIXA EXECUCAO: ${taxa.toFixed(0)}% pago. Recurso parado.`);
  if (emp > 0 && pag === 0)
    alertas.push(`SEM PAGAMENTO: Empenhado mas nada pago.`);
  if (emp > 5000000)
    alertas.push(`VALOR ELEVADO: R$ ${(emp/1e6).toFixed(1)}M.`);

  // IDH
  const loc = e.localidade || e.municipioNome || '';
  const ufRaw = e.uf || e.codigoUF || loc.slice(-2);
  const uf = ufRaw.toUpperCase();
  const idh = IDH_UF[uf];
  if (idh && idh < 0.67)
    alertas.push(`REGIAO VULNERAVEL: IDH ${idh.toFixed(3)} (${uf}).`);

  // Tipo
  const tipo = (e.tipoEmenda || e.tipo || '').toUpperCase();
  if (tipo.includes('RELATOR'))
    alertas.push(`EMENDA DE RELATOR (RP9): Menos transparente.`);
  if (tipo.includes('ESPECIAL'))
    alertas.push(`TRANSFERENCIA ESPECIAL: Sem convenio.`);

  // Show/Lazer em regiao carente
  const funcao = (e.funcao || e.objetoResumo || '').toUpperCase();
  const isShow = funcao.includes('CULTURA') || funcao.includes('DESPORTO') || funcao.includes('LAZER') || funcao.includes('SHOW') || funcao.includes('EVENTO');
  if (isShow && idh && idh < 0.70)
    alertas.push(`SHOW EM REGIAO CARENTE: ${funcao} com IDH ${idh.toFixed(3)}. Prioridade questionavel.`);
  if (isShow && emp > 1000000)
    alertas.push(`SHOW MILIONARIO: R$ ${(emp/1e6).toFixed(1)}M em evento. Proporcionalidade?`);

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
  console.log("=== ANALISE CRITICA EMENDAS ===");
  const snap = await db.collection("politicos").get();
  let totalAnalyzed = 0, totalAlerts = 0;

  for (const doc of snap.docs) {
    const emendasSnap = await doc.ref.collection("emendas").get();
    if (emendasSnap.empty) continue;

    let depAlerts = 0;
    for (const eDoc of emendasSnap.docs) {
      const e = eDoc.data();
      const a = analisar(e);
      await eDoc.ref.update({
        taxaExecucao: a.taxaExecucao,
        alertas: a.alertas,
        criticidade: a.criticidade,
        idhLocal: a.idhLocal,
        ufLocal: a.ufLocal,
        isShow: a.isShow,
        analyzedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      depAlerts += a.alertas.length;
      totalAnalyzed++;
    }
    totalAlerts += depAlerts;
    if (depAlerts > 0) console.log(`  ${doc.data().nome}: ${emendasSnap.size} emendas, ${depAlerts} alertas`);
  }

  console.log(`\nDone: ${totalAnalyzed} emendas analisadas, ${totalAlerts} alertas gerados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
