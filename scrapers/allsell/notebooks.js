import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import { detectBrand } from "../../core/notebookAttributes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = "https://allsell.am";
const STORE = "allsell.am";

const CATEGORY_URLS = [
  "https://allsell.am/am/computer-equipment/notebooks",
];

const CACHE_DIR = path.join(__dirname, "..", "..", "cache", "notebooks");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

const DETAIL_FETCH_DELAY_MS = 300; // one request per product — be gentle
const PAGE_FETCH_DELAY_MS = 500;
const MAX_PAGES_SAFETY = 200; // hard stop in case the empty/no-new-products signal ever fails

// Products whose name matches this are skipped entirely (Apple runs its own
// pricing/ecosystem and isn't comparable via these specs — same convention
// requested for this store as the reference 3dplanet notebooks scraper).
const APPLE_NAME_PATTERN = /\bapple\b|\bmacbook\b/i;

/**
 * Armenian spec-table labels (Magento "additional attributes" table) ->
 * canonical field names, matching the shape already used by the other
 * store scrapers (redstore, notebookcentre) so matcherV2 keeps working
 * unchanged.
 *
 * "Գրաֆիկական քարտի տեսակ" (integrated vs discrete GPU category) is
 * intentionally left unmapped per instructions — we only want the actual
 * GPU model, not this category label.
 */
const LABEL_MAP = {
  "Ապրանքանիշ": "brand_raw",
  "Պրոցեսոր": "cpu_family",
  "Պրոցեսորի տեսակ": "cpu",
  "Էկրանի անկյունագիծ": "screen_inches_raw",
  "Էկրանի կետայնություն": "screen_resolution_raw", // resolution + display type combined, e.g. "1920×1200 FHD+ Oled"
  "Ներքին հիշողություն": "storage_raw",
  "Հիշողություն": "ram_raw",
  "Գրաֆիկական քարտ": "gpu",
  "Սենսորային էկրան": "touch_screen_raw",
  "Մուտք/Ելք": "ports",
  "Տեսախցիկ": "camera",
  "Օպերացիոն համակարգը": "os",
  "Աուդիո": "audio_system",
  "Պտտվող էկրան": "rotating_screen_raw",
  "Լուսավորվող ստեղնաշար": "backlit_keyboard_raw",
  "Երաշխիք": "warranty_raw",
};

// Labels we recognize but deliberately don't carry into specs.
const IGNORED_LABELS = new Set(["Գրաֆիկական քարտի տեսակ", "Face ID", "Touch ID"]);

const YES_NO = { "այո": true, "ոչ": false };

// Checked in order; word-boundaries keep e.g. "OLED" from matching inside
// "AMOLED" incorrectly and vice versa.
const DISPLAY_TYPE_PATTERN =
  /\b(AMOLED|OLED|QLED|IPS|TN|VA|Mini-LED|LED|LCD|Retina)\b/i;

function cleanText(t = "") {
  return t.replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePriceAmd(text = "") {
  const digits = String(text).replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/**
 * Converts an Armenian capacity string ("16 ԳԲ", "1 ՏԲ") to a GB number.
 * ԳԲ = GB, ՏԲ = TB, ՄԲ = MB. Returns null when unparseable.
 */
function parseArmenianCapacityGb(raw = "") {
  const m = String(raw).match(/([\d.]+)\s*(ՏԲ|ԳԲ|ՄԲ)/i);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === "ՏԲ") return value * 1024;
  if (unit === "ՄԲ") return value / 1024;
  return value; // ԳԲ
}

// ---------------------------------------------------------------------
// Listing pages
//
// The category page's pagination UI is a sliding window (page 1 only
// shows links up to ~5; paging further in reveals more links beyond
// that window). So we can NOT compute a total page count by scanning
// the "p=" links on page 1 — that undercounts. Instead we just keep
// requesting page+1 and stop once a page brings back nothing we
// haven't already seen (covers both a genuinely empty page, and sites
// that clamp an out-of-range page number back to the last page instead
// of returning empty).
// ---------------------------------------------------------------------

function extractListingProducts($) {
  const products = [];
  $(".product-item-info").each((_, el) => {
    const $card = $(el);
    const name = $card.find(".product-item-link").first().text().trim();
    if (!name) return;

    const href =
      $card.find("a.product-item-photo").attr("href") ||
      $card.find(".product-item-link").attr("href");
    if (!href) return;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    products.push({ name, url });
  });
  return products;
}

async function fetchListingPage(categoryUrl, page) {
  const separator = categoryUrl.includes("?") ? "&" : "?";
  const url = page === 1 ? categoryUrl : `${categoryUrl}${separator}p=${page}`;
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  return extractListingProducts($);
}

async function fetchAllListingStubs() {
  const allListingProducts = [];
  const seenUrls = new Set();

  for (const categoryUrl of CATEGORY_URLS) {
    console.log(`[allsell/notebooks] fetching: ${categoryUrl}`);
    let page = 1;

    while (page <= MAX_PAGES_SAFETY) {
      const products = await fetchListingPage(categoryUrl, page);

      if (products.length === 0) {
        console.log(`[allsell/notebooks] page ${page} empty — stopping pagination`);
        break;
      }

      const newProducts = products.filter((p) => !seenUrls.has(p.url));
      console.log(
        `[allsell/notebooks] page ${page} -> ${products.length} products (${newProducts.length} new)`,
      );

      if (newProducts.length === 0) {
        console.log(
          `[allsell/notebooks] page ${page} had no new products — stopping pagination`,
        );
        break;
      }

      for (const p of newProducts) {
        seenUrls.add(p.url);
        allListingProducts.push(p);
      }

      page += 1;
      await sleep(PAGE_FETCH_DELAY_MS);
    }

    if (page > MAX_PAGES_SAFETY) {
      console.warn(
        `[allsell/notebooks] hit MAX_PAGES_SAFETY (${MAX_PAGES_SAFETY}) for ${categoryUrl} — pagination may not be complete`,
      );
    }
  }

  const withoutApple = allListingProducts.filter((p) => !APPLE_NAME_PATTERN.test(p.name));
  const skippedApple = allListingProducts.length - withoutApple.length;
  if (skippedApple > 0) {
    console.log(`[allsell/notebooks] skipping ${skippedApple} Apple product(s)`);
  }

  return withoutApple;
}

// ---------------------------------------------------------------------
// Detail pages
// ---------------------------------------------------------------------

/**
 * @param {string} html - full product detail page HTML
 * @returns {{ specsRaw: object, specs: object, cash_price: number|null, installment_price: number|null }}
 */
function parseDetailHtml(html) {
  const $ = cheerio.load(html);
  const specsRaw = {};

  $("#product-attribute-specs-table tr").each((_, el) => {
    const row = $(el);
    const label = cleanText(row.find("th.col.label").first().text());
    if (!label || IGNORED_LABELS.has(label)) return;

    const value = cleanText(row.find("td.col.data").first().text());
    specsRaw[label] = value;
  });

  const specs = normalizeSpecs(specsRaw);

  const cashRaw = $("[data-price-type='finalPrice']").first().attr("data-price-amount");
  const cash_price = cashRaw ? parseInt(cashRaw, 10) || null : null;

  const installmentText = $(".credit_price .price").first().text();
  const installment_price = installmentText ? parsePriceAmd(installmentText) : null;

  return { specsRaw, specs, cash_price, installment_price };
}

function normalizeSpecs(raw) {
  const out = {};

  for (const [label, value] of Object.entries(raw)) {
    const key = LABEL_MAP[label];
    if (!key) {
      out[`_unmapped__${label}`] = value; // surfaces new labels instead of silently dropping them
      continue;
    }
    out[key] = value;
  }

  if (out.brand_raw) {
    out.brand = out.brand_raw;
    delete out.brand_raw;
  }

  if (out.ram_raw) {
    out.ram_gb = parseArmenianCapacityGb(out.ram_raw);
    out.ram_type = null; // not provided by this store
    delete out.ram_raw;
  }

  if (out.storage_raw) {
    out.storage_gb = parseArmenianCapacityGb(out.storage_raw);
    out.storage_type = null; // not stated (SSD vs HDD) — do not guess
    delete out.storage_raw;
  }

  if (out.screen_inches_raw) {
    const m = String(out.screen_inches_raw).match(/([\d.]+)/);
    out.screen_inches = m ? Number(m[1]) : null;
    delete out.screen_inches_raw;
  }

  // refresh rate is never provided by this store's spec table
  out.refresh_rate_hz = null;

  if (out.screen_resolution_raw) {
    const raw = String(out.screen_resolution_raw);
    const typeMatch = raw.match(DISPLAY_TYPE_PATTERN);
    if (typeMatch) {
      out.screen_type = typeMatch[1];
      out.screen_resolution = cleanText(raw.replace(typeMatch[0], ""));
    } else {
      out.screen_type = null;
      out.screen_resolution = raw;
    }
    delete out.screen_resolution_raw;
  } else {
    out.screen_type = null;
    out.screen_resolution = null;
  }

  for (const boolField of ["touch_screen", "rotating_screen", "backlit_keyboard"]) {
    const rawField = `${boolField}_raw`;
    if (out[rawField] !== undefined) {
      out[boolField] = YES_NO[String(out[rawField]).toLowerCase()] ?? null;
      delete out[rawField];
    } else {
      out[boolField] = null;
    }
  }

  if (out.warranty_raw) {
    const m = String(out.warranty_raw).match(/(\d+)/);
    out.warranty_months = m ? Number(m[1]) : null;
    delete out.warranty_raw;
  }

  return out;
}

async function fetchProductDetail(stub) {
  try {
    const res = await axios.get(stub.url, { headers: HEADERS, timeout: 15000 });
    const { specs, cash_price, installment_price } = parseDetailHtml(res.data);

    if (!cash_price) {
      console.warn(`[allsell/notebooks] no price found, skipping: ${stub.url}`);
      return null;
    }

    // Safety net: skip if the spec table itself reveals an Apple brand
    // that the listing-page name filter didn't catch.
    if (specs.brand && /apple/i.test(specs.brand)) return null;

    const brand = specs.brand || detectBrand(stub.name, []) || null;
    const id = stub.url.replace(/\/$/, "").split("/").pop();

    return {
      id,
      store: STORE,
      name: stub.name,
      brand,
      price: cash_price,
      installment_price,
      url: stub.url,
      specs: {
        cpu: specs.cpu ?? null,
        cpu_family: specs.cpu_family ?? null,
        gpu: specs.gpu ?? null,
        ram_gb: specs.ram_gb ?? null,
        ram_type: specs.ram_type ?? null,
        storage_gb: specs.storage_gb ?? null,
        storage_type: specs.storage_type ?? null,
        screen_inches: specs.screen_inches ?? null,
        screen_resolution: specs.screen_resolution ?? null,
        screen_type: specs.screen_type ?? null,
        refresh_rate_hz: specs.refresh_rate_hz ?? null,
        touch_screen: specs.touch_screen ?? null,
        os: specs.os ?? null,
        camera: specs.camera ?? null,
        audio_system: specs.audio_system ?? null,
        ports: specs.ports ?? null,
        rotating_screen: specs.rotating_screen ?? null,
        backlit_keyboard: specs.backlit_keyboard ?? null,
        warranty_months: specs.warranty_months ?? null,
      },
      category: "notebooks",
      scraped_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[allsell/notebooks] failed to fetch detail for ${stub.url}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

export async function scrapeAllsellNotebooks() {
  const stubs = await fetchAllListingStubs();
  console.log(`[allsell/notebooks] fetching detail pages for ${stubs.length} products...`);

  const normalizedOut = [];
  for (const [i, stub] of stubs.entries()) {
    console.log(`[allsell/notebooks] (${i + 1}/${stubs.length}) ${stub.name}`);
    const product = await fetchProductDetail(stub);
    if (product) normalizedOut.push(product);
    await sleep(DETAIL_FETCH_DELAY_MS);
  }

  const noBrand = normalizedOut.filter((p) => !p.brand).length;
  if (noBrand > 0) {
    console.warn(`[allsell/notebooks] ${noBrand} product(s) had no brand detected — check name matching`);
  }

  const importantSpecFields = ["cpu", "gpu", "ram_gb", "storage_gb", "screen_inches", "screen_resolution"];
  const missingSpecs = normalizedOut.filter((p) =>
    importantSpecFields.some((f) => p.specs[f] === null || p.specs[f] === undefined),
  ).length;

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, "allsell.raw.json"),
    JSON.stringify({ stubs, normalized: normalizedOut }, null, 2),
  );
  fs.writeFileSync(
    path.join(CACHE_DIR, "allsell.json"),
    JSON.stringify(normalizedOut, null, 2),
  );

  console.log(`[allsell/notebooks] done — ${normalizedOut.length} products saved to ${CACHE_DIR}`);
  console.log(`[allsell/notebooks] ${missingSpecs} product(s) missing at least one important spec`);

  return normalizedOut;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  scrapeAllsellNotebooks().catch((err) => {
    console.error("[allsell/notebooks] fatal error:", err);
    process.exit(1);
  });
}