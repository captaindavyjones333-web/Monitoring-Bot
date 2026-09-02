import pg from "pg";
import { loadAllCaches } from "../core/cache_manager.js";
import { saveSnapshot, loadSnapshot, diffProducts } from "../core/price_snapshot.js";
import { normalizeName } from "../core/normalizer.js";
import { runFullScraping } from "./scrapeJob.js";

// ── DB pool ────────────────────────────────────────────────────────────────────
// Lazy-initialised so the module stays importable even if DATABASE_URL is absent.
let _pool = null;
function getPool() {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    _pool.on("error", (err) => {
      console.error("[priceWatch] Unexpected Postgres pool error:", err);
    });
  }
  return _pool;
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

/** Format a number with space-separated thousands (Armenian-style) */
const fmt = (n) =>
  n != null ? n.toLocaleString("ru-RU").replace(/,/g, " ") : "—";

/** Full human-readable store names used in notification headers */
const STORE_FULL_NAMES = {
  redstore: "REDstore",
  yerevanmobile: "Yerevan Mobile",
  mobilecentre: "Mobile Centre",
  allsell: "Allsell",
  "3dplanet": "3D Planet",
  icentre: "iCentre",
  ispace: "iSpace",
  eldorado: "Eldorado",
  zigzag: "Zigzag",
  vesta: "Vesta",
  vlv: "VLV",
  vega: "Vega",
  notebookcentre: "Notebook Centre",
  dgcomp: "DGComp",
  notebookmall: "Notebook Mall",
  smartbox: "SmartBox",
  miarmenia: "Mi Armenia",
};

/**
 * Format a single price-change notification as a Telegram message.
 *
 * @param {object} change     - from diffProducts() (type, source, name, prevCash, currCash, …)
 * @param {object} rsListing  - { cash_price, installment_price } from the Redstore DB row
 * @param {Date}   changedAt  - timestamp of detection
 * @returns {string} Telegram message text
 */
function formatNotification(change, rsListing, changedAt) {
  const { type, source, name, prevCash, currCash, prevInstallment, currInstallment } = change;

  const prevInst = prevInstallment ?? prevCash;
  const currInst = currInstallment ?? currCash;
  const rsCash   = rsListing.cash_price;
  const rsInst   = rsListing.installment_price ?? rsCash;

  // ── Header ──────────────────────────────────────────────────────────────
  let headerLine;
  if (type === "price_up")      headerLine = "🔴 ԳԻՆԸ ԲԱՐՁՐԱՑԵԼ Է";
  else if (type === "price_down")   headerLine = "🟢 ԳԻՆԸ ԻՋԵԼ Է";
  else if (type === "appeared")     headerLine = "🟢 ԱՊՐԱՆՔԸ ՀԱՅՏՆՎԵԼ Է";
  else if (type === "disappeared")  headerLine = "⚫ ԱՊՐԱՆՔԸ ԱՆՀԵՏԱՑԵԼ Է";
  else                              headerLine = "ℹ️ ՓՈՓՈԽՈՒԹՅՈՒՆ";

  // ── Date / time ─────────────────────────────────────────────────────────
  const dateStr = changedAt.toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const timeStr = changedAt.toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit",
  });

  // ── Competitor price lines ───────────────────────────────────────────────
  const storeFullName = STORE_FULL_NAMES[source] || source;
  let cashPriceLine, instPriceLine;

  if (type === "appeared") {
    cashPriceLine = `💵 Կանխիկ: ${fmt(currCash)} ֏`;
    instPriceLine = `💳 Ապառիկ: ${fmt(currInst)} ֏`;
  } else if (type === "disappeared") {
    cashPriceLine = `💵 Կանխիկ: ${fmt(prevCash)} ֏ → —`;
    instPriceLine = `💳 Ապառիկ: ${fmt(prevInst)} ֏ → —`;
  } else {
    cashPriceLine = `💵 Կանխիկ: ${fmt(prevCash)} → ${fmt(currCash)} ֏`;
    instPriceLine = `💳 Ապառիկ: ${fmt(prevInst)} → ${fmt(currInst)} ֏`;
  }

  // ── Redstore section ─────────────────────────────────────────────────────
  const rsSection = [
    `🔵 REDstore`,
    `💵 Կանխիկ՝ ${fmt(rsCash)} ֏`,
    `💳 Ապառիկ՝ ${fmt(rsInst)} ֏`,
  ].join("\n");

  // ── Comparison vs Redstore ───────────────────────────────────────────────
  const compCash = type === "disappeared" ? prevCash : currCash;
  let compLine = "";
  let deltaLine = "";

  if (compCash != null && rsCash != null) {
    const diff = compCash - rsCash; // positive → competitor is more expensive

    if (diff > 0)       compLine = `✅ ՄԵԶԱՆԻՑ ԹԱՆԿ՝ ${fmt(diff)} ֏🟰`;
    else if (diff < 0)  compLine = `❌ ՄԵԶԱՆԻՑ ԷԺԱՆ՝ ${fmt(Math.abs(diff))} ֏`;
    else                compLine = `🟰 ՆՈՒՅՆ ԳԻՆՆ Է`;

    if (type === "price_up" && prevCash != null)
      deltaLine = `📈 Թանկացում՝ ${fmt(currCash - prevCash)} ֏`;
    else if (type === "price_down" && prevCash != null)
      deltaLine = `📉 Էժանացում՝ ${fmt(prevCash - currCash)} ֏`;
    else if (type === "appeared" && currCash != null)
      deltaLine = `🆕 Հայտնվել է՝ ${fmt(currCash)} ֏`;
  }

  const parts = [
    headerLine,
    `${dateStr} ${timeStr}`,
    "",
    `🏪 ${storeFullName}`,
    `📱 ${name}`,
    "",
    cashPriceLine,
    instPriceLine,
    "",
    rsSection,
  ];

  if (compLine)  parts.push("", compLine);
  if (deltaLine) parts.push("", deltaLine);

  return parts.join("\n").trim();
}

// ── DB: batch-load Redstore match data ─────────────────────────────────────────

/**
 * Given a list of competitor change objects (each with .source and .name), query
 * PostgreSQL in exactly two round-trips to determine whether each has an ACTIVE
 * Redstore listing match via the canonical product record.
 *
 * Relationship traversed:
 *   competitor store_listing  (matched by store name + raw_title)
 *     → store_listings.product_id
 *       → products (status='active')
 *         → Redstore store_listing (stores.is_own_store=true, status='active')
 *
 * Returns a Map keyed by `"${source}::${name.trim().toLowerCase()}"` →
 *   { cash_price, installment_price } | null
 *   (null = no active Redstore match → notification is skipped)
 */
async function batchLoadRedstoreMatches(changes) {
  const pool = getPool();
  const changeKey = (source, name) => `${source}::${name.trim().toLowerCase()}`;

  if (changes.length === 0) return new Map();

  const sourceArray = changes.map((c) => c.source);
  const nameArray   = changes.map((c) => c.name.trim());

  // ── Query 1: competitor (store_name, raw_title) → product_id ─────────────
  // Uses unnest() to pass all pairs in one query, avoiding N individual lookups.
  // Restricts to status='active' so missing/removed listings don't match.
  let listingRows = [];
  try {
    const res = await pool.query(
      `SELECT s.name AS store_name, sl.raw_title, sl.product_id
       FROM store_listings sl
       JOIN stores s ON s.id = sl.store_id
       WHERE (s.name, sl.raw_title) IN (
         SELECT * FROM unnest($1::text[], $2::text[])
       )
         AND sl.status = 'active'`,
      [sourceArray, nameArray],
    );
    listingRows = res.rows;
  } catch (err) {
    console.error("[priceWatch] ⚠️  DB query for competitor listings failed:", err.message);
    return new Map(); // graceful degradation — skip all notifications rather than crash
  }

  // Build: changeKey → product_id
  const productIdByKey = new Map();
  for (const row of listingRows) {
    if (row.product_id) {
      const k = changeKey(row.store_name, row.raw_title);
      if (!productIdByKey.has(k)) productIdByKey.set(k, row.product_id);
    }
  }

  if (productIdByKey.size === 0) return new Map();

  const productIds = [...new Set(productIdByKey.values())];

  // ── Query 2: product_id → active Redstore store_listing ──────────────────
  // is_own_store = true identifies Redstore regardless of the store's display name.
  // Also requires the canonical product itself to be active (not merged/archived).
  let rsRows = [];
  try {
    const res = await pool.query(
      `SELECT sl.product_id, sl.cash_price, sl.installment_price
       FROM store_listings sl
       JOIN stores s ON s.id = sl.store_id
       JOIN products p ON p.id = sl.product_id
       WHERE s.is_own_store = true
         AND sl.product_id = ANY($1::uuid[])
         AND sl.status = 'active'
         AND p.status = 'active'`,
      [productIds],
    );
    rsRows = res.rows;
  } catch (err) {
    console.error("[priceWatch] ⚠️  DB query for Redstore listings failed:", err.message);
    return new Map();
  }

  // Build: product_id → { cash_price, installment_price }
  const rsDataByProductId = new Map();
  for (const row of rsRows) {
    if (!rsDataByProductId.has(row.product_id)) {
      rsDataByProductId.set(row.product_id, {
        cash_price:        row.cash_price        ? Number(row.cash_price)        : null,
        installment_price: row.installment_price ? Number(row.installment_price) : null,
      });
    }
  }

  // ── Assemble result: changeKey → rs prices | null ─────────────────────────
  const result = new Map();
  for (const [key, productId] of productIdByKey) {
    result.set(key, rsDataByProductId.get(productId) ?? null);
  }
  return result;
}

// ── Deduplication helper ───────────────────────────────────────────────────────

/**
 * Collapse color-only variants to one representative change per (store, base model).
 * Dyson is exempt: color/variant changes price and specs so each is kept individually.
 */
function deduplicateChanges(changes) {
  const groups = new Map();
  for (const change of changes) {
    const norm = normalizeName(change.name);
    // Dyson: key by exact name so every variant gets its own slot
    const groupKey = norm.category === "dyson"
      ? change.name.trim().toLowerCase()
      : `${change.source}::${norm.modelKey}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(change);
  }
  return [...groups.values()].map((g) => g[0]);
}

// ── Main exported job ──────────────────────────────────────────────────────────

/**
 * Full price-watch job:
 * 1. Load previous snapshot
 * 2. Run full scrape (scrapers → JSON cache → post-scrape DB pipeline)
 * 3. Diff current vs previous snapshot
 * 4. Save new snapshot
 * 5. For each competitor price change, query DB for an active Redstore match
 * 6. Return one Telegram message per matched change (unmatched changes are skipped)
 */
export async function runPriceWatchJob() {
  console.log("[priceWatch] 🔍 Starting price watch scan...");

  // Load previous snapshot before scraping
  const prevSnapshot = loadSnapshot();

  // Run full scrape to update caches and execute the post-scrape DB ingestion pipeline
  console.log("[priceWatch] 🌐 Running full scrape...");
  await runFullScraping();
  console.log("[priceWatch] ✅ Scrape complete");

  // Load freshly scraped products from JSON cache
  const currentProducts = loadAllCaches();

  // Diff current vs previous
  const allChanges = diffProducts(currentProducts, prevSnapshot);
  console.log(`[priceWatch] 📊 ${allChanges.length} raw changes detected`);

  // Save new snapshot for the next run regardless of notification outcome
  saveSnapshot(currentProducts);

  if (allChanges.length === 0) return [];

  // ── Keep only competitor changes — never notify on Redstore's own price moves ──
  const competitorChanges = allChanges.filter((c) => c.source !== "redstore");
  if (competitorChanges.length === 0) {
    console.log("[priceWatch] No competitor changes to report.");
    return [];
  }

  // ── Collapse color-only variant duplicates ────────────────────────────────
  const deduped = deduplicateChanges(competitorChanges);
  console.log(
    `[priceWatch] 📊 ${deduped.length} unique changes after deduplication ` +
    `(${competitorChanges.length} raw competitor changes)`,
  );

  // ── Batch DB lookup: does each listing have an active Redstore match? ──────
  const changedAt = new Date();
  let rsMatchMap;
  try {
    rsMatchMap = await batchLoadRedstoreMatches(deduped);
    console.log(
      `[priceWatch] 🗃️  DB returned Redstore match data for ` +
      `${rsMatchMap.size} of ${deduped.length} changed listings`,
    );
  } catch (err) {
    console.error("[priceWatch] ❌ Failed to load Redstore match data from DB:", err.message);
    return []; // fail safe — don't send broken/partial notifications
  }

  // ── Build one notification per change that has an active Redstore match ────
  const changeKey = (source, name) => `${source}::${name.trim().toLowerCase()}`;
  const messages = [];

  for (const change of deduped) {
    const key = changeKey(change.source, change.name);
    const rsListing = rsMatchMap.get(key);

    if (!rsListing) {
      console.log(
        `[priceWatch]   ⏭️  Skipping "${change.name}" (${change.source}): ` +
        `no active Redstore match in DB`,
      );
      continue;
    }

    messages.push(formatNotification(change, rsListing, changedAt));
  }

  console.log(`[priceWatch] ✉️  ${messages.length} notification(s) ready to send`);
  return messages;
}
