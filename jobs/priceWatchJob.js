import { loadAllCaches } from "../core/cache_manager.js";
import { saveSnapshot, loadSnapshot, diffProducts } from "../core/price_snapshot.js";
import { runComparison, SOURCE_LABELS } from "../core/comparator.js";
import { normalizeName } from "../core/normalizer.js";
import { runFullScraping } from "./scrapeJob.js";

const fmt = (n) =>
  n != null ? n.toLocaleString("ru-RU").replace(/,/g, " ") : "—";

/**
 * Format a single price change into a Telegram line.
 * Returns null if the change is not reportable.
 */
function formatChange(change) {
  const label = SOURCE_LABELS[change.source] || change.source;
  const prevCash = change.prevCash;
  const currCash = change.currCash;
  const prevInst = change.prevInstallment || change.prevCash;
  const currInst = change.currInstallment || change.currCash;

  switch (change.type) {
    case "price_up": {
      const cashLine =
        currCash !== prevCash
          ? `${fmt(prevCash)} → ${fmt(currCash)} 📈`
          : fmt(currCash);
      const instLine =
        currInst !== prevInst
          ? `${fmt(prevInst)} → ${fmt(currInst)} 📈`
          : fmt(currInst);
      return `${label}: ${cashLine} | ${instLine}`;
    }
    case "price_down": {
      const cashLine =
        currCash !== prevCash
          ? `${fmt(prevCash)} → ${fmt(currCash)} 📉`
          : fmt(currCash);
      const instLine =
        currInst !== prevInst
          ? `${fmt(prevInst)} → ${fmt(currInst)} 📉`
          : fmt(currInst);
      return `${label}: ${cashLine} | ${instLine}`;
    }
    case "appeared":
      return `${label}: 🟢 ${fmt(currCash)} | ${fmt(currInst)}`;
    case "disappeared":
      return `${label}: 🔴`;
    default:
      return null;
  }
}

/**
 * Groups changes:
 * 1. Filter out RedStore ("redstore") changes completely as requested.
 * 2. Deduplicate / collapse multiple color variant changes for the same base product:
 *    If a product has multiple changes across color options in a single shop (e.g. color available/unavailable),
 *    keep only 1 change per base product per shop, UNLESS the category is Dyson (where color affects price).
 * 3. Products changed in 2+ (1+) shops -> each such product gets its own alert message containing all its shop changes.
 * 4. Products changed in only 1 shop -> grouped by shop, so each shop's changes are sent in one combined message.
 *
 * @param {Array} changes - from diffProducts()
 * @param {Set}   prevProductNames - set of lowercased names from previous snapshot
 * @returns {string[]} - list of Telegram messages
 */
function buildDiffMessages(changes, prevProductNames) {
  // 1. Exclude RedStore (RS) changes
  const filteredChanges = changes.filter((c) => c.source !== "redstore");

  // 2. Deduplicate color-only variants per product per shop (except Dyson)
  const productColorGroupMap = new Map();

  for (const change of filteredChanges) {
    const norm = normalizeName(change.name);

    if (norm.category === "dyson") {
      // Dyson colors change price & specs; keep every change
      const nameKey = change.name.trim().toLowerCase();
      if (!productColorGroupMap.has(nameKey)) {
        productColorGroupMap.set(nameKey, []);
      }
      productColorGroupMap.get(nameKey).push(change);
    } else {
      // For phones, tablets, watches, headphones, etc., group by base model (without color) + source
      const groupKey = `${change.source}::${norm.modelKey}`;
      if (!productColorGroupMap.has(groupKey)) {
        productColorGroupMap.set(groupKey, []);
      }
      productColorGroupMap.get(groupKey).push(change);
    }
  }

  const collapsedChanges = [];
  for (const changeGroup of productColorGroupMap.values()) {
    // Keep only 1 change from that product/shop group
    collapsedChanges.push(changeGroup[0]);
  }

  // Group changes by product display name
  const byProduct = new Map();
  for (const change of collapsedChanges) {
    const nameKey = change.name.trim().toLowerCase();
    if (!byProduct.has(nameKey)) {
      byProduct.set(nameKey, { name: change.name, changes: [] });
    }
    byProduct.get(nameKey).changes.push(change);
  }

  const multiShopMessages = [];
  const singleShopChangesBySource = new Map(); // source -> Array<{ name, change, isNewProduct }>

  for (const [nameKey, { name, changes: productChanges }] of byProduct) {
    const isNewProduct = !prevProductNames.has(nameKey);

    // Count how many unique shops/sources changed for this product
    const uniqueSources = new Set(productChanges.map((c) => c.source));

    if (uniqueSources.size > 1) {
      // Same product changed in 1+ shops (i.e. more than 1 shop) -> one alert per product
      const lines = [];
      for (const change of productChanges) {
        const line = formatChange(change);
        if (line) lines.push(line);
      }
      if (lines.length > 0) {
        const header = isNewProduct ? `🆕 *${name}*` : `*${name}*`;
        multiShopMessages.push(`${header}\n${lines.join("\n")}`);
      }
    } else {
      // Product changed in only 1 shop -> collect by shop
      const source = productChanges[0].source;
      if (!singleShopChangesBySource.has(source)) {
        singleShopChangesBySource.set(source, []);
      }
      for (const change of productChanges) {
        singleShopChangesBySource.get(source).push({ name, change, isNewProduct });
      }
    }
  }

  // Build shop-based messages for single-shop changes
  const shopMessages = [];
  for (const [source, items] of singleShopChangesBySource) {
    const shopLabel = SOURCE_LABELS[source] || source;
    const lines = [`🏢 *${shopLabel} փոփոխություններ*`];

    for (const { name, change, isNewProduct } of items) {
      const line = formatChange(change);
      if (line) {
        const prodHeader = isNewProduct ? `🆕 *${name}*` : `*${name}*`;
        lines.push(`\n${prodHeader}\n${line}`);
      }
    }

    if (lines.length > 1) {
      shopMessages.push(lines.join("\n"));
    }
  }

  return [...multiShopMessages, ...shopMessages];
}

/**
 * Full price-watch job:
 * 1. Load previous snapshot
 * 2. Run full scrape
 * 3. Diff current vs previous
 * 4. Save new snapshot
 * 5. Return array of formatted diff messages
 */
export async function runPriceWatchJob() {
  console.log("[priceWatch] 🔍 Starting price watch scan...");

  // Load previous snapshot before scraping
  const prevSnapshot = loadSnapshot();
  const prevProductNames = prevSnapshot
    ? new Set(
        Object.values(prevSnapshot).map((p) =>
          p.name.trim().toLowerCase()
        )
      )
    : new Set();

  // Run full scrape to update caches and execute post-scrape DB pipeline
  console.log("[priceWatch] 🌐 Running full scrape...");
  await runFullScraping();
  console.log("[priceWatch] ✅ Scrape complete");

  // Load freshly scraped products
  const currentProducts = loadAllCaches();

  // Diff
  const changes = diffProducts(currentProducts, prevSnapshot);
  console.log(`[priceWatch] 📊 ${changes.length} changes detected`);

  // Save new snapshot for next run
  saveSnapshot(currentProducts);

  if (changes.length === 0) {
    return [];
  }

  // Format into messages
  const messages = buildDiffMessages(changes, prevProductNames);
  return messages;
}
