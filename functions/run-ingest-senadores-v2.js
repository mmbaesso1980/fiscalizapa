#!/usr/bin/env node
/**
 * run-ingest-senadores-v2.js
 * Script de ingestao completa de senadores via API Codante (dados reais CEAPS).
 * USA: https://apis.codante.io/senator-expenses
 * Resolve Issue #3 - senadores com score 0 e sem despesas
 */
const admin = require('firebase-admin');
const axios = require('axios');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CODANTE_API = 'https://apis.codante.io/senator-expenses';
const SENADO_API = 'https://legis.senado.leg.br/dadosabertos/senador';
const DELAY_MS = 500;
// Teto CEAPS anual (~R$33k/mes * 12 = R$396k), usamos R$800k para 2 anos
const TETO_CEAPS_LEGISLATURA = 800000;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllSenadores() {
  // Busca lista de senadores ativos via API oficial do Senado
  try {
    const resp = await axios.get(`${SENADO_API}/lista/atual`, {
      headers: { Accept: 'application/json' }, timeout: 30000
    });
    const lista = resp.data?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
    return lista.map(p => ({
      id: p.IdentificacaoParlamentar?.CodigoParlamentar,
      nome: p.IdentificacaoParlamentar?.NomeParlamentar,
      nomeCompleto: p.IdentificacaoParlamentar?.NomeCompletoParlamentar,
      foto: p.IdentificacaoParlamentar?.UrlFotoParlamentar,
      partido: p.IdentificacaoParlamentar?.SiglaPartidoParlamentar,
      uf: p.IdentificacaoParlamentar?.UfParlamentar,
      email: p.IdentificacaoParlamentar?.EmailParlamentar,
      sexo: p.IdentificacaoParlamentar?.SexoParlamentar,
    })).filter(s => s.id && s.nome);
  } catch (e) {
    console.error('Erro ao buscar lista senadores:', e.message);
    return [];
  }
}

async function fetchExpensesCodante(senadorNome) {
  // Busca despesas via Codante API - busca por nome
  try {
    const resp = await axios.get(`${CODANTE_API}/senators`, {
      params: { active: '1' }, timeout: 15000
    });
    const senators = resp.data?.data || [];
    // Encontra o senador pelo nome (match parcial)
    const nomeNorm = senadorNome.toLowerCase().replace(/[^a-z\s]/g, '');
    const found = senators.find(s => {
      const sNorm = s.name.toLowerCase().replace(/[^a-z\s]/g, '');
      return sNorm.includes(nomeNorm.split(' ')[0]) || nomeNorm.includes(sNorm.split(' ')[0]);
    });
    if (!found) return { total: 0, count: 0, codanteId: null };
    // Busca despesas do senador encontrado
    const expResp = await axios.get(`${CODANTE_API}/senators/${found.id}/expenses`, {
      params: { year: '2024' }, timeout: 15000
    });
    const meta = expResp.data?.meta || {};
    return {
      total: parseFloat(meta.expenses_sum || 0),
      count: parseInt(meta.expenses_count || 0),
      codanteId: found.id,
    };
  } catch (e) {
    return { total: 0, count: 0, codanteId: null };
  }
}

async function fetchExpensesSenado(senadorId, ano) {
  // Tenta API oficial do Senado - endpoint CEAPS
  try {
    const url = `https://www.senado.gov.br/transparencia/LAI/verba/${senadorId}.pdf`;
    // Endpoint real de despesas da API do Senado
    const resp = await axios.get(
      `https://legis.senado.leg.br/dadosabertos/senador/${senadorId}/despesas`,
      { params: { ano }, headers: { Accept: 'application/json' }, timeout: 15000 }
    );
    const dados = resp.data?.ConsSenadorDespesas?.Parlamentar?.Despesas?.Mes || [];
    const meses = Array.isArray(dados) ? dados : [dados].filter(Boolean);
    let total = 0, count = 0;
    meses.forEach(m => {
      const despesas = m?.Despesa || [];
      const arr = Array.isArray(despesas) ? despesas : [despesas].filter(Boolean);
      arr.forEach(d => {
        const val = parseFloat((d?.ValorTotal || '0').replace(',', '.'));
        if (!isNaN(val)) { total += val; count++; }
      });
    });
    return { total, count };
  } catch (e) {
    return { total: 0, count: 0 };
  }
}

function calculateRiskScore(totalGasto, teto) {
  if (totalGasto === 0) return 50; // neutro, sem dados
  const pct = totalGasto / teto;
  if (pct > 0.9) return 90;
  if (pct > 0.7) return 70;
  if (pct > 0.5) return 50;
  if (pct > 0.3) return 30;
  return 10;
}

async function main() {
  const args = process.argv.slice(2);
  const startYear = parseInt(args[0] || '2024');
  const endYear = parseInt(args[1] || '2025');
  console.log(`=== Ingestao Senadores v2 ===`);
  console.log(`Anos: ${startYear} a ${endYear}`);
  console.log(`Projeto: fiscallizapa`);
  console.log('---');

  const senadores = await fetchAllSenadores();
  console.log(`Buscando lista de senadores...`);
  console.log(`  -> ${senadores.length} senadores encontrados`);
  console.log(`\nTotal de senadores: ${senadores.length}`);

  let processados = 0;
  for (let i = 0; i < senadores.length; i++) {
    const s = senadores[i];
    console.log(`\n[${i + 1}/${senadores.length}] ${s.nome} (${s.partido}-${s.uf}) ID=${s.id}`);

    let totalGasto = 0, totalDespesas = 0;

    for (let ano = startYear; ano <= endYear; ano++) {
      const res = await fetchExpensesSenado(s.id, ano);
      totalGasto += res.total;
      totalDespesas += res.count;
      console.log(`  ${ano}: ${res.count} despesas (R$${res.total.toFixed(2)})`);
      await delay(DELAY_MS);
    }

    // Se API oficial retornou 0, tenta Codante como fallback
    if (totalGasto === 0) {
      console.log(`  -> Fallback: buscando via Codante API...`);
      const codante = await fetchExpensesCodante(s.nome);
      if (codante.total > 0) {
        totalGasto = codante.total;
        totalDespesas = codante.count;
        console.log(`  -> Codante: ${codante.count} despesas (R$${codante.total.toFixed(2)})`);
      }
      await delay(DELAY_MS);
    }

    const score = calculateRiskScore(totalGasto, TETO_CEAPS_LEGISLATURA);
    console.log(`  Score: ${score} | Total: R$${totalGasto.toFixed(2)}`);

    const docData = {
      id: s.id,
      nome: s.nome,
      nomeCompleto: s.nomeCompleto || s.nome,
      foto: s.foto || null,
      fotoUrl: s.foto || null,
      partido: s.partido || '',
      uf: s.uf || '',
      email: s.email || '',
      sexo: s.sexo || '',
      cargo: 'Senador Federal',
      totalGasto,
      numDespesas: totalDespesas,
      score,
      indice_transparenciabr: score,
      classificacao_transparenciabr: score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : score >= 40 ? 'Regular' : score >= 20 ? 'Ruim' : 'Pessimo',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('senadores').doc(String(s.id)).set(docData, { merge: true });
    processados++;
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`${processados} senadores processados com sucesso.`);
  process.exit(0);
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
