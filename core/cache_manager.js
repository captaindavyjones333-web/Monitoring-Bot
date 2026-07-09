import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../cache");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const SOURCES = [
  "redstore",
  "yerevanmobile",
  "mobilecentre",
  "allsell",
  "3dplanet",
  "icentre",
  "ispace",
];

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Save scraped products for one source.
 * @param {string} source  - e.g. "redstore"
 * @param {Array}  products - raw scraper output array
 */
export function saveCache(source, products) {
  if (!SOURCES.includes(source)) {
    throw new Error(
      `Unknown source: "${source}". Allowed: ${SOURCES.join(", ")}`,
    );
  }

  const filePath = path.join(CACHE_DIR, `${source}.json`);
  const payload = {
    source,
    scraped_at: new Date().toISOString(),
    count: products.length,
    products,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`[cache] ✅ Saved ${products.length} products → ${filePath}`);
}

/**
 * Update last_updated.json with timestamp for a source.
 */
export function markUpdated(source) {
  const filePath = path.join(CACHE_DIR, "last_updated.json");
  let data = {};

  if (fs.existsSync(filePath)) {
    data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  data[source] = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Load cached products for one source.
 * Returns null if cache doesn't exist.
 * @param {string} source
 * @returns {{ source, scraped_at, count, products } | null}
 */
export function loadCache(source) {
  const filePath = path.join(CACHE_DIR, `${source}.json`);

  if (!fs.existsSync(filePath)) {
    console.warn(`[cache] ⚠️  No cache found for "${source}"`);
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Load all sources and return flat product array.
 * @returns {Array} all products from all cached sources
 */
export function loadAllCaches() {
  const all = [];

  for (const source of SOURCES) {
    const cache = loadCache(source);
    if (cache) {
      all.push(...cache.products);
    }
  }

  return all;
}

/**
 * Check if cache is stale (older than maxAgeHours).
 * @param {string} source
 * @param {number} maxAgeHours - default 24
 * @returns {boolean}
 */
export function isCacheStale(source, maxAgeHours = 24) {
  const cache = loadCache(source);
  if (!cache) return true;

  const scraped = new Date(cache.scraped_at);
  const ageMs = Date.now() - scraped.getTime();
  return ageMs > maxAgeHours * 60 * 60 * 1000;
}

/**
 * Print a summary of all cache files (age, product count).
 */
/**
 * Delete all cache files (called after sending alerts).
 */
export function clearAllCaches() {
  for (const source of SOURCES) {
    const filePath = path.join(CACHE_DIR, `${source}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[cache] 🗑️  Cleared ${source}.json`);
    }
  }
}

export function printCacheStatus() {
  console.log("\n[cache] 📦 Cache status:");
  for (const source of SOURCES) {
    const filePath = path.join(CACHE_DIR, `${source}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`  ${source}: ❌ not found`);
      continue;
    }
    const cache = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const age = Math.round((Date.now() - new Date(cache.scraped_at)) / 60000);
    console.log(`  ${source}: ✅ ${cache.count} products, ${age} min ago`);
  }
  console.log();
}
