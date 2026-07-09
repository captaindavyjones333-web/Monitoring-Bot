import { scrapeRedstorePhones } from "../scrapers/redstore/phones.js";
import { scrapeRedstoreTablets } from "../scrapers/redstore/tablets.js";
import { scrapeRedstoreWatches } from "../scrapers/redstore/watches.js";
import { scrapeYerevanMobilePhones } from "../scrapers/yerevanmobile/phones.js";
import { scrapeYerevanMobileTablets } from "../scrapers/yerevanmobile/tablets.js";
import { scrapeYerevanMobileWatches } from "../scrapers/yerevanmobile/watches.js";
import { scrapeMobileCentrePhones } from "../scrapers/mobilecentre/phones.js";
import { scrapeMobileCentreTablets } from "../scrapers/mobilecentre/tablets.js";
import { scrapeMobileCentreWatches } from "../scrapers/mobilecentre/watches.js";
import { scrapeAllsellPhones } from "../scrapers/allsell/phones.js";
import { scrapeAllsellTablets } from "../scrapers/allsell/tablets.js";
import { scrapeAllsellWatches } from "../scrapers/allsell/watches.js";
import { scrape3DPlanetPhones } from "../scrapers/d3planet/phones.js";
import { scrape3DPlanetTablets } from "../scrapers/d3planet/tablets.js";
import { scrape3DPlanetWatches } from "../scrapers/d3planet/watches.js";
import { loadCache, saveCache, markUpdated } from "../core/cache_manager.js";
import { detectCategory } from "../core/categoryDetector.js";
import { scrapeRedstoreHeadphones } from "../scrapers/redstore/headphones.js";
import { scrapeYerevanMobileHeadphones } from "../scrapers/yerevanmobile/headphones.js";
import { scrapeMobileCentreHeadphones } from "../scrapers/mobilecentre/headphones.js";
import { scrapeAllsellHeadphones } from "../scrapers/allsell/headphones.js";
import { scrape3DPlanetHeadphones } from "../scrapers/d3planet/headphones.js";
import { scrapeRedstoreMacbooks } from "../scrapers/redstore/macbooks.js";
import { scrapeYerevanMobileMacbooks } from "../scrapers/yerevanmobile/macbooks.js";
import { scrapeMobileCentreMacbooks } from "../scrapers/mobilecentre/macbooks.js";
import { scrapeAllsellMacbooks } from "../scrapers/allsell/macbooks.js";
import { scrape3DPlanetMacbooks } from "../scrapers/d3planet/macbooks.js";
import { scrapeIcentreMacbooks } from "../scrapers/icentre/macbooks.js";
import { scrapeIspaceMacbooks } from "../scrapers/ispace/macbooks.js";

async function scrapeCategoryIntoSource(source, category, fn) {
  try {
    console.log(`[scrape] ${source}/${category}: scraping...`);
    const freshProducts = await fn();

    if (!freshProducts || freshProducts.length === 0) {
      console.warn(
        `[scrape] ⚠️  ${source}/${category}: no products returned, cache unchanged`,
      );
      return;
    }

    const existingCache = loadCache(source);
    const existingProducts = existingCache?.products || [];

    // Keep everything from other categories, drop old entries of THIS
    // category (they're being replaced by the fresh scrape).
    const keptOtherCategories = existingProducts.filter(
      (p) => detectCategory(p.name) !== category,
    );

    const merged = [...keptOtherCategories, ...freshProducts];
    saveCache(source, merged);
    markUpdated(source);
    console.log(
      `[scrape] ✅ ${source}/${category}: ${freshProducts.length} products merged (${merged.length} total in cache)`,
    );
  } catch (err) {
    console.error(`[scrape] ❌ ${source}/${category} failed: ${err.message}`);
  }
}

export async function runMacbooksScraping() {
  console.log("[scrape] 🔄 Starting macbooks-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "macbooks", scrapeRedstoreMacbooks),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "macbooks",
      scrapeYerevanMobileMacbooks,
    ),
    scrapeCategoryIntoSource("allsell", "macbooks", scrapeAllsellMacbooks),
    scrapeCategoryIntoSource("icentre", "macbooks", scrapeIcentreMacbooks),
    scrapeCategoryIntoSource("ispace", "macbooks", scrapeIspaceMacbooks),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "mobilecentre",
      "macbooks",
      scrapeMobileCentreMacbooks,
    ),
    scrapeCategoryIntoSource("3dplanet", "macbooks", scrape3DPlanetMacbooks),
  ]);

  console.log("[scrape] ✅ Macbooks-only scrape complete");
}

export async function runWatchesScraping() {
  console.log("[scrape] 🔄 Starting watches-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "watches", scrapeRedstoreWatches),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "watches",
      scrapeYerevanMobileWatches,
    ),
    scrapeCategoryIntoSource("allsell", "watches", scrapeAllsellWatches),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "mobilecentre",
      "watches",
      scrapeMobileCentreWatches,
    ),
    scrapeCategoryIntoSource("3dplanet", "watches", scrape3DPlanetWatches),
  ]);

  console.log("[scrape] ✅ Watches-only scrape complete");
}

export async function runHeadphonesScraping() {
  console.log("[scrape] 🔄 Starting headphones-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "redstore",
      "headphones",
      scrapeRedstoreHeadphones,
    ),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "headphones",
      scrapeYerevanMobileHeadphones,
    ),
    scrapeCategoryIntoSource("allsell", "headphones", scrapeAllsellHeadphones),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "mobilecentre",
      "headphones",
      scrapeMobileCentreHeadphones,
    ),
    scrapeCategoryIntoSource(
      "3dplanet",
      "headphones",
      scrape3DPlanetHeadphones,
    ),
  ]);

  console.log("[scrape] ✅ Headphones-only scrape complete");
}

async function runScraperSequential(fns, source) {
  try {
    console.log(`[scrape] Scraping ${source}...`);
    const products = [];
    for (const fn of fns) {
      try {
        const result = await fn();
        if (Array.isArray(result)) products.push(...result);
      } catch (err) {
        console.error(
          `[scrape] ❌ ${source} sub-scraper failed: ${err.message}`,
        );
      }
    }
    if (products.length === 0) {
      console.warn(`[scrape] ⚠️  ${source}: no products, keeping old cache`);
      return;
    }
    saveCache(source, products);
    markUpdated(source);
    console.log(`[scrape] ✅ ${source}: ${products.length} products saved`);
  } catch (err) {
    console.error(`[scrape] ❌ ${source} failed: ${err.message}`);
  }
}

async function runScraper(fns, source) {
  try {
    console.log(`[scrape] Scraping ${source}...`);
    const settled = await Promise.allSettled(fns.map((fn) => fn()));

    const products = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        products.push(...r.value);
      } else if (r.status === "rejected") {
        // One category failing (e.g. tablets) never wipes out another
        // (e.g. phones) — each sub-scraper's success is independent.
        console.error(
          `[scrape] ❌ ${source} sub-scraper #${i} failed: ${r.reason?.message}`,
        );
      }
    });

    if (products.length === 0) {
      console.warn(`[scrape] ⚠️  ${source}: no products, keeping old cache`);
      return;
    }
    saveCache(source, products);
    markUpdated(source);
    console.log(`[scrape] ✅ ${source}: ${products.length} products saved`);
  } catch (err) {
    console.error(`[scrape] ❌ ${source} failed: ${err.message}`);
  }
}

export async function runScraping() {
  console.log("[scrape] 🔄 Starting scrape job...");

  console.log("[scrape] Group 1: axios scrapers (parallel)...");
  await Promise.allSettled([
    runScraper(
      [scrapeRedstorePhones, scrapeRedstoreTablets, scrapeRedstoreWatches],
      "redstore",
    ),
    runScraper(
      [
        scrapeYerevanMobilePhones,
        scrapeYerevanMobileTablets,
        scrapeYerevanMobileWatches,
      ],
      "yerevanmobile",
    ),
    runScraper(
      [scrapeAllsellPhones, scrapeAllsellTablets, scrapeAllsellWatches],
      "allsell",
    ),
  ]);

  console.log("[scrape] Group 2: Puppeteer scrapers (parallel)...");
  await Promise.allSettled([
    runScraperSequential(
      [
        scrapeMobileCentrePhones,
        scrapeMobileCentreTablets,
        scrapeMobileCentreWatches,
      ],
      "mobilecentre",
    ),
    runScraper(
      [scrape3DPlanetPhones, scrape3DPlanetTablets, scrape3DPlanetWatches],
      "3dplanet",
    ),
  ]);

  console.log("[scrape] ✅ Scrape job complete");
}
