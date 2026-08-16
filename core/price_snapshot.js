import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_FILE = path.resolve(__dirname, "../data/price_snapshot.json");

/**
 * A snapshot entry per product per source:
 * {
 *   [source:name key]: { cash_price, installment_price, source, name }
 * }
 */

function makeKey(product) {
  return `${product.source}::${product.name.trim().toLowerCase()}`;
}

/**
 * Save current flat product list as a snapshot.
 * @param {Array} products - flat array of all products from all caches
 */
export function saveSnapshot(products) {
  const snapshot = {};
  for (const p of products) {
    const key = makeKey(p);
    snapshot[key] = {
      source: p.source,
      name: p.name,
      cash_price: p.cash_price ?? null,
      installment_price: p.installment_price ?? null,
    };
  }
  const dir = path.dirname(SNAPSHOT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`[snapshot] ✅ Saved ${Object.keys(snapshot).length} entries`);
}

/**
 * Load the previous snapshot.
 * Returns null if no snapshot exists.
 */
export function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return null;
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8"));
}

/**
 * Diff current products against previous snapshot.
 * Returns an array of change objects.
 *
 * Change types:
 *  - "new_product"   : product group (RS key) exists now but had no comparison before (🆕)
 *  - "price_up"      : price increased in a shop (📈)
 *  - "price_down"    : price decreased in a shop (📉)
 *  - "appeared"      : was ❌ (absent), now has a price (✅ appeared)
 *  - "disappeared"   : had a price, now ❌ (🔴)
 */
export function diffProducts(currentProducts, prevSnapshot) {
  if (!prevSnapshot) return [];

  const changes = [];
  const currentMap = {};
  for (const p of currentProducts) {
    const key = makeKey(p);
    currentMap[key] = p;
  }

  const prevKeys = new Set(Object.keys(prevSnapshot));
  const currentKeys = new Set(Object.keys(currentMap));

  // Check products that exist now
  for (const key of currentKeys) {
    const curr = currentMap[key];
    const prev = prevSnapshot[key];

    const currCash = curr.cash_price;
    const currInst = curr.installment_price || currCash;

    if (!prev) {
      if (currCash !== null || curr.installment_price != null) {
        changes.push({
          type: "appeared",
          source: curr.source,
          name: curr.name,
          prevCash: null,
          prevInstallment: null,
          currCash,
          currInstallment: curr.installment_price,
        });
      }
      continue;
    }

    const prevCash = prev.cash_price;
    const prevInst = prev.installment_price || prevCash;

    const cashChanged = prevCash !== currCash;
    const instChanged = prevInst !== currInst;

    if (!cashChanged && !instChanged) continue;

    let type;
    if (prevCash === null && (currCash !== null || currInst !== null)) {
      type = "appeared";
    } else if (prevCash !== null && currCash === null && currInst === null) {
      type = "disappeared";
    } else if (currCash > prevCash || currInst > prevInst) {
      type = "price_up";
    } else {
      type = "price_down";
    }

    changes.push({
      type,
      source: curr.source,
      name: curr.name,
      prevCash,
      prevInstallment: prev.installment_price,
      currCash,
      currInstallment: curr.installment_price,
    });
  }

  // Check products that disappeared entirely
  for (const key of prevKeys) {
    if (!currentKeys.has(key)) {
      const prev = prevSnapshot[key];
      if (prev.cash_price !== null || prev.installment_price !== null) {
        changes.push({
          type: "disappeared",
          source: prev.source,
          name: prev.name,
          prevCash: prev.cash_price,
          prevInstallment: prev.installment_price,
          currCash: null,
          currInstallment: null,
        });
      }
    }
  }

  return changes;
}
