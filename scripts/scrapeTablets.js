import "../errorHandler.js";
import dotenv from "dotenv";
dotenv.config();

import { runTabletsScraping } from "../jobs/scrapeJob.js";
import { printCacheStatus } from "../core/cache_manager.js";

async function main() {
  const startedAt = Date.now();

  try {
    await runTabletsScraping();
  } catch (err) {
    console.error("[scrape-tablets] ❌ Unexpected failure:", err);
    process.exitCode = 1;
  } finally {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[scrape-tablets] Finished in ${seconds}s`);
    printCacheStatus();
    process.exit(process.exitCode || 0);
  }
}

main();
