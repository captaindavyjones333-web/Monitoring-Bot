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
  const { phones, tablets, watches, headphones, macbooks, speakers, tvs, dyson, gaming, airconditioners } = comparisonResult;
  const notebooks = notebookMessages;

  console.log(
    `[send] 🚨 ${phones.length} phone, ${tablets.length} tablet, ${watches.length} watch, ${headphones.length} headphone, ${macbooks.length} macbook, ${speakers.length} speaker, ${tvs.length} tv, ${dyson.length} dyson, ${gaming.length} gaming, ${airconditioners.length} airconditioner, ${notebooks.length} notebooks`,
  );

  const getKey = (msg) =>
    msg
      .replace(/^\d+\.\s*/, "")
      .split("\n")[0]
      .trim();

  let result = { phones, tablets, watches, headphones, macbooks, speakers, tvs, dyson, gaming, airconditioners, notebooks };

  if (onlyNew) {
    result = {
      phones: phones.filter((m) => !previousAlertKeys.has(getKey(m))),
      tablets: tablets.filter((m) => !previousAlertKeys.has(getKey(m))),
      watches: watches.filter((m) => !previousAlertKeys.has(getKey(m))),
      headphones: headphones.filter((m) => !previousAlertKeys.has(getKey(m))),
      macbooks: macbooks.filter((m) => !previousAlertKeys.has(getKey(m))),
      speakers: speakers.filter((m) => !previousAlertKeys.has(getKey(m))),
      tvs: tvs.filter((m) => !previousAlertKeys.has(getKey(m))),
      dyson: dyson.filter((m) => !previousAlertKeys.has(getKey(m))),
      gaming: gaming.filter((m) => !previousAlertKeys.has(getKey(m))),
      airconditioners: airconditioners.filter((m) => !previousAlertKeys.has(getKey(m))),
      notebooks: notebooks.filter((m) => !previousAlertKeys.has(getKey(m))),
    };
  }

  previousAlertKeys = new Set(
    [
      ...phones,
      ...tablets,
      ...watches,
      ...headphones,
      ...macbooks,
      ...speakers,
      ...tvs,
      ...dyson,
      ...gaming,
      ...airconditioners,
      ...notebooks,
    ].map(getKey),
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
