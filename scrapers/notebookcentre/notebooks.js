import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { parseListingHtml } from "./parseListing.js";
import { parseDetailHtml } from "./parseDetail.js";
import { detectBrand } from "../../core/notebookAttributes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORE = "notebookcentre.am";
const LISTING_URL = "https://notebookcentre.am/en/get-products";
const CATEGORY_ID = 121;
// From the URL you use on-site: ?brand=1&brand=16&brand=17&brand=18&brand=21&brand=22
const BRAND_FILTER_IDS = [1, 16, 17, 18, 21, 22];
const CACHE_DIR = path.join(__dirname, "..", "..", "cache", "notebooks");

const DETAIL_FETCH_DELAY_MS = 250; // one request per product — be gentle
const MAX_PAGES_SAFETY = 100; // hard stop in case the empty-page signal ever fails

const client = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent": "MonitoringBot/1.0 (+internal price comparison)",
    Accept: "text/html,application/json",
  },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * "Found results <span class="fw-semibold">: 90</span>" -> 90
 */
function parseTotal(totalHtml = "") {
  const m = totalHtml.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

async function fetchListingPage(page) {
  const { data } = await client.get(LISTING_URL, {
    params: {
      "brand[]": BRAND_FILTER_IDS,
      category: CATEGORY_ID,
      page,
    },
  });
  return data; // { products: "<html>", total: "<html>", ... }
}

async function fetchAllListingStubs() {
  let page = 1;
  let allStubs = [];
  let expectedTotal = null;

  while (page <= MAX_PAGES_SAFETY) {
    const data = await fetchListingPage(page);
    const stubs = parseListingHtml(data.products || "");

    if (page === 1) {
      expectedTotal = parseTotal(data.total || "");
      console.log(
        `[notebookcentre] site reports total: ${expectedTotal ?? "unknown"}`,
      );
    }

    if (stubs.length === 0) {
      console.log(`[notebookcentre] page ${page} empty — stopping pagination`);
      break;
    }

    console.log(`[notebookcentre] page ${page} -> ${stubs.length} products`);
    allStubs = allStubs.concat(stubs);
    page += 1;
    await sleep(DETAIL_FETCH_DELAY_MS);
  }

  if (expectedTotal !== null && allStubs.length !== expectedTotal) {
    console.warn(
      `[notebookcentre] scraped ${allStubs.length} products but site reports ${expectedTotal} — possible pagination mismatch, check manually`,
    );
  }

  return allStubs;
}

async function enrichStub(stub) {
  try {
    const { data: html } = await client.get(stub.url);
    const { specs } = parseDetailHtml(html);

    return {
      id: stub.id,
      store: STORE,
      name: stub.name,
      brand: detectBrand(stub.name, []),
      price: stub.price,
      installment_price: null,
      url: stub.url,
      thumbnail: stub.thumbnail,
      specs,
      scraped_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(
      `[notebookcentre] failed to fetch detail for ${stub.url}: ${err.message}`,
    );
    return null;
  }
}

export async function scrapeNotebookcentreNotebooks() {
  const stubs = await fetchAllListingStubs();
  console.log(
    `[notebookcentre] fetching detail pages for ${stubs.length} products...`,
  );

  const normalizedOut = [];
  for (const [i, stub] of stubs.entries()) {
    console.log(`[notebookcentre] (${i + 1}/${stubs.length}) ${stub.name}`);
    const enriched = await enrichStub(stub);
    if (enriched) normalizedOut.push(enriched);
    await sleep(DETAIL_FETCH_DELAY_MS);
  }

  const noBrand = normalizedOut.filter((p) => !p.brand).length;
  if (noBrand > 0) {
    console.warn(
      `[notebookcentre] ${noBrand} product(s) had no brand detected — check name matching`,
    );
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, "notebookcentre.raw.json"),
    JSON.stringify({ stubs, normalized: normalizedOut }, null, 2),
  );
  fs.writeFileSync(
    path.join(CACHE_DIR, "notebookcentre.json"),
    JSON.stringify(normalizedOut, null, 2),
  );

  console.log(
    `[notebookcentre] done — ${normalizedOut.length} products saved to ${CACHE_DIR}`,
  );
  return normalizedOut;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  scrapeNotebookcentreNotebooks().catch((err) => {
    console.error("[notebookcentre] fatal error:", err);
    process.exit(1);
  });
}
