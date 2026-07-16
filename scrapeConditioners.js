import "./errorHandler.js";
import { runAirConditionersScraping } from "./jobs/scrapeJob.js";
import { printCacheStatus } from "./core/cache_manager.js";

async function main() {
  console.log("[runner] 🔄 Starting air-conditioner scraping...");
  await runAirConditionersScraping();
  printCacheStatus();
}

main().catch((err) => {
  console.error("[runner] ❌ Air-conditioner scraping failed:", err);
  process.exit(1);
});