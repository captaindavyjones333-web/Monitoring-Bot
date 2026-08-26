import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { parseListingHtml } from "./parseListing.js";
import { parseDetailHtml } from "./parseDetail.js";
import { detectBrand, BRAND_LIST } from "../../core/notebookAttributes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORE = "notebookmall.am";
const LISTING_BASE = "https://notebookmall.am/product-category/notebooks/plain/";
const LISTING_QUERY = "query_type_brand=or&filter_brand=acer,asus,dell,hp,lenovo,msi,samsung";
const CACHE_DIR = path.join(__dirname, "..", "..", "cache", "notebooks");

const REQUEST_DELAY_MS = 300;
const MAX_PAGES_SAFETY = 100;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listingUrlForPage(page) {
  return page <= 1
    ? `${LISTING_BASE}?${LISTING_QUERY}`
    : `${LISTING_BASE}page/${page}/?${LISTING_QUERY}`;
}

const CF_CHALLENGE_TITLE_RE = /just a moment|checking your browser|attention required|please wait/i;
const CF_MAX_WAIT_MS = 30000;
const CF_POLL_MS = 1000;

// Cloudflare's interstitial page ("Just a moment...") goes network-idle on
// its own almost immediately, so goto()'s waitUntil resolves *before* the
// JS challenge finishes and redirects to the real page — page.content() at
// that point is still the challenge HTML, not the listing/detail page. We
// poll the page title until the challenge title is gone (or we give up).
async function waitOutCloudflareChallenge(puppeteerPage, maxWaitMs = CF_MAX_WAIT_MS) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const title = await puppeteerPage.title().catch(() => "");
    if (!CF_CHALLENGE_TITLE_RE.test(title)) return;
    await new Promise((r) => setTimeout(r, CF_POLL_MS));
  }
  console.warn("[notebookmall] Cloudflare challenge did not clear within the wait window");
}

// Plain axios gets a 403 on this store regardless of headers — it's behind
// a WAF/Cloudflare-style JS challenge, not just a User-Agent check. Puppeteer
// runs the challenge like a real browser and reuses cookies across
// navigations within the same page/session, so we fetch everything through it.
async function fetchHtml(puppeteerPage, url) {
  await puppeteerPage.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
  await waitOutCloudflareChallenge(puppeteerPage);
  // give the real page's own content a brief moment to settle after the
  // challenge's client-side redirect
  await new Promise((r) => setTimeout(r, 500));
  return puppeteerPage.content();
}

async function fetchAllListingStubs(puppeteerPage) {
  let page = 1;
  let allStubs = [];
  let maxPage = null;

  while (page <= MAX_PAGES_SAFETY) {
    const html = await fetchHtml(puppeteerPage, listingUrlForPage(page));
    const { stubs, maxPage: pageMax } = parseListingHtml(html);

    if (page === 1) {
      maxPage = pageMax;
      console.log(`[notebookmall] site reports ${maxPage ?? "unknown"} page(s)`);
    }

    if (stubs.length === 0) {
      if (CF_CHALLENGE_TITLE_RE.test(html)) {
        console.warn(`[notebookmall] page ${page} still shows the Cloudflare challenge page — not a real empty page`);
      } else {
        console.log(`[notebookmall] page ${page} empty — stopping pagination`);
      }
      break;
    }

    console.log(`[notebookmall] page ${page} -> ${stubs.length} products`);
    allStubs = allStubs.concat(stubs);

    if (maxPage !== null && page >= maxPage) break;

    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  // de-dupe defensively (e.g. a product pinned/repeated across pages)
  const seen = new Set();
  const deduped = allStubs.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  if (deduped.length !== allStubs.length) {
    console.warn(`[notebookmall] removed ${allStubs.length - deduped.length} duplicate product id(s)`);
  }

  return deduped;
}

function resolveBrand(name, brandHint) {
  if (brandHint) {
    const known = BRAND_LIST.find((b) => b.name.toLowerCase() === brandHint.toLowerCase());
    if (known) return known.name;
    return brandHint; // store gave us an explicit brand not in our known list — keep it rather than drop it
  }
  return detectBrand(name, []); // fallback: substring match against known brands
}

async function enrichStub(puppeteerPage, stub) {
  if (!stub.needs_detail_fetch) {
    return {
      id: stub.id,
      store: STORE,
      name: stub.name,
      brand: resolveBrand(stub.name, stub.brand_hint),
      price: stub.price,
      installment_price: null, // this store does not expose an installment/monthly price
      url: stub.url,
      thumbnail: stub.thumbnail,
      specs: stub.specs,
      scraped_at: new Date().toISOString(),
    };
  }

  try {
    const html = await fetchHtml(puppeteerPage, stub.url);
    const { specs, brandRaw } = parseDetailHtml(html);
    return {
      id: stub.id,
      store: STORE,
      name: stub.name,
      brand: resolveBrand(stub.name, stub.brand_hint || brandRaw),
      price: stub.price,
      installment_price: null,
      url: stub.url,
      thumbnail: stub.thumbnail,
      specs,
      scraped_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[notebookmall] failed to fetch detail for ${stub.url}: ${err.message}`);
    return {
      id: stub.id,
      store: STORE,
      name: stub.name,
      brand: resolveBrand(stub.name, stub.brand_hint),
      price: stub.price,
      installment_price: null,
      url: stub.url,
      thumbnail: stub.thumbnail,
      specs: stub.specs,
      scraped_at: new Date().toISOString(),
    };
  }
}

export async function scrapeNotebookmallNotebooks() {
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
  await puppeteerPage.setUserAgent(USER_AGENT);

  let normalizedOut = [];
  try {
    const stubs = await fetchAllListingStubs(puppeteerPage);
    console.log(`[notebookmall] enriching ${stubs.length} products...`);

    for (const [i, stub] of stubs.entries()) {
      console.log(
        `[notebookmall] (${i + 1}/${stubs.length}) ${stub.name}${stub.needs_detail_fetch ? " (fetching detail page)" : ""}`,
      );
      normalizedOut.push(await enrichStub(puppeteerPage, stub));
      if (stub.needs_detail_fetch) await sleep(REQUEST_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const noBrand = normalizedOut.filter((p) => !p.brand).length;
  if (noBrand > 0) {
    console.warn(`[notebookmall] ${noBrand} product(s) had no brand detected — check name matching`);
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, "notebookmall.raw.json"),
    JSON.stringify({ normalized: normalizedOut }, null, 2),
  );
  fs.writeFileSync(
    path.join(CACHE_DIR, "notebookmall.json"),
    JSON.stringify(normalizedOut, null, 2),
  );

  console.log(`[notebookmall] done — ${normalizedOut.length} products saved to ${CACHE_DIR}`);
  return normalizedOut;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  scrapeNotebookmallNotebooks().catch((err) => {
    console.error("[notebookmall] fatal error:", err);
    process.exit(1);
  });
}