#!/usr/bin/env node
/**
 * Coleta ranking.org.br (Câmara) e grava engines/scripts/ranking-seed-2025.json
 *
 * Pré-requisito: npm install playwright && npx playwright install chromium
 *   node engines/scripts/scrape-ranking-org-only.mjs
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "ranking-seed-2025.json");
const BASE_URL = "https://ranking.org.br/ranking/politicos";
const FILTER_CARGO = "Deputado Federal";
const PAGE_WAIT_MS = 2400;
const ROWS_PER_PAGE = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parsePartyUf(line) {
  const s = String(line || "").replace(/\s+/g, " ").trim();
  if (!s) return { partido: "", uf: "" };
  const parts = s.split(/\s*-\s*/).map((p) => p.trim());
  if (parts.length >= 2) {
    return { partido: parts[0], uf: parts[parts.length - 1].slice(0, 2).toUpperCase() };
  }
  return { partido: s, uf: "" };
}

async function extractRows(page) {
  return page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[class*="table_body"]')) {
      const posText = a.querySelector('[class*="placement"] p')?.textContent?.trim() || "";
      const pos = parseInt(String(posText).replace(/\D/g, ""), 10) || 0;
      const nome = a.querySelector('[class*="name"]')?.textContent?.trim() || "";
      const cargo = a.querySelector('[class*="cargo"]')?.textContent?.trim() || "";
      const partyLine = a.querySelector('[class*="political_party"]')?.textContent?.trim() || "";
      const scoreText = a.querySelector('[class*="score"] p')?.textContent?.trim() || "";
      const nota = parseFloat(String(scoreText).replace(/\./g, "").replace(",", ".")) || 0;
      const href = a.getAttribute("href") || "";
      const imgSrc = a.querySelector("img")?.getAttribute("src") || "";
      let idCamara = null;
      const m = String(imgSrc).match(/bandep\/(\d+)/) || String(imgSrc).match(/deputado\/(\d+)/);
      if (m) idCamara = parseInt(m[1], 10);
      out.push({ pos, nome, cargo, partyLine, nota, href, idCamara });
    }
    return out;
  });
}

function maxFederalRank(rows) {
  let m = 0;
  for (const r of rows) {
    if (r.cargo !== FILTER_CARGO || !r.nome || r.pos <= 0) continue;
    m = Math.max(m, r.pos);
  }
  return m;
}

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log("Opening", BASE_URL);
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 90000 });
  await sleep(3000);

  await page.getByLabel("Câmara", { exact: true }).click();
  await sleep(PAGE_WAIT_MS);
  await page.waitForLoadState("networkidle").catch(() => {});

  const maxPage = await page.evaluate(() => {
    const nums = [...document.querySelectorAll('button[class*="page_button"]')]
      .map((b) => parseInt(String(b.textContent || "").trim(), 10))
      .filter((n) => n > 0 && n < 1000);
    return nums.length ? Math.max(...nums) : 1;
  });
  console.log(`Pages: ${maxPage}`);

  const byRank = new Map();

  for (let p = 1; p <= maxPage; p++) {
    const expectedMinRank = (p - 1) * ROWS_PER_PAGE + 1;

    if (p > 1) {
      let rows = [];
      let ok = false;
      for (let retry = 0; retry < 10; retry++) {
        const btn = page.locator('button[class*="page_button"]').filter({ hasText: new RegExp(`^${p}$`) }).first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ force: true });
        await sleep(PAGE_WAIT_MS + retry * 350);
        await page.waitForLoadState("networkidle").catch(() => {});
        rows = await extractRows(page);
        const mx = maxFederalRank(rows);
        if (mx >= expectedMinRank - 2) {
          ok = true;
          break;
        }
        console.warn(`    retry ${retry + 1}: page ${p} max rank ${mx}, need ~>= ${expectedMinRank}`);
      }
      if (!ok) {
        console.error(`  page ${p}: failed to load expected ranks (max ${maxFederalRank(rows)})`);
      }
    }

    const rows = await extractRows(page);
    for (const r of rows) {
      if (!r.nome || r.pos <= 0) continue;
      if (r.cargo !== FILTER_CARGO) continue;
      const { partido, uf } = parsePartyUf(r.partyLine);
      byRank.set(r.pos, {
        rank_externo: r.pos,
        nome: r.nome,
        partido,
        uf,
        idCamara: r.idCamara || null,
        nota_ranking_org: r.nota,
        score: r.nota,
        cargo: FILTER_CARGO,
        fonte: "ranking.org.br",
        slug_ranking_org: r.href.replace(/^\//, "").split("?")[0] || "",
      });
    }
    console.log(`  page ${p}/${maxPage} → ${rows.length} rows, unique ranks ${byRank.size}`);
  }

  await browser.close();

  const seed = [...byRank.values()].sort((a, b) => a.rank_externo - b.rank_externo);
  writeFileSync(OUT, JSON.stringify(seed, null, 2), "utf-8");
  console.log(`Wrote ${seed.length} records to ${OUT}`);
  if (seed.length < 400) {
    console.warn(`Very few records (${seed.length}) — pagination may have failed`);
  }
}

scrape().catch((e) => {
  console.error(e);
  process.exit(1);
});
