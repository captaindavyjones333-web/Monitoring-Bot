import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import { detectBrand } from "../../core/notebookAttributes.js";
import { parseRam, parseStorage } from "../../core/specParsers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = "https://complife.am";
const STORE = "complife.am";

const CATEGORY_URLS = [
  "https://complife.am/notebooks",
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
// used for the other store scrapers in this project).
const APPLE_NAME_PATTERN = /\bapple\b|\bmacbook\b/i;

// Listing card selectors. complife's theme uses build-hashed/obfuscated
// class names (captured from a live listing card sample), so we anchor on
// the wrapping row + the name span rather than anything more "semantic".
const LISTING_ROW_SELECTOR = ".row.brRzvpfD.Sn2k9E8y.С4i09Ksto";
const LISTING_NAME_SELECTOR = ".goaatTOF";
const LISTING_FALLBACK_LINK_SELECTOR = "a.HjXcXQcN";

/**
 * Armenian characteristic-table labels (details_characteristic_item rows on
 * the product detail page) -> canonical field names, matching the shape
 * already used by the other store scrapers (allsell, redstore,
 * notebookcentre) so matcherV2 keeps working unchanged.
 */
const LABEL_MAP = {
  "Պրոցեսսոր": "cpu",
  "Օպերատիվ Հիշողություն": "ram_raw",
  "SSD Կուտակիչ": "storage_raw",
  "Տեսաքարտ": "gpu",
  "Օպերացիոն Համակարգ": "os",
  "Երաշխիք": "warranty_raw",
  "Էկրան": "screen_raw",
  "Ստեղնաշար": "keyboard_raw",
};

// Labels we recognize but deliberately don't carry into specs — no matching
// field in the shared product schema.
const IGNORED_LABELS = new Set(["Քաշ", "Գույն", "Մետաղյա Իրան"]);

const BACKLIT_WORD_PATTERN = /լուսավորվող/i; // "illuminated/backlit"

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
 * Parses complife's single combined "Էկրան" characteristic string, e.g.
 * `16.0" (1920x1200) FHD+ IPS 144Hz`, into the same split fields the other
 * store scrapers produce (screen_inches, screen_resolution, screen_type,
 * refresh_rate_hz). Unlike allsell's leftover-text style, this keeps
 * screen_resolution as a clean "WIDTHxHEIGHT" string since complife's
 * source format makes that reliable to extract directly.
 */
function parseScreenField(raw = "") {
  const inchesMatch = raw.match(/([\d.]+)\s*"/);
  const screen_inches = inchesMatch ? Number(inchesMatch[1]) : null;

  const resMatch = raw.match(/\((\d+)\s*[xXхХ×]\s*(\d+)\)/);
  const screen_resolution = resMatch ? `${resMatch[1]}x${resMatch[2]}` : null;

  const hzMatch = raw.match(/(\d+)\s*Hz/i);
  const refresh_rate_hz = hzMatch ? Number(hzMatch[1]) : null;

  const typeMatch = raw.match(DISPLAY_TYPE_PATTERN);
  const screen_type = typeMatch ? typeMatch[1] : null;

  return { screen_inches, screen_resolution, screen_type, refresh_rate_hz };
}

// ---------------------------------------------------------------------
// Listing pages
//
// Same sliding-window caveat as the other store scrapers: we can't trust a
// static page count from the pagination widget, so we just keep requesting
// page+1 and stop once a page brings back nothing we haven't already seen.
// ---------------------------------------------------------------------

function extractListingProducts($) {
  const products = [];
  $(LISTING_ROW_SELECTOR)
    .children()
    .each((_, el) => {
      const $card = $(el);
      const $nameEl = $card.find(LISTING_NAME_SELECTOR).first();
      const name = $nameEl.text().trim();
      if (!name) return;

      const href =
        $nameEl.closest("a").attr("href") ||
        $card.find(LISTING_FALLBACK_LINK_SELECTOR).first().attr("href");
      if (!href) return;

      const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      // The listing card exposes a monthly/credit price too. We capture it
      // here as a fallback — the detail page is checked first and wins if
      // it also exposes this block (see fetchProductDetail).
      const listingInstallmentText = $card.find(".credit_price").first().text();
      const listing_installment_price = listingInstallmentText
        ? parsePriceAmd(listingInstallmentText)
        : null;

      products.push({ name, url, listing_installment_price });
    });
  return products;
}

async function fetchListingPage(categoryUrl, page) {
  const separator = categoryUrl.includes("?") ? "&" : "?";
  const url = page === 1 ? categoryUrl : `${categoryUrl}${separator}page=${page}`;
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  return extractListingProducts($);
}

async function fetchAllListingStubs() {
  const allListingProducts = [];
  const seenUrls = new Set();

  for (const categoryUrl of CATEGORY_URLS) {
    console.log(`[complife/notebooks] fetching: ${categoryUrl}`);
    let page = 1;

    while (page <= MAX_PAGES_SAFETY) {
      const products = await fetchListingPage(categoryUrl, page);

      if (products.length === 0) {
        console.log(`[complife/notebooks] page ${page} empty — stopping pagination`);
        break;
      }

      const newProducts = products.filter((p) => !seenUrls.has(p.url));
      console.log(
        `[complife/notebooks] page ${page} -> ${products.length} products (${newProducts.length} new)`,
      );

      if (newProducts.length === 0) {
        console.log(
          `[complife/notebooks] page ${page} had no new products — stopping pagination`,
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
        `[complife/notebooks] hit MAX_PAGES_SAFETY (${MAX_PAGES_SAFETY}) for ${categoryUrl} — pagination may not be complete`,
      );
    }
  }

  const withoutApple = allListingProducts.filter((p) => !APPLE_NAME_PATTERN.test(p.name));
  const skippedApple = allListingProducts.length - withoutApple.length;
  if (skippedApple > 0) {
    console.log(`[complife/notebooks] skipping ${skippedApple} Apple product(s)`);
  }

  return withoutApple;
}

// ---------------------------------------------------------------------
// Detail pages
// ---------------------------------------------------------------------

/**
 * complife shows either a plain price or a discount block (crossed-out
 * "through" price + the actual discounted price). The discounted price is
 * the one to use as cash_price when present.
 */
function parseDetailPrice($) {
  const discountText = $(".products_page_discount_price").first().text();
  if (discountText && discountText.trim()) {
    return parsePriceAmd(discountText);
  }
  const regularText = $(".products_page_real_price.real_price_new").first().text();
  return regularText ? parsePriceAmd(regularText) : null;
}

function parseDetailInstallment($) {
  const text = $(".credit_price").first().text();
  return text && text.trim() ? parsePriceAmd(text) : null;
}

/**
 * @param {string} html - full product detail page HTML
 * @returns {{ specsRaw: object, specs: object, cash_price: number|null, installment_price: number|null }}
 */
function parseDetailHtml(html) {
  const $ = cheerio.load(html);
  const specsRaw = {};

  $(".details_characteristic_item").each((_, el) => {
    const row = $(el);
    const label = cleanText(row.find(".details_characteristic_item_key").first().text());
    if (!label || IGNORED_LABELS.has(label)) return;

    const value = cleanText(row.find(".details_characteristic_item_value").first().text());
    specsRaw[label] = value;
  });

  const specs = normalizeSpecs(specsRaw);
  const cash_price = parseDetailPrice($);
  const installment_price = parseDetailInstallment($);

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

  if (out.ram_raw) {
    const { ram_gb, ram_type } = parseRam(out.ram_raw);
    out.ram_gb = ram_gb;
    out.ram_type = ram_type ?? null;
    delete out.ram_raw;
  }

  if (out.storage_raw) {
    const { storage_gb, storage_type } = parseStorage(out.storage_raw);
    out.storage_gb = storage_gb;
    out.storage_type = storage_type ?? null;
    delete out.storage_raw;
  }

  if (out.screen_raw) {
    const { screen_inches, screen_resolution, screen_type, refresh_rate_hz } =
      parseScreenField(out.screen_raw);
    out.screen_inches = screen_inches;
    out.screen_resolution = screen_resolution;
    out.screen_type = screen_type;
    out.refresh_rate_hz = refresh_rate_hz;
    delete out.screen_raw;
  } else {
    out.screen_inches = null;
    out.screen_resolution = null;
    out.screen_type = null;
    out.refresh_rate_hz = null;
  }

  if (out.keyboard_raw) {
    out.backlit_keyboard = BACKLIT_WORD_PATTERN.test(out.keyboard_raw);
    delete out.keyboard_raw;
  } else {
    out.backlit_keyboard = null;
  }

  if (out.warranty_raw) {
    const m = String(out.warranty_raw).match(/(\d+)/);
    out.warranty_months = m ? Number(m[1]) : null;
    delete out.warranty_raw;
  }

  // Not exposed by this store's characteristics table — kept null so the
  // output shape matches the other store scrapers.
  out.cpu_family = out.cpu_family ?? null;
  out.touch_screen = out.touch_screen ?? null;
  out.camera = out.camera ?? null;
  out.audio_system = out.audio_system ?? null;
  out.ports = out.ports ?? null;
  out.rotating_screen = out.rotating_screen ?? null;

  return out;
}

async function fetchProductDetail(stub) {
  try {
    const res = await axios.get(stub.url, { headers: HEADERS, timeout: 15000 });
    const { specs, cash_price, installment_price: detailInstallment } = parseDetailHtml(res.data);

    if (!cash_price) {
      console.warn(`[complife/notebooks] no price found, skipping: ${stub.url}`);
      return null;
    }

    // Safety net: skip if the spec table itself reveals an Apple product
    // that the listing-page name filter didn't catch.
    if (/apple|macbook/i.test(stub.name) || (specs.cpu && /apple/i.test(specs.cpu))) return null;

    const installment_price = detailInstallment ?? stub.listing_installment_price ?? null;
    const brand = detectBrand(stub.name, []) || null;
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
    console.error(`[complife/notebooks] failed to fetch detail for ${stub.url}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

export async function scrapeComplifeNotebooks() {
  const stubs = await fetchAllListingStubs();
  console.log(`[complife/notebooks] fetching detail pages for ${stubs.length} products...`);

  const normalizedOut = [];
  for (const [i, stub] of stubs.entries()) {
    console.log(`[complife/notebooks] (${i + 1}/${stubs.length}) ${stub.name}`);
    const product = await fetchProductDetail(stub);
    if (product) normalizedOut.push(product);
    await sleep(DETAIL_FETCH_DELAY_MS);
  }

  const noBrand = normalizedOut.filter((p) => !p.brand).length;
  if (noBrand > 0) {
    console.warn(`[complife/notebooks] ${noBrand} product(s) had no brand detected — check name matching`);
  }

  const importantSpecFields = ["cpu", "gpu", "ram_gb", "storage_gb", "screen_inches", "screen_resolution"];
  const missingSpecs = normalizedOut.filter((p) =>
    importantSpecFields.some((f) => p.specs[f] === null || p.specs[f] === undefined),
  ).length;

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, "complife.raw.json"),
    JSON.stringify({ stubs, normalized: normalizedOut }, null, 2),
  );
  fs.writeFileSync(
    path.join(CACHE_DIR, "complife.json"),
    JSON.stringify(normalizedOut, null, 2),
  );

  console.log(`[complife/notebooks] done — ${normalizedOut.length} products saved to ${CACHE_DIR}`);
  console.log(`[complife/notebooks] ${missingSpecs} product(s) missing at least one important spec`);

  return normalizedOut;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  scrapeComplifeNotebooks().catch((err) => {
    console.error("[complife/notebooks] fatal error:", err);
    process.exit(1);
  });
}