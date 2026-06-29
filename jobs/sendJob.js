// jobs/sendJob.js
import { loadAllCaches, clearAllCaches } from "../core/cache_manager.js";
import { runComparison } from "../core/comparator.js";

// In-memory store of previously sent alert keys
let previousAlertKeys = new Set();

/**
 * Run comparison and return alert messages.
 * @param {boolean} clearAfter - clear cache after reading
 * @param {boolean} onlyNew - only return alerts not in previous batch
 * @returns {string[]} alert messages
 */
export async function runSendJob(clearAfter = false, onlyNew = false) {
  console.log("[send] 📦 Loading cache...");
  const allProducts = loadAllCaches();

  if (allProducts.length === 0) {
    console.warn("[send] ⚠️  No products in cache. Run scrape job first.");
    return [];
  }

  console.log(`[send] 🔍 Comparing ${allProducts.length} products...`);
  const alertMessages = runComparison(allProducts);
  console.log(`[send] 🚨 ${alertMessages.length} total alerts found`);

  let messagesToSend = alertMessages;

  const getKey = (msg) =>
    msg
      .replace(/^\d+\.\s*/, "")
      .split("\n")[0]
      .trim();

  if (onlyNew) {
    messagesToSend = alertMessages.filter(
      (msg) => !previousAlertKeys.has(getKey(msg)),
    );
    console.log(`[send] 🆕 ${messagesToSend.length} new alerts`);
  }

  previousAlertKeys = new Set(alertMessages.map((msg) => getKey(msg)));

  if (clearAfter) {
    clearAllCaches();
    console.log("[send] 🗑️  Cache cleared");
  }

  return messagesToSend;
}

export function resetPreviousAlerts() {
  previousAlertKeys = new Set();
}
