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
const PAGE_WAIT_MS = 2200;

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
  let prevSnapshot = "";

  async function readFirstRowSnapshot() {
    return page.evaluate(() => {
      const a = document.querySelector('a[class*="table_body"]');
      if (!a) return "";
      const pos = a.querySelector('[class*="placement"] p')?.textContent?.trim() || "";
      const nome = a.querySelector('[class*="name"]')?.textContent?.trim() || "";
      return `${pos}|${nome}`;
    });
  }

  for (let p = 1; p <= maxPage; p++) {
    if (p > 1) {
      const btn = page.locator('button[class*="page_button"]').filter({ hasText: new RegExp(`^${p}$`) }).first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await sleep(PAGE_WAIT_MS);
      await page.waitForLoadState("networkidle").catch(() => {});
      for (let attempt = 0; attempt < 8; attempt++) {
        const snap = await readFirstRowSnapshot();
        if (snap && snap !== prevSnapshot) break;
        await sleep(400);
      }
    }

    const rows = await page.evaluate(() => {
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
        out.push({ pos, nome, cargo, partyLine, nota, href });
      }
      return out;
    });

    for (const r of rows) {
      if (!r.nome || r.pos <= 0) continue;
      if (r.cargo !== FILTER_CARGO) continue;
      const { partido, uf } = parsePartyUf(r.partyLine);
      byRank.set(r.pos, {
        rank_externo: r.pos,
        nome: r.nome,
        partido,
        uf,
        nota_ranking_org: r.nota,
        score: r.nota,
        cargo: FILTER_CARGO,
        fonte: "ranking.org.br",
        slug_ranking_org: r.href.replace(/^\//, "").split("?")[0] || "",
      });
    }
    prevSnapshot = await readFirstRowSnapshot();
    console.log(`  page ${p}/${maxPage} → ${rows.length} rows, unique ranks ${byRank.size}`);
  }

  await browser.close();

  const seed = [...byRank.values()].sort((a, b) => a.rank_externo - b.rank_externo);
  writeFileSync(OUT, JSON.stringify(seed, null, 2), "utf-8");
  console.log(`Wrote ${seed.length} records to ${OUT}`);
  if (seed.length !== 513) {
    console.warn(`Expected 513 deputies, got ${seed.length}`);
  }
}

scrape().catch((e) => {
  console.error(e);
  process.exit(1);
});
