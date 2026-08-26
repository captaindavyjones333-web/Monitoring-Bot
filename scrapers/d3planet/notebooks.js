import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { parseDetailSpecs } from "./parseSpecs.js";
import { detectBrand } from "../../core/notebookAttributes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORE = "3dplanet.am";
const BASE_URL = "https://3dplanet.am";
// No brand filter — this pulls every brand in the "laptops" category, so
// Apple/MacBook entries are excluded afterwards (they're already covered
// by the separate macbooks scraper) rather than filtered server-side.
const LIST_URL = "https://3dplanet.am/hy/store/laptops?sort=none";
const CACHE_DIR = path.join(__dirname, "..", "..", "cache", "notebooks");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

const PAGE_DELAY_MS = 300;
const DETAIL_DELAY_MS = 300;

const APPLE_RE = /\bapple\b|\bmac\s?book\b|\bmacbook\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanText(t = "") {
  return t.replace(/\s+/g, " ").trim();
}

function parsePriceValue(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : null;
}

/** slug from the product URL, used as a stable surrogate id (this store
 * doesn't expose a numeric product id in the listing markup) */
function idFromUrl(url) {
  const parts = url.split("/").filter(Boolean);
  return parts[parts.length - 1] || url;
}

async function getTotalPages() {
  const res = await axios.get(LIST_URL, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  let max = 1;
  $("#paginationWrapper a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/[?&]page=(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return max;
}

function buildPageUrl(page) {
  if (page === 1) return LIST_URL;
  const sep = LIST_URL.includes("?") ? "&" : "?";
  return `${LIST_URL}${sep}page=${page}`;
}

async function fetchListingPage(page) {
  const url = buildPageUrl(page);
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);

  const products = [];
  $("h3").each((_, el) => {
    const name = cleanText($(el).text());
    const card = $(el).closest("div");
    const detailUrl = card.find("a[href*='/store/product/']").first().attr("href");
    if (!name || !detailUrl) return;

    const fullUrl = detailUrl.startsWith("http") ? detailUrl : `${BASE_URL}${detailUrl}`;
    const thumbnail = card.find("img").not("[alt='']").first().attr("src") || null;

    products.push({ name, url: fullUrl, thumbnail });
  });
  return products;
}

async function fetchAllListingStubs() {
  const totalPages = await getTotalPages();
  console.log(`[3dplanet/notebooks] ${totalPages} page(s)`);

  let all = [];
  for (let page = 1; page <= totalPages; page++) {
    const products = await fetchListingPage(page);
    console.log(`[3dplanet/notebooks] page ${page} -> ${products.length} product(s)`);
    all = all.concat(products);
    await sleep(PAGE_DELAY_MS);
  }

  // de-dupe by URL (same defensive approach as the macbooks scraper)
  const seenUrls = new Set();
  const unique = [];
  for (const p of all) {
    if (seenUrls.has(p.url)) continue;
    seenUrls.add(p.url);
    unique.push(p);
  }
  if (unique.length !== all.length) {
    console.warn(`[3dplanet/notebooks] removed ${all.length - unique.length} duplicate url(s)`);
  }

  const nonApple = unique.filter((p) => !APPLE_RE.test(p.name));
  const skippedApple = unique.length - nonApple.length;
  if (skippedApple > 0) {
    console.log(`[3dplanet/notebooks] skipped ${skippedApple} Apple/MacBook product(s) — handled by the macbooks scraper`);
  }

  return nonApple;
}

async function fetchProductDetail(puppeteerPage, stub) {
  try {
    await puppeteerPage.goto(stub.url, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));

    const price = await puppeteerPage
      .$eval("#price", (el) => {
        const raw = el.getAttribute("data-price") || el.textContent;
        const cleaned = raw ? raw.replace(/[^\d.]/g, "") : null;
        return cleaned ? parseFloat(cleaned) : null;
      })
      .catch(() => null);

    let installment_price = null;
    try {
      const modalBtn = await puppeteerPage.$("#openLoanModal");
      if (modalBtn) {
        await modalBtn.click();
        await new Promise((r) => setTimeout(r, 1000));
        installment_price = await puppeteerPage
          .$eval("#loanPrice", (el) => parseFloat(el.value) || null)
          .catch(() => null);
      }
    } catch {
      installment_price = null;
    }

    const html = await puppeteerPage.content();
    const specs = parseDetailSpecs(html);

    return {
      id: idFromUrl(stub.url),
      store: STORE,
      name: stub.name,
      brand: detectBrand(stub.name, []),
      price,
      installment_price,
      url: stub.url,
      thumbnail: stub.thumbnail,
      specs,
      scraped_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[3dplanet/notebooks] failed to fetch detail for ${stub.url}: ${err.message}`);
    return null;
  }
}

export async function scrape3DPlanetNotebooks() {
  const stubs = await fetchAllListingStubs();
  console.log(`[3dplanet/notebooks] fetching detail pages for ${stubs.length} product(s)...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
    ],
  });
  const puppeteerPage = await browser.newPage();
  await puppeteerPage.setUserAgent(HEADERS["User-Agent"]);

  const normalizedOut = [];
  try {
    for (const [i, stub] of stubs.entries()) {
      console.log(`[3dplanet/notebooks] (${i + 1}/${stubs.length}) ${stub.name}`);
      const product = await fetchProductDetail(puppeteerPage, stub);
      if (product) normalizedOut.push(product);
      await sleep(DETAIL_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const noBrand = normalizedOut.filter((p) => !p.brand).length;
  if (noBrand > 0) {
    console.warn(`[3dplanet/notebooks] ${noBrand} product(s) had no brand detected — check name matching`);
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, "3dplanet.raw.json"),
    JSON.stringify({ stubs, normalized: normalizedOut }, null, 2),
  );
  fs.writeFileSync(
    path.join(CACHE_DIR, "3dplanet.json"),
    JSON.stringify(normalizedOut, null, 2),
  );

  console.log(`[3dplanet/notebooks] done — ${normalizedOut.length} product(s) saved to ${CACHE_DIR}`);
  return normalizedOut;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  scrape3DPlanetNotebooks().catch((err) => {
    console.error("[3dplanet/notebooks] fatal error:", err);
    process.exit(1);
  });
}