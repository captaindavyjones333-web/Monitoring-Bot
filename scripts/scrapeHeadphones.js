import "../errorHandler.js";
import dotenv from "dotenv";
dotenv.config();

import { runHeadphonesScraping } from "../jobs/scrapeJob.js";
import { printCacheStatus } from "../core/cache_manager.js";

async function main() {
  const startedAt = Date.now();

  try {
    await runHeadphonesScraping();
  } catch (err) {
    console.error("[scrape-headphones] ❌ Unexpected failure:", err);
    process.exitCode = 1;
  } finally {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[scrape-headphones] Finished in ${seconds}s`);
    printCacheStatus();
    process.exit(process.exitCode || 0);
  }
}

main();
