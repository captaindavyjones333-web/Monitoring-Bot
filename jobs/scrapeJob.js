import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { scrapeRedstoreSpeakers } from "../scrapers/redstore/speakers.js";
import { scrapeYerevanMobileSpeakers } from "../scrapers/yerevanmobile/speakers.js";
import { scrapeMobileCentreSpeakers } from "../scrapers/mobilecentre/speakers.js";
import { scrapeAllsellSpeakers } from "../scrapers/allsell/speakers.js";
import { scrape3DPlanetSpeakers } from "../scrapers/d3planet/speakers.js";
import { scrapeEldoradoSpeakers } from "../scrapers/eldorado/speakers.js";
import { scrapeRedstoreTvs } from "../scrapers/redstore/tvs.js";
import { scrapeYerevanMobileTvs } from "../scrapers/yerevanmobile/tvs.js";
import { scrapeMobileCentreTvs } from "../scrapers/mobilecentre/tvs.js";
import { scrapeAllsellTvs } from "../scrapers/allsell/tvs.js";
import { scrapeEldoradoTvs } from "../scrapers/eldorado/tvs.js";
import { scrapeVestaTvs } from "../scrapers/vesta/tvs.js";
import { scrapeVegaTvs } from "../scrapers/vega/tvs.js";
import { scrapeZigzagTvs } from "../scrapers/zigzag/tvs.js";
import { scrapeVlvTvs } from "../scrapers/vlv/tvs.js";
import { scrapeRedstoreDyson } from "../scrapers/redstore/dyson.js";
import { scrapeYerevanMobileDyson } from "../scrapers/yerevanmobile/dyson.js";
import { scrapeMobileCentreDyson } from "../scrapers/mobilecentre/dyson.js";
import { scrapeAllsellDyson } from "../scrapers/allsell/dyson.js";
import { scrape3DPlanetDyson } from "../scrapers/d3planet/dyson.js";
import { scrapeEldoradoDyson } from "../scrapers/eldorado/dyson.js";
import { scrapeZigzagDyson } from "../scrapers/zigzag/dyson.js";
import { scrapeRedstoreGaming } from "../scrapers/redstore/gaming.js";
import { scrapeYerevanMobileGaming } from "../scrapers/yerevanmobile/gaming.js";
import { scrapeMobileCentreGaming } from "../scrapers/mobilecentre/gaming.js";
import { scrapeAllsellGaming } from "../scrapers/allsell/gaming.js";
import { scrape3DPlanetGaming } from "../scrapers/d3planet/gaming.js";
import { scrapeEldoradoGaming } from "../scrapers/eldorado/gaming.js";
import { scrapeRedstoreAirConditioners } from "../scrapers/redstore/airconditioners.js";
import { scrapeAllsellAirConditioners } from "../scrapers/allsell/airconditioners.js";
import { scrapeEldoradoAirConditioners } from "../scrapers/eldorado/airconditioners.js";
import { scrapeVestaAirConditioners } from "../scrapers/vesta/airconditioners.js";
import { scrapeVlvAirConditioners } from "../scrapers/vlv/airconditioners.js";
import { scrapeVegaPhones } from "../scrapers/vega/phones.js";
import { scrapeZigzagPhones } from "../scrapers/zigzag/phones.js";
import { scrapeZigzagHeadphones } from "../scrapers/zigzag/headphones.js";
import { scrapeZigzagSpeakers } from "../scrapers/zigzag/speakers.js";
import { scrapeVlvPhones } from "../scrapers/vlv/phones.js";
import { scrapeAllsellCleaners } from "../scrapers/allsell/cleaners.js";
import { scrapeRedstoreCleaners } from "../scrapers/redstore/cleaners.js";
import { scrapeVlvCleaners } from "../scrapers/vlv/cleaners.js";
import { scrapeYerevanMobileCleaners } from "../scrapers/yerevanmobile/cleaners.js";
import { scrapeZigzagCleaners } from "../scrapers/zigzag/cleaners.js";
import { scrape3DPlanetCleaners } from "../scrapers/d3planet/cleaners.js";
import { scrapeEldoradoCameras } from "../scrapers/eldorado/camera.js";
import { scrapeRedstoreCameras } from "../scrapers/redstore/camera.js";
import { scrapeZigzagCameras } from "../scrapers/zigzag/camera.js";
import { scrapeVlvCameras } from "../scrapers/vlv/camera.js";
import { scrape3DPlanetCameras } from "../scrapers/d3planet/camera.js";
import { scrapeZigzagPrinters } from "../scrapers/zigzag/printers.js";
import { scrapeRedstorePrinters } from "../scrapers/redstore/printers.js";
import { scrapeAllsellPrinters } from "../scrapers/allsell/printers.js";
import { scrapeNotebookcentrePrinters } from "../scrapers/notebookcentre/printers.js";
import { scrapeDgcompPrinters } from "../scrapers/dgcomp/printers.js";
import { scrapeNotebookmallPrinters } from "../scrapers/notebookmall/printers.js";
import { scrapeRedstoreMonitors } from "../scrapers/redstore/monitors.js";
import { scrapeNotebookcentreMonitors } from "../scrapers/notebookcentre/monitors.js";
import { scrapeDgcompMonitors } from "../scrapers/dgcomp/monitors.js";
import { scrapeNotebookmallMonitors } from "../scrapers/notebookmall/monitors.js";
import { scrapeMiarmeniaMonitors } from "../scrapers/miarmenia/monitors.js";
import { scrapeSmartboxMonitors } from "../scrapers/smartbox/monitors.js";
import { scrapeZigzagMonitors } from "../scrapers/zigzag/monitors.js";
import { scrapeRedstoreProjectors } from "../scrapers/redstore/projectors.js";
import { scrapeNotebookcentreProjectors } from "../scrapers/notebookcentre/projectors.js";
import { scrapeDgcompProjectors } from "../scrapers/dgcomp/projectors.js";
import { scrapeNotebookmallProjectors } from "../scrapers/notebookmall/projectors.js";
import { scrapeRedstoreDrones } from "../scrapers/redstore/drones.js";
import { scrapeYerevanMobileDrones } from "../scrapers/yerevanmobile/drones.js";
import { scrapeAllsellDrones } from "../scrapers/allsell/drones.js";
import { scrape3DPlanetDrones } from "../scrapers/d3planet/drones.js";

export async function runDronesScraping() {
  console.log("[scrape] 🔄 Starting drone-only scrape...");
  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "drones", scrapeRedstoreDrones),
    // scrapeCategoryIntoSource("yerevanmobile", "drones", scrapeYerevanMobileDrones),
    // scrapeCategoryIntoSource("allsell", "drones", scrapeAllsellDrones),
    // scrapeCategoryIntoSource("3dplanet", "drones", scrape3DPlanetDrones),
  ]);
  console.log("[scrape] ✅ Drone-only scrape complete");
}

export async function runProjectorsScraping() {
  console.log("[scrape] 🔄 Starting projector-only scrape...");
  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "projectors", scrapeRedstoreProjectors),
    scrapeCategoryIntoSource("notebookcentre", "projectors", scrapeNotebookcentreProjectors),
    scrapeCategoryIntoSource("dgcomp", "projectors", scrapeDgcompProjectors),
    scrapeCategoryIntoSource("notebookmall", "projectors", scrapeNotebookmallProjectors),
  ]);
  console.log("[scrape] ✅ Projector-only scrape complete");
}

export async function runMonitorsScraping() {
  console.log("[scrape] 🔄 Starting monitor-only scrape...");
  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "monitors", scrapeRedstoreMonitors),
    scrapeCategoryIntoSource("notebookcentre", "monitors", scrapeNotebookcentreMonitors),
    scrapeCategoryIntoSource("dgcomp", "monitors", scrapeDgcompMonitors),
    scrapeCategoryIntoSource("notebookmall", "monitors", scrapeNotebookmallMonitors),
    scrapeCategoryIntoSource("miarmenia", "monitors", scrapeMiarmeniaMonitors),
    scrapeCategoryIntoSource("smartbox", "monitors", scrapeSmartboxMonitors),
    scrapeCategoryIntoSource("zigzag", "monitors", scrapeZigzagMonitors),
  ]);
  console.log("[scrape] ✅ Monitor-only scrape complete");
}

export async function runCameraScraping() {
  console.log("[scrape] 🔄 Starting camera-only scrape...");
  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "cameras", scrapeRedstoreCameras),
    scrapeCategoryIntoSource("3dplanet", "cameras", scrape3DPlanetCameras),
    scrapeCategoryIntoSource("zigzag", "cameras", scrapeZigzagCameras),
    scrapeCategoryIntoSource("vlv", "cameras", scrapeVlvCameras),
    scrapeCategoryIntoSource("eldorado", "cameras", scrapeEldoradoCameras),
  ]);
  console.log("[scrape] ✅ Camera-only scrape complete");
}

export async function runPrintersScraping() {
  console.log("[scrape] 🔄 Starting printer-only scrape...");
  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "printers", scrapeRedstorePrinters),
    scrapeCategoryIntoSource("allsell", "printers", scrapeAllsellPrinters),
    scrapeCategoryIntoSource("zigzag", "printers", scrapeZigzagPrinters),
    scrapeCategoryIntoSource(
      "notebookcentre",
      "printers",
      scrapeNotebookcentrePrinters,
    ),
    scrapeCategoryIntoSource("dgcomp", "printers", scrapeDgcompPrinters),
    scrapeCategoryIntoSource("notebookmall", "printers", scrapeNotebookmallPrinters),
  ]);
  console.log("[scrape] ✅ Printer-only scrape complete");
}

export async function runCleanersScraping() {
  console.log("[scrape] 🔄 Starting cleaner-only scrape...");
  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "cleaners", scrapeRedstoreCleaners),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "cleaners",
      scrapeYerevanMobileCleaners,
    ),
    scrapeCategoryIntoSource("allsell", "cleaners", scrapeAllsellCleaners),
    scrapeCategoryIntoSource("3dplanet", "cleaners", scrape3DPlanetCleaners),
    scrapeCategoryIntoSource("zigzag", "cleaners", scrapeZigzagCleaners),
    scrapeCategoryIntoSource("vlv", "cleaners", scrapeVlvCleaners),
  ]);
  console.log("[scrape] ✅ Cleaner-only scrape complete");
}

export async function runAirConditionersScraping() {
  console.log("[scrape] 🔄 Starting AC-only scrape...");
  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "redstore",
      "airconditioners",
      scrapeRedstoreAirConditioners,
    ),
    scrapeCategoryIntoSource(
      "allsell",
      "airconditioners",
      scrapeAllsellAirConditioners,
    ),
    scrapeCategoryIntoSource(
      "vesta",
      "airconditioners",
      scrapeVestaAirConditioners,
    ),
    scrapeCategoryIntoSource(
      "vlv",
      "airconditioners",
      scrapeVlvAirConditioners,
    ),
  ]);
  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "eldorado",
      "airconditioners",
      scrapeEldoradoAirConditioners,
    ),
  ]);
  console.log("[scrape] ✅ AC-only scrape complete");
}

export async function runGamingScraping() {
  console.log("[scrape] 🔄 Starting gaming-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "gaming", scrapeRedstoreGaming),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "gaming",
      scrapeYerevanMobileGaming,
    ),
    scrapeCategoryIntoSource("allsell", "gaming", scrapeAllsellGaming),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "mobilecentre",
      "gaming",
      scrapeMobileCentreGaming,
    ),
    scrapeCategoryIntoSource("3dplanet", "gaming", scrape3DPlanetGaming),
    scrapeCategoryIntoSource("eldorado", "gaming", scrapeEldoradoGaming),
  ]);

  console.log("[scrape] ✅ Gaming-only scrape complete");
}

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

export async function runDysonScraping() {
  console.log("[scrape] 🔄 Starting Dyson-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "dyson", scrapeRedstoreDyson),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "dyson",
      scrapeYerevanMobileDyson,
    ),
    scrapeCategoryIntoSource("allsell", "dyson", scrapeAllsellDyson),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource("mobilecentre", "dyson", scrapeMobileCentreDyson),
    scrapeCategoryIntoSource("3dplanet", "dyson", scrape3DPlanetDyson),
    scrapeCategoryIntoSource("eldorado", "dyson", scrapeEldoradoDyson),
    scrapeCategoryIntoSource("zigzag", "dyson", scrapeZigzagDyson),
  ]);

  console.log("[scrape] ✅ Dyson-only scrape complete");
}

export async function runTvsScraping() {
  console.log("[scrape] 🔄 Starting tvs-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "tvs", scrapeRedstoreTvs),
    scrapeCategoryIntoSource("yerevanmobile", "tvs", scrapeYerevanMobileTvs),
    scrapeCategoryIntoSource("allsell", "tvs", scrapeAllsellTvs),
    scrapeCategoryIntoSource("vesta", "tvs", scrapeVestaTvs),
    scrapeCategoryIntoSource("vega", "tvs", scrapeVegaTvs),
    scrapeCategoryIntoSource("zigzag", "tvs", scrapeZigzagTvs),
    scrapeCategoryIntoSource("vlv", "tvs", scrapeVlvTvs),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource("mobilecentre", "tvs", scrapeMobileCentreTvs),
    scrapeCategoryIntoSource("eldorado", "tvs", scrapeEldoradoTvs),
  ]);

  console.log("[scrape] ✅ Tvs-only scrape complete");
}

export async function runSpeakersScraping() {
  console.log("[scrape] 🔄 Starting speakers-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "speakers", scrapeRedstoreSpeakers),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "speakers",
      scrapeYerevanMobileSpeakers,
    ),
    scrapeCategoryIntoSource("allsell", "speakers", scrapeAllsellSpeakers),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "mobilecentre",
      "speakers",
      scrapeMobileCentreSpeakers,
    ),
    scrapeCategoryIntoSource("3dplanet", "speakers", scrape3DPlanetSpeakers),
    scrapeCategoryIntoSource("eldorado", "speakers", scrapeEldoradoSpeakers),
    scrapeCategoryIntoSource("zigzag", "speakers", scrapeZigzagSpeakers),
  ]);

  console.log("[scrape] ✅ Speakers-only scrape complete");
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
    scrapeCategoryIntoSource("zigzag", "headphones", scrapeZigzagHeadphones),
  ]);

  console.log("[scrape] ✅ Headphones-only scrape complete");
}

export async function runPhonesScraping() {
  console.log("[scrape] 🔄 Starting phones-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "phones", scrapeRedstorePhones),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "phones",
      scrapeYerevanMobilePhones,
    ),
    scrapeCategoryIntoSource("allsell", "phones", scrapeAllsellPhones),
    scrapeCategoryIntoSource("vega", "phones", scrapeVegaPhones),
    scrapeCategoryIntoSource("vlv", "phones", scrapeVlvPhones),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "mobilecentre",
      "phones",
      scrapeMobileCentrePhones,
    ),
    scrapeCategoryIntoSource("3dplanet", "phones", scrape3DPlanetPhones),
    scrapeCategoryIntoSource("zigzag", "phones", scrapeZigzagPhones),
  ]);

  console.log("[scrape] ✅ Phones-only scrape complete");
}

export async function runTabletsScraping() {
  console.log("[scrape] 🔄 Starting tablets-only scrape...");

  await Promise.allSettled([
    scrapeCategoryIntoSource("redstore", "tablets", scrapeRedstoreTablets),
    scrapeCategoryIntoSource(
      "yerevanmobile",
      "tablets",
      scrapeYerevanMobileTablets,
    ),
    scrapeCategoryIntoSource("allsell", "tablets", scrapeAllsellTablets),
  ]);

  await Promise.allSettled([
    scrapeCategoryIntoSource(
      "mobilecentre",
      "tablets",
      scrapeMobileCentreTablets,
    ),
    scrapeCategoryIntoSource("3dplanet", "tablets", scrape3DPlanetTablets),
  ]);

  console.log("[scrape] ✅ Tablets-only scrape complete");
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
      ["phones", "tablets", "watches"],
    ),
    runScraper(
      [
        scrapeYerevanMobilePhones,
        scrapeYerevanMobileTablets,
        scrapeYerevanMobileWatches,
      ],
      "yerevanmobile",
      ["phones", "tablets", "watches"],
    ),
    runScraper(
      [scrapeAllsellPhones, scrapeAllsellTablets, scrapeAllsellWatches],
      "allsell",
      ["phones", "tablets", "watches"],
    ),
    runScraper([scrapeVegaPhones], "vega", ["phones"]),
    runScraper([scrapeVlvPhones], "vlv", ["phones"]),
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
      ["phones", "tablets", "watches"],
    ),
    runScraper(
      [scrape3DPlanetPhones, scrape3DPlanetTablets, scrape3DPlanetWatches],
      "3dplanet",
      ["phones", "tablets", "watches"],
    ),
    runScraper([scrapeZigzagPhones], "zigzag", ["phones"]),
  ]);

  console.log("[scrape] ✅ Scrape job complete");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runScript(scriptRelativePath, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, scriptRelativePath);
    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `[pipeline] 🚀 Running ${path.basename(scriptPath)} ${scriptArgs.join(" ")}`,
    );
    console.log("=".repeat(60));

    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        console.log(
          `[pipeline] ✅ ${path.basename(scriptPath)} completed successfully.`,
        );
        resolve();
      } else {
        reject(
          new Error(`${path.basename(scriptPath)} exited with code ${code}`),
        );
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

export async function runPostScrapePipeline() {
  const cachePath = path.resolve(__dirname, "../cache");
  console.log(
    "[pipeline] 🔄 Executing post-scrape ingestion & fuzzy matching...",
  );
  await runScript("../migration/process-scrape.js", [cachePath]);
  await runScript("../migration/fuzzy-match.js", []);
  console.log("[pipeline] ✅ Post-scrape pipeline completed successfully.");
}

export async function runFullScraping() {
  console.log("[scrape] 🔄 Starting full scrape job across all categories...");
  await runScraping();
  await runWatchesScraping();
  await runHeadphonesScraping();
  await runMacbooksScraping();
  await runSpeakersScraping();
  await runTvsScraping();
  await runDysonScraping();
  await runGamingScraping();
  await runAirConditionersScraping();
  await runCameraScraping();
  await runPrintersScraping();
  await runCleanersScraping();
  await runMonitorsScraping();
  await runProjectorsScraping();
  await runDronesScraping();
  console.log(
    "[scrape] ✅ All category scrapers finished. Running post-scrape DB pipeline...",
  );
  await runPostScrapePipeline();
  console.log("[scrape] ✅ Full scraping and post-scrape pipeline complete.");
}
