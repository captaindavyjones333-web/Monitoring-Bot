import { loadAllCaches, clearAllCaches } from "../core/cache_manager.js";
import { runComparison } from "../core/comparator.js";

let previousAlertKeys = new Set();

export async function runSendJob(clearAfter = false, onlyNew = false) {
  console.log("[send] 📦 Loading cache...");
  const allProducts = loadAllCaches();

  if (allProducts.length === 0) {
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
    };
  }

  console.log(`[send] 🔍 Comparing ${allProducts.length} products...`);
  let comparisonResult;
  try {
    comparisonResult = runComparison(allProducts);
  } catch (err) {
    console.error("[send] ❌ runComparison crashed:", err.message);
    console.error(err.stack);
    throw err;
  }
  const { phones, tablets, watches, headphones, macbooks, speakers, tvs, dyson, gaming } = runComparison(allProducts);

  console.log(
    `[send] 🚨 ${phones.length} phone, ${tablets.length} tablet, ${watches.length} watch, ${headphones.length} headphone, ${macbooks.length} macbook, ${speakers.length} speaker, ${tvs.length} tv, ${dyson.length} dyson, ${gaming.length} gaming`,
  );

  const getKey = (msg) =>
    msg
      .replace(/^\d+\.\s*/, "")
      .split("\n")[0]
      .trim();

  let result = { phones, tablets, watches, headphones, macbooks, speakers, tvs, dyson, gaming };

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
