import { loadAllCaches, clearAllCaches } from "../core/cache_manager.js";
import { runComparison } from "../core/comparator.js";
import { buildNotebookComparisons } from "../core/notebookComparator.js";

let previousAlertKeys = new Set();

export async function runSendJob(clearAfter = false, onlyNew = false) {
  console.log("[send] 📦 Loading cache...");
  const allProducts = loadAllCaches();

  const notebookMessages = buildNotebookComparisons();

  if (allProducts.length === 0 && notebookMessages.length === 0) {
    console.warn("[send] ⚠️  No products in cache. Run scrape job first.");
    return {
      phones: [],
      tablets: [],
      watches: [],
      headphones: [],
      macbooks: [],
      speakers: [],
      tvs: [],
      dyson: [],
      gaming: [],
      airconditioners: [],
      notebooks: [],
    };
  }

  console.log(`[send] 🔍 Comparing ${allProducts.length} products (+ ${notebookMessages.length} notebook matches)...`);
  let comparisonResult;
  try {
    comparisonResult = runComparison(allProducts);
  } catch (err) {
    console.error("[send] ❌ runComparison crashed:", err.message);
    console.error(err.stack);
    throw err;
  }
  const notebooks = notebookMessages;
  let result = { ...comparisonResult, notebooks };

  const summary = Object.entries(result)
    .map(([cat, msgs]) => `${(msgs || []).length} ${cat}`)
    .join(", ");
  console.log(`[send] 🚨 ${summary}`);

  const getKey = (msg) =>
    msg
      .replace(/^\d+\.\s*/, "")
      .split("\n")[0]
      .trim();

  if (onlyNew) {
    const filteredResult = {};
    for (const [cat, msgs] of Object.entries(result)) {
      filteredResult[cat] = (msgs || []).filter((m) => !previousAlertKeys.has(getKey(m)));
    }
    result = filteredResult;
  }

  previousAlertKeys = new Set(
    Object.values(result)
      .flat()
      .map(getKey),
  );

  if (clearAfter) {
    clearAllCaches();
    console.log("[send] 🗑️  Cache cleared");
  }

  return result;
}

export function resetPreviousAlerts() {
  previousAlertKeys = new Set();
}
