import "../errorHandler.js";
import dotenv from "dotenv";
dotenv.config();

import { scrape3DPlanetPhones } from "../scrapers/d3planet/phones.js";
import { scrape3DPlanetTablets } from "../scrapers/d3planet/tablets.js";
import { scrape3DPlanetWatches } from "../scrapers/d3planet/watches.js";
import { scrape3DPlanetHeadphones } from "../scrapers/d3planet/headphones.js";
import { scrape3DPlanetMacbooks } from "../scrapers/d3planet/macbooks.js";
import { scrape3DPlanetSpeakers } from "../scrapers/d3planet/speakers.js";
import { scrape3DPlanetDyson } from "../scrapers/d3planet/dyson.js";
import { scrape3DPlanetGaming } from "../scrapers/d3planet/gaming.js";
import { saveCache, markUpdated, printCacheStatus } from "../core/cache_manager.js";

async function main() {
  const startedAt = Date.now();
  const source = "3dplanet";
  console.log(`[scrape-3dplanet] 🔄 Starting full scraping for ${source}...`);

  const scraperTasks = [
    { category: "phones", fn: scrape3DPlanetPhones },
    { category: "tablets", fn: scrape3DPlanetTablets },
    { category: "watches", fn: scrape3DPlanetWatches },
    { category: "headphones", fn: scrape3DPlanetHeadphones },
    { category: "macbooks", fn: scrape3DPlanetMacbooks },
    { category: "speakers", fn: scrape3DPlanetSpeakers },
    { category: "dyson", fn: scrape3DPlanetDyson },
    { category: "gaming", fn: scrape3DPlanetGaming },
  ];

  const allProducts = [];

  for (const task of scraperTasks) {
    try {
      console.log(`[scrape-3dplanet] Scraping ${task.category}...`);
      const products = await task.fn();
      if (Array.isArray(products) && products.length > 0) {
        allProducts.push(...products);
        console.log(
          `[scrape-3dplanet] ✅ ${task.category}: ${products.length} products fetched`
        );
      } else {
        console.warn(`[scrape-3dplanet] ⚠️  ${task.category}: 0 products returned`);
      }
    } catch (err) {
      console.error(
        `[scrape-3dplanet] ❌ Category ${task.category} failed: ${err.message}`
      );
    }
  }

  try {
    if (allProducts.length === 0) {
      console.warn(
        `[scrape-3dplanet] ⚠️  No products retrieved across all categories, keeping old cache.`
      );
    } else {
      // Deduplicate by name if needed
      const seen = new Map();
      for (const product of allProducts) {
        if (!seen.has(product.name)) {
          seen.set(product.name, product);
        }
      }
      const uniqueProducts = [...seen.values()];
      saveCache(source, uniqueProducts);
      markUpdated(source);
      console.log(
        `[scrape-3dplanet] ✅ Successfully saved ${uniqueProducts.length} products into cache for ${source}`
      );
    }
  } catch (err) {
    console.error(`[scrape-3dplanet] ❌ Failed to update cache:`, err);
    process.exitCode = 1;
  } finally {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[scrape-3dplanet] Finished in ${seconds}s`);
    printCacheStatus();
    process.exit(process.exitCode || 0);
  }
}

main();
