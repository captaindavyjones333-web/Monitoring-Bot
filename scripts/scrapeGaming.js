import "../errorHandler.js";
import dotenv from "dotenv";
dotenv.config();

import { runGamingScraping } from "../jobs/scrapeJob.js";
import { printCacheStatus } from "../core/cache_manager.js";

async function main() {
  const startedAt = Date.now();

  try {
    await runGamingScraping();
  } catch (err) {
    console.error("[scrape-gaming] ❌ Unexpected failure:", err);
    process.exitCode = 1;
  } finally {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[scrape-gaming] Finished in ${seconds}s`);
    printCacheStatus();
    process.exit(process.exitCode || 0);
  }
}

main();
