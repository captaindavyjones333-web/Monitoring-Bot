import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { loadAllCaches } from "../core/cache_manager.js";
import { saveSnapshot, loadSnapshot, diffProducts } from "../core/price_snapshot.js";
import { normalizeName } from "../core/normalizer.js";
import { detectCategory } from "../core/categoryDetector.js";
import { runFullScraping } from "./scrapeJob.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  complife: "Complife",
};

export const CATEGORY_ORDER = [
  "phones",
  "tablets",
  "watches",
  "headphones",
  "macbooks",
  "speakers",
  "tvs",
  "dyson",
  "gaming",
  "airconditioners",
  "camera",
  "cleaners",
  "printers",
  "projectors",
  "drones",
  "monitors",
  "notebooks",
];

export const CATEGORY_LABELS = {
  phones: "📱 Հեռախոսներ",
  tablets: "📟 Պլանշետներ",
  watches: "⌚ Ժամացույցներ",
  headphones: "🎧 Ականջակալներ",
  macbooks: "💻 Macbook",
  speakers: "🔊 Բարձրախոսներ",
  tvs: "📺 Հեռուստացույցներ",
  dyson: "💇 Dyson",
  gaming: "🎮 Gaming",
  airconditioners: "❄️ Օդորակիչներ",
  camera: "📷 Տեսախցիկներ",
  cleaners: "🧹 Փոշեկուլներ",
  printers: "🖨 Տպիչներ",
  projectors: "📽 Projectors",
  drones: "🚁 Drones",
  monitors: "🖥 Monitors",
  notebooks: "💻 Notebooks",
};

/**
 * Format a single price-change notification as a Telegram message.
 *
 * @param {object} change     - from diffProducts() (type, source, name, prevCash, currCash, …)
 * @param {object} rsListing  - { cash_price, installment_price } from the Redstore DB / notebook match
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
 */
async function batchLoadRedstoreMatches(changes) {
  const pool = getPool();
  const changeKey = (source, name) => `${source}::${name.trim().toLowerCase()}`;

  if (changes.length === 0) return new Map();

  const sourceArray = changes.map((c) => c.source);
  const nameArray   = changes.map((c) => c.name.trim());

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
    return new Map();
  }

  const productIdByKey = new Map();
  for (const row of listingRows) {
    if (row.product_id) {
      const k = changeKey(row.store_name, row.raw_title);
      if (!productIdByKey.has(k)) productIdByKey.set(k, row.product_id);
    }
  }

  if (productIdByKey.size === 0) return new Map();

  const productIds = [...new Set(productIdByKey.values())];

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

  const rsDataByProductId = new Map();
  for (const row of rsRows) {
    if (!rsDataByProductId.has(row.product_id)) {
      rsDataByProductId.set(row.product_id, {
        cash_price:        row.cash_price        ? Number(row.cash_price)        : null,
        installment_price: row.installment_price ? Number(row.installment_price) : null,
      });
    }
  }

  const result = new Map();
  for (const [key, productId] of productIdByKey) {
    result.set(key, rsDataByProductId.get(productId) ?? null);
  }
  return result;
}

// ── Notebooks: load cache & match data ────────────────────────────────────────

function loadAllNotebookCacheProducts() {
  const notebookDir = path.resolve(__dirname, "../cache/notebooks");
  if (!fs.existsSync(notebookDir)) return [];

  const storeFiles = [
    { file: "redstore.json", source: "redstore" },
    { file: "notebookcentre.json", source: "notebookcentre" },
    { file: "allsell.json", source: "allsell" },
    { file: "3dplanet.json", source: "3dplanet" },
    { file: "notebookmall.json", source: "notebookmall" },
    { file: "complife.json", source: "complife" },
  ];

  const products = [];
  for (const { file, source } of storeFiles) {
    const p = path.join(notebookDir, file);
    if (!fs.existsSync(p)) continue;
    try {
      const items = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (Array.isArray(items)) {
        for (const item of items) {
          if (!item?.name) continue;
          products.push({
            source,
            name: item.name,
            cash_price: item.price != null ? Number(item.price) : null,
            installment_price: item.installment_price != null ? Number(item.installment_price) : null,
            category: "notebooks",
          });
        }
      }
    } catch (err) {
      console.warn(`[priceWatch] ⚠️ Failed reading ${file}:`, err.message);
    }
  }
  return products;
}

export function loadAllCachesWithNotebooks() {
  const mainProducts = loadAllCaches();
  const notebookProducts = loadAllNotebookCacheProducts();
  return [...mainProducts, ...notebookProducts];
}

function loadNotebookRedstoreMatches(notebookChanges) {
  const matchesFile = path.resolve(__dirname, "../cache/notebooks/matches-v2.json");
  const changeKey = (source, name) => `${source.toLowerCase()}::${name.trim().toLowerCase()}`;

  if (notebookChanges.length === 0 || !fs.existsSync(matchesFile)) {
    return new Map();
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(matchesFile, "utf-8"));
  } catch (err) {
    console.error("[priceWatch] ⚠️ Failed reading notebook matches-v2.json:", err.message);
    return new Map();
  }

  const allMatchSections = [
    data.full_match || [],
    data.gaming_same_brand || [],
    data.non_gaming_same_brand || [],
    data.gaming_cross_brand || [],
    data.non_gaming_cross_brand || [],
  ];

  const parseNotebookPrice = (priceStr) => {
    if (!priceStr) return { cash_price: null, installment_price: null };
    const parts = String(priceStr).split("-").map((s) => s.trim());
    const parseNum = (val) => {
      if (!val || val === "N/A" || val === "—") return null;
      const num = Number(val.replace(/[^\d]/g, ""));
      return isNaN(num) ? null : num;
    };
    const cash = parseNum(parts[0]);
    const inst = parts[1] ? parseNum(parts[1]) : cash;
    return { cash_price: cash, installment_price: inst };
  };

  const matchIndex = new Map();
  for (const section of allMatchSections) {
    for (const match of section) {
      if (!match.a || !match.b) continue;
      const storeName = (match.b.store || "").replace(/\.am$/i, "").toLowerCase();
      const bName = match.b.name;
      if (!storeName || !bName) continue;

      const k = changeKey(storeName, bName);
      if (!matchIndex.has(k)) {
        const rsPrices = parseNotebookPrice(match.a.price);
        matchIndex.set(k, rsPrices);
      }
    }
  }

  const result = new Map();
  for (const change of notebookChanges) {
    const k = changeKey(change.source, change.name);
    if (matchIndex.has(k)) {
      result.set(k, matchIndex.get(k));
    }
  }

  return result;
}

// ── Category & Deduplication helper ──────────────────────────────────────────

function getChangeCategory(change) {
  if (change.category === "notebooks") return "notebooks";
  const cat = detectCategory(change.name);
  if (cat === "camera" || cat === "cameras") return "camera";
  return cat || "phones";
}

/**
 * Collapse color-only variants to one representative change per (store, base model).
 * Dyson & Notebooks are exempt: each variant gets its own slot.
 */
function deduplicateChanges(changes) {
  const groups = new Map();
  for (const change of changes) {
    const cat = getChangeCategory(change);
    let groupKey;
    if (cat === "dyson" || cat === "notebooks") {
      groupKey = `${change.source}::${change.name.trim().toLowerCase()}`;
    } else {
      const norm = normalizeName(change.name);
      groupKey = `${change.source}::${norm.modelKey}`;
    }
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(change);
  }
  return [...groups.values()].map((g) => g[0]);
}

// ── Category-by-Category Notification Sender with 5-Minute Delay ──────────────

export async function sendCategoryNotificationsWithDelay(
  bot,
  userIds,
  categoriesWithChanges,
  delayMs = 5 * 60 * 1000,
) {
  const targetUsers = Array.isArray(userIds) ? userIds : [userIds];
  if (targetUsers.length === 0 || !categoriesWithChanges || categoriesWithChanges.length === 0) {
    return;
  }

  for (let i = 0; i < categoriesWithChanges.length; i++) {
    const cat = categoriesWithChanges[i];
    console.log(
      `[notifications] 📤 Category (${i + 1}/${categoriesWithChanges.length}): Sending ${cat.messages.length} message(s) for ${cat.label}...`,
    );

    for (const uid of targetUsers) {
      for (const msg of cat.messages) {
        await bot
          .sendMessage(uid, msg, { parse_mode: "Markdown" })
          .catch((err) =>
            console.error(
              `[notifications] Failed to send message to ${uid}: ${err.message}`,
            ),
          );
      }
    }

    // If there is another category with changes remaining, wait delayMs (5 minutes)
    if (i < categoriesWithChanges.length - 1) {
      const nextCat = categoriesWithChanges[i + 1];
      console.log(
        `[notifications] ⏳ Waiting ${Math.round(delayMs / 1000)}s before sending next category (${nextCat.label})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log("[notifications] ✅ All categories with changes have been sent.");
}

// ── Main exported job ──────────────────────────────────────────────────────────

/**
 * Full price-watch job:
 * 1. Load previous snapshot
 * 2. Run full scrape (scrapers → JSON cache → post-scrape DB pipeline + notebook refresh)
 * 3. Diff current vs previous snapshot (including notebooks)
 * 4. Save new snapshot
 * 5. For each competitor price change, query DB / notebook matcher for active Redstore match
 * 6. Return category-by-category changes and formatted notifications
 */
export async function runPriceWatchJob() {
  console.log("[priceWatch] 🔍 Starting price watch scan...");

  // Load previous snapshot before scraping
  const prevSnapshot = loadSnapshot();

  // Run full scrape to update caches, execute DB ingestion pipeline, and refresh notebooks
  console.log("[priceWatch] 🌐 Running full scrape...");
  await runFullScraping();
  console.log("[priceWatch] ✅ Scrape complete");

  // Load freshly scraped products from JSON cache (including notebooks)
  const currentProducts = loadAllCachesWithNotebooks();

  // Diff current vs previous
  const allChanges = diffProducts(currentProducts, prevSnapshot);
  console.log(`[priceWatch] 📊 ${allChanges.length} raw changes detected`);

  // Save new snapshot for the next run regardless of notification outcome
  saveSnapshot(currentProducts);

  if (allChanges.length === 0) {
    return {
      categoriesWithChanges: [],
      totalChanges: 0,
      allMessages: [],
      messages: [],
      length: 0,
      [Symbol.iterator]: function* () {
        yield* [];
      },
    };
  }

  // ── Keep only competitor changes — never notify on Redstore's own price moves ──
  const competitorChanges = allChanges.filter((c) => c.source !== "redstore");
  if (competitorChanges.length === 0) {
    console.log("[priceWatch] No competitor changes to report.");
    return {
      categoriesWithChanges: [],
      totalChanges: 0,
      allMessages: [],
      messages: [],
      length: 0,
      [Symbol.iterator]: function* () {
        yield* [];
      },
    };
  }

  // ── Collapse color-only variant duplicates ────────────────────────────────
  const deduped = deduplicateChanges(competitorChanges);
  console.log(
    `[priceWatch] 📊 ${deduped.length} unique changes after deduplication ` +
    `(${competitorChanges.length} raw competitor changes)`,
  );

  const changedAt = new Date();
  const dbChanges = [];
  const notebookChanges = [];

  for (const change of deduped) {
    const cat = getChangeCategory(change);
    change.detectedCategory = cat;
    if (cat === "notebooks") {
      notebookChanges.push(change);
    } else {
      dbChanges.push(change);
    }
  }

  // ── Batch DB lookup for DB-managed categories ─────────────────────────────
  let rsDbMatchMap = new Map();
  if (dbChanges.length > 0) {
    try {
      rsDbMatchMap = await batchLoadRedstoreMatches(dbChanges);
      console.log(
        `[priceWatch] 🗃️  DB returned Redstore match data for ` +
        `${rsDbMatchMap.size} of ${dbChanges.length} DB listings`,
      );
    } catch (err) {
      console.error("[priceWatch] ❌ Failed to load Redstore match data from DB:", err.message);
    }
  }

  // ── Matcher lookup for notebooks ──────────────────────────────────────────
  let rsNotebookMatchMap = new Map();
  if (notebookChanges.length > 0) {
    try {
      rsNotebookMatchMap = loadNotebookRedstoreMatches(notebookChanges);
      console.log(
        `[priceWatch] 💻 Notebook matcher returned Redstore match data for ` +
        `${rsNotebookMatchMap.size} of ${notebookChanges.length} notebook listings`,
      );
    } catch (err) {
      console.error("[priceWatch] ❌ Failed to load Redstore notebook matches:", err.message);
    }
  }

  // ── Build notifications grouped by category ───────────────────────────────
  const changeKey = (source, name) => `${source}::${name.trim().toLowerCase()}`;
  const categoryMessages = {};
  for (const catKey of CATEGORY_ORDER) {
    categoryMessages[catKey] = [];
  }

  for (const change of deduped) {
    const key = changeKey(change.source, change.name);
    const cat = change.detectedCategory || getChangeCategory(change);

    const rsListing = cat === "notebooks"
      ? rsNotebookMatchMap.get(key)
      : rsDbMatchMap.get(key);

    if (!rsListing) {
      console.log(
        `[priceWatch]   ⏭️  Skipping "${change.name}" (${change.source}) [${cat}]: ` +
        `no active Redstore match`,
      );
      continue;
    }

    const msg = formatNotification(change, rsListing, changedAt);
    if (!categoryMessages[cat]) categoryMessages[cat] = [];
    categoryMessages[cat].push(msg);
  }

  const categoriesWithChanges = [];
  for (const catKey of CATEGORY_ORDER) {
    const msgs = categoryMessages[catKey] || [];
    if (msgs.length > 0) {
      categoriesWithChanges.push({
        categoryKey: catKey,
        label: CATEGORY_LABELS[catKey] || catKey,
        messages: msgs,
      });
    }
  }

  const allMessages = categoriesWithChanges.flatMap((c) => c.messages);
  const totalChanges = allMessages.length;

  console.log(
    `[priceWatch] ✉️  ${totalChanges} notification(s) ready across ` +
    `${categoriesWithChanges.length} category/categories with changes`,
  );

  return {
    categoriesWithChanges,
    totalChanges,
    allMessages,
    messages: allMessages,
    length: totalChanges,
    [Symbol.iterator]: function* () {
      yield* allMessages;
    },
  };
}
