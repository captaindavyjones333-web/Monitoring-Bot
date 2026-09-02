// generate-comparison-report.js
// Produces the same Telegram alert messages the bot sends from cache,
// but groups products from the DATABASE instead.
//
// Two usage modes:
//   1. CLI: node generate-comparison-report.js [--category=tvs]
//   2. Bot inline button: bot.js calls runDbComparison(sendFn)

import "dotenv/config";
import pg from "pg";

import {
  buildComparisons,
  buildMacbookComparisons,
  buildSingleProductComparison,
  groupPhoneAlerts,
  groupCategoryAlertsByBrand,
  getSortKey,
} from "../core/comparator.js";
import { extractModelCode } from "../core/modelCode.js";
import { normalizeName } from "../core/normalizer.js";

const DB_SLUG_BY_CATEGORY_KEY = {
  airconditioners: "air-conditioners",
};

/**
 * Query the DB, run comparisons per category (restoring phone & macbook multi-tier/code formats,
 * while preserving 1-to-1 product comparisons for all other categories),
 * filter to hasAlert===true, and return grouped alerts:
 * { phones: [], tablets: [], watches: [], headphones: [], macbooks: [], speakers: [], tvs: [], dyson: [], gaming: [], airconditioners: [], camera: [], cleaners: [], printers: [] }
 *
 * @param {string | null} categoryFilter - e.g. 'phones', 'tvs', 'airconditioners'. null = all categories.
 */
export async function getDbComparisonGrouped(categoryFilter = null) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const targetDbSlug = categoryFilter
      ? DB_SLUG_BY_CATEGORY_KEY[categoryFilter] || categoryFilter
      : null;

    const productsRes = await client.query(
      `SELECT p.id, p.canonical_title, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'active'`,
    );

    const listingsRes = await client.query(
      `SELECT sl.product_id, sl.raw_title, sl.normalized_key, sl.cash_price,
              sl.installment_price, sl.installation_price, s.name AS store_name
       FROM store_listings sl
       JOIN stores s ON s.id = sl.store_id
       WHERE sl.status = 'active'`,
    );

    // product_id -> listings[]
    const listingsByProduct = new Map();
    for (const l of listingsRes.rows) {
      if (!listingsByProduct.has(l.product_id))
        listingsByProduct.set(l.product_id, []);
      listingsByProduct.get(l.product_id).push(l);
    }

    const groupsByCategory = new Map();

    let skippedNoListings = 0;
    for (const p of productsRes.rows) {
      if (!p.category_slug) continue;

      const listings = listingsByProduct.get(p.id) ?? [];
      if (listings.length === 0) {
        skippedNoListings += 1;
        continue;
      }

      if (!groupsByCategory.has(p.category_slug))
        groupsByCategory.set(p.category_slug, new Map());
      const categoryGroups = groupsByCategory.get(p.category_slug);

      const key = String(p.id);

      let modelCode = null;
      if (p.category_slug === "macbooks") {
        modelCode = extractModelCode(p.canonical_title);
        if (!modelCode) {
          for (const l of listings) {
            modelCode =
              extractModelCode(l.raw_title) ||
              (l.normalized_key && l.normalized_key.length === 5
                ? l.normalized_key
                : null);
            if (modelCode) break;
          }
        }
      }

      let normalizedKey = String(p.id);
      if (p.category_slug === "phones") {
        const rsListing = listings.find((l) => l.store_name === "redstore");
        const nameForKey =
          (rsListing || listings[0]).raw_title || p.canonical_title;
        normalizedKey = normalizeName(nameForKey);
      }

      categoryGroups.set(key, {
        productId: p.id,
        normalized: normalizedKey,
        code: modelCode || normalizedKey,
        canonicalTitle: p.canonical_title,
        sources: {},
      });
      const targetGroup = categoryGroups.get(key);

      for (const l of listings) {
        const existing = targetGroup.sources[l.store_name];
        const newCash = l.cash_price != null ? Number(l.cash_price) : Infinity;
        if (existing) {
          const oldCash =
            existing.cash_price != null
              ? Number(existing.cash_price)
              : Infinity;
          if (newCash >= oldCash) continue;
        }
        targetGroup.sources[l.store_name] = {
          name: l.raw_title,
          cash_price: l.cash_price != null ? Number(l.cash_price) : null,
          installment_price:
            l.installment_price != null ? Number(l.installment_price) : null,
          ...(l.installation_price != null
            ? { installation_price: Number(l.installation_price) }
            : {}),
        };
      }
    }

    if (skippedNoListings > 0) {
      console.log(
        `[db-report] (${skippedNoListings} active product(s) have no active listings - skipped)`,
      );
    }

    const grouped = {
      phones: [],
      tablets: [],
      watches: [],
      headphones: [],
      macbooks: [],
      speakers: [],
      tvs: [],
      dyson: [],
      gaming: [],
      airconditioners: [],
      camera: [],
      cleaners: [],
      printers: [],
      projectors: [],
      drones: [],
      monitors: [],
    };

    for (const [categorySlug, groups] of groupsByCategory) {
      if (
        targetDbSlug &&
        categorySlug !== targetDbSlug &&
        categorySlug !== categoryFilter
      ) {
        continue;
      }

      let comparisons = [];
      if (categorySlug === "phones") {
        comparisons = buildComparisons(groups, "phones");
      } else if (categorySlug === "macbooks") {
        comparisons = buildMacbookComparisons(groups);
      } else {
        for (const [, group] of groups) {
          const comp = buildSingleProductComparison(group, categorySlug);
          if (comp && comp.hasAlert) {
            comparisons.push(comp);
          }
        }
      }

      comparisons.sort((a, b) =>
        getSortKey(a.message).localeCompare(getSortKey(b.message)),
      );
      const messages = comparisons.filter((c) => c.hasAlert).map((c) => c.message);

      const outKey =
        categorySlug === "air-conditioners" ? "airconditioners" : categorySlug;

      if (categorySlug === "phones") {
        grouped.phones = groupPhoneAlerts(messages);
      } else if (categorySlug === "macbooks") {
        grouped.macbooks = messages.map((msg, i) => `${i + 1}. ${msg}`);
      } else if (categorySlug === "dyson") {
        grouped.dyson = messages.map((msg, i) => `${i + 1}. ${msg}`);
      } else {
        grouped[outKey] = groupCategoryAlertsByBrand(categorySlug, messages);
      }

      console.log(
        `[db-report] ${categorySlug}: ${groups.size} group(s) built, ${messages.length} with alerts`,
      );
    }

    return grouped;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Query the DB, run comparisons via the real comparator.js functions,
 * filter to hasAlert===true, apply brand-grouping + numbering via
 * splitAlertsByCategory(), then deliver each final string via sendFn.
 *
 * @param {((text: string) => Promise<void>) | null} sendFn
 *   Async callback that sends one Telegram message. null = CLI mode (print only).
 * @param {string | null} categoryFilter
 *   e.g. 'tvs'. null = all categories.
 */
export async function runDbComparison(sendFn = null, categoryFilter = null) {
  const grouped = await getDbComparisonGrouped(categoryFilter);

  // Flatten all categories into a single ordered list of sendable strings
  const CATEGORY_ORDER = [
    "phones",
    "tablets",
    "watches",
    "headphones",
    "macbooks",
    "speakers",
    "tvs",
    "dyson",
    "gaming",
    "airconditioners",
    "camera",
    "cleaners",
    "printers",
    "projectors",
    "drones",
    "monitors",
  ];
  const allMessages = [];
  for (const cat of CATEGORY_ORDER) {
    const msgs = grouped[cat] ?? [];
    for (const msg of msgs) {
      allMessages.push({ category: cat, text: msg });
    }
  }

  console.log(`\n[db-report] ${allMessages.length} alert message(s) to send`);

  // ── Deliver via injected send callback (bot) or print (CLI) ─────────
  if (typeof sendFn === "function") {
    for (const { text } of allMessages) {
      await sendFn(text);
    }
    console.log("[db-report] All messages sent.");
  } else {
    for (const { category, text } of allMessages) {
      console.log(`\n--- [${category}] ---`);
      console.log(text);
    }
  }

  return allMessages;
}

// CLI entry-point - only executes when run directly via node
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("generate-comparison-report.js") ||
    process.argv[1].endsWith("generate-comparison-report"));

if (isMain) {
  const args = process.argv.slice(2);
  const categoryFilterArg = args.find((a) => a.startsWith("--category="));
  const categoryFilter = categoryFilterArg
    ? categoryFilterArg.split("=")[1]
    : null;

  runDbComparison(null, categoryFilter).catch((err) => {
    console.error("generate-comparison-report failed:", err);
    process.exit(1);
  });
}
