// jobs/scrapeJob.js
import { scrapeRedstore } from "../scrapers/redstore.js";
import { scrapeYerevanMobile } from "../scrapers/ym.js";
import { scrapeMobileCentre } from "../scrapers/mobile.js";
import { scrape3DPlanet } from "../scrapers/d3planet.js";
import { scrapeAllsell } from "../scrapers/allsell.js";
import { saveCache, markUpdated } from "../core/cache_manager.js";

async function runScraper(fn, source) {
  try {
    console.log(`[scrape] Scraping ${source}...`);
    const products = await fn();
    if (!products || products.length === 0) {
      console.warn(
        `[scrape] ⚠️  ${source}: no products returned, keeping old cache`,
      );
      return;
    }
    saveCache(source, products);
    markUpdated(source);
    console.log(`[scrape] ✅ ${source}: ${products.length} products saved`);
  } catch (err) {
    console.error(
      `[scrape] ❌ ${source} failed: ${err.message} — keeping old cache`,
    );
  }
}

export async function runScraping() {
  console.log("[scrape] 🔄 Starting scrape job...");

  // Group 1: axios-based scrapers in parallel
  console.log("[scrape] Group 1: axios scrapers (parallel)...");
  await Promise.allSettled([
    runScraper(scrapeRedstore, "redstore"),
    runScraper(scrapeYerevanMobile, "yerevanmobile"),
    runScraper(scrapeAllsell, "allsell"),
  ]);

  // Group 2: Puppeteer scrapers in parallel
  console.log("[scrape] Group 2: Puppeteer scrapers (parallel)...");
  await Promise.allSettled([
    runScraper(scrapeMobileCentre, "mobilecentre"),
    runScraper(scrape3DPlanet, "3dplanet"),
  ]);

  console.log("[scrape] ✅ Scrape job complete");
}
