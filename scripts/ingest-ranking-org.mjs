#!/usr/bin/env node
/**
 * ASMODEUS — Ingestão de Ranking Externo
 * Fonte: ranking.org.br/ranking/politicos
 * Destino: Firebase Firestore → coleção `ranking_externo`
 *
 * Uso:
 *   npm install playwright firebase-admin
 *   npx playwright install chromium
 *   node scripts/ingest-ranking-org.mjs
 *
 * Variáveis de ambiente necessárias:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

import { chromium } from 'playwright';
import admin from 'firebase-admin';

// ─── Firebase Admin ──────────────────────────────────────────────────────────
const serviceAccount = {
  type: 'service_account',
  project_id:   process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ─── Configurações ────────────────────────────────────────────────────────────
const BASE_URL     = 'https://ranking.org.br/ranking/politicos';
const FILTER_CARGO = 'Deputado Federal';
const BATCH_SIZE   = 400;
const DELAY_MS     = 1200;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function normalizeNome(nome) {
  return nome?.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
}

// ─── Scraper ──────────────────────────────────────────────────────────────────
async function scrapeRankingOrg() {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  console.log('🌐 Abrindo ranking.org.br...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  // Tentar aplicar filtro "Deputado Federal"
  try {
    const selectCargo = page.locator('select, [data-filter="cargo"]').first();
    if (await selectCargo.count() > 0) {
      await selectCargo.selectOption({ label: FILTER_CARGO });
      await sleep(2000);
      console.log(`✅ Filtro "${FILTER_CARGO}" aplicado`);
    }
  } catch (e) {
    console.warn('⚠️  Filtro de cargo não encontrado — coletando tudo');
  }

  const allPoliticos = [];
  let pagina = 1;
  let continuar = true;

  while (continuar) {
    console.log(`📄 Coletando página ${pagina}...`);

    await page.waitForSelector(
      '[class*="politician"], [class*="card"], [class*="ranking-item"], tr',
      { timeout: 10000 }
    ).catch(() => {});

    const dados = await page.evaluate(() => {
      const items = [];

      // Formato tabela
      document.querySelectorAll('tr[data-id], tr.politician-row').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          items.push({
            posicao: parseInt(cells[0]?.textContent?.replace(/\D/g, '')) || 0,
            nome:    cells[1]?.textContent?.trim() || '',
            partido: cells[2]?.textContent?.trim() || '',
            uf:      cells[3]?.textContent?.trim() || '',
            nota:    parseFloat(cells[4]?.textContent?.replace(',', '.')) || 0,
            cargo:   cells[5]?.textContent?.trim() || '',
            slug:    row.getAttribute('data-slug') || '',
          });
        }
      });

      // Formato cards/divs
      if (items.length === 0) {
        document.querySelectorAll('[class*="politici"], [class*="candidate"], [class*="ranking"]').forEach((el, idx) => {
          const nome = el.querySelector('[class*="name"], h2, h3, strong')?.textContent?.trim();
          const nota = parseFloat(el.querySelector('[class*="score"], [class*="grade"], [class*="nota"]')?.textContent?.replace(',', '.')) || 0;
          const info = el.querySelector('[class*="info"], [class*="party"], [class*="partido"]')?.textContent?.trim() || '';
          const pos  = el.querySelector('[class*="position"], [class*="rank"]')?.textContent?.trim();
          if (nome) items.push({ posicao: parseInt(pos) || idx + 1, nome, nota, info, slug: '' });
        });
      }

      return items;
    });

    if (dados.length === 0) {
      console.log('⛔ Nenhum dado encontrado nesta página — encerrando');
      continuar = false;
      break;
    }

    allPoliticos.push(...dados);
    console.log(`   ✔ ${dados.length} coletados (total: ${allPoliticos.length})`);

    const btnProx = page.locator(
      'button[aria-label*="próxima"], a[aria-label*="next"], [class*="next-page"]:not([disabled])'
    ).first();
    const temProx = await btnProx.count() > 0 && await btnProx.isEnabled().catch(() => false);

    if (temProx) {
      await btnProx.click();
      await sleep(DELAY_MS);
      pagina++;
    } else {
      continuar = false;
    }
  }

  await browser.close();
  console.log(`\n✅ Total coletado: ${allPoliticos.length} políticos`);
  return allPoliticos;
}

// ─── Normaliza e filtra Deputados Federais ────────────────────────────────────
function processarDados(raw) {
  return raw
    .filter(p => {
      const cargo = (p.cargo || p.info || '').toLowerCase();
      return cargo === '' || cargo.includes('deputado') || cargo.includes('federal');
    })
    .map((p, idx) => ({
      rank_externo:     p.posicao || idx + 1,
      nome:             p.nome?.trim() || '',
      nome_normalizado: normalizeNome(p.nome),
      partido:          p.partido || p.info?.split('·')[0]?.trim() || '',
      uf:               p.uf || p.info?.split('·')[1]?.trim() || '',
      nota_ranking_org: p.nota || 0,
      slug_ranking_org: p.slug || '',
      cargo:            FILTER_CARGO,
      fonte:            'ranking.org.br',
      atualizado_em:    admin.firestore.FieldValue.serverTimestamp(),
    }));
}

// ─── Grava no Firestore em batches ────────────────────────────────────────────
async function gravarFirestore(politicos) {
  const colRef = db.collection('ranking_externo');

  console.log('\n🗑️  Limpando ranking_externo...');
  const snap = await colRef.get();
  let delBatch = db.batch();
  let delCount = 0;
  for (const doc of snap.docs) {
    delBatch.delete(doc.ref);
    delCount++;
    if (delCount % BATCH_SIZE === 0) {
      await delBatch.commit();
      delBatch = db.batch();
    }
  }
  if (delCount % BATCH_SIZE !== 0) await delBatch.commit();
  console.log(`   ✔ ${delCount} docs removidos`);

  console.log('\n📥 Inserindo...');
  let writeBatch = db.batch();
  let writeCount = 0;

  for (const p of politicos) {
    const docId = p.nome_normalizado.replace(/\s+/g, '_').substring(0, 60) || `pol_${writeCount}`;
    writeBatch.set(colRef.doc(docId), p);
    writeCount++;
    if (writeCount % BATCH_SIZE === 0) {
      await writeBatch.commit();
      writeBatch = db.batch();
      console.log(`   ✔ ${writeCount} gravados...`);
    }
  }
  if (writeCount % BATCH_SIZE !== 0) await writeBatch.commit();
  console.log(`\n🔥 ${writeCount} políticos gravados em ranking_externo`);
}

// ─── Backup JSON local ────────────────────────────────────────────────────────
async function salvarBackupJSON(politicos) {
  const { writeFileSync } = await import('fs');
  const path = `./scripts/ranking-backup-${new Date().toISOString().slice(0,10)}.json`;
  writeFileSync(path, JSON.stringify(politicos, null, 2), 'utf-8');
  console.log(`\n💾 Backup: ${path}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔥 ASMODEUS — Ingestão ranking.org.br');
  console.log('═'.repeat(50));
  const raw       = await scrapeRankingOrg();
  const politicos = processarDados(raw);
  await salvarBackupJSON(politicos);
  await gravarFirestore(politicos);
  console.log('\n✅ Concluído! Coleção: ranking_externo');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
