// process-scrape.js — ingests a fresh scrape into the DB, connecting new
// listings to the RIGHT existing product (respecting any merges an admin
// has confirmed) instead of creating duplicates. Run this after every
// scrape, per store or batched across stores — same input shape as
// migrate.js.
//
// This is what actually answers "how does the bot know a merge
// happened": it never re-derives groups from scratch the way
// runComparison() does. It always checks against CURRENTLY ACTIVE
// products first, and a merged-away product is never active — so once
// you confirm a merge in the panel, every future listing that would
// have matched the old (now-merged) product finds the surviving one
// instead, automatically, with no special-casing.
//
// Usage:
//   node process-scrape.js path/to/scrape.json              (writes to DB)
//   node process-scrape.js path/to/cache-folder --dry-run    (prints a summary)

import fs from "node:fs";
import path from "node:path";
try {
  await import("dotenv/config");
} catch {}
import pg from "pg";

import { detectCategory, MACBOOK_REGEX, TV_REGEX, GAMING_REGEX, AC_REGEX, DYSON_REGEX } from "../core/categoryDetector.js";
import { normalizeName, groupByNormalizedName } from "../core/normalizer.js";
import { extractModelCode } from "../core/modelCode.js";
import { extractTvModelCode } from "../core/tvModelCode.js";
import { extractDysonKey } from "../core/dysonModelCode.js";
import { extractACCode } from "../core/acModelCode.js";
import { normalizeGamingName } from "../core/gamingNormalizer.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputPath = args.find((a) => !a.startsWith("--"));

if (!inputPath) {
  console.error("Usage: node process-scrape.js path/to/scrape.json-or-folder [--dry-run]");
  process.exit(1);
}

const CATEGORY_SLUG_MAP = {
  phones: "phones",
  tablets: "tablets",
  watches: "watches",
  headphones: "headphones",
  speakers: "speakers",
  macbooks: "macbooks",
  tvs: "tvs",
  dyson: "dyson",
  gaming: "gaming",
  airconditioners: "air-conditioners",
};

const SOURCE_PRIORITY = [
  "redstore",
  "yerevanmobile",
  "mobilecentre",
  "allsell",
  "3dplanet",
  "icentre",
  "ispace",
  "eldorado",
  "zigzag",
  "vesta",
  "vlv",
  "vega",
];

function extractItemKey(bucket, item) {
  switch (bucket) {
    case "macbooks":
      return extractModelCode(item.name);
    case "tvs":
      return extractTvModelCode(item.name);
    case "dyson":
      return extractDysonKey(item.name);
    case "gaming":
      return normalizeGamingName(item.name);
    case "airconditioners":
      return extractACCode(item.name);
    default: {
      const groups = groupByNormalizedName([item]);
      const keys = Array.from(groups.keys());
      return keys[0] || normalizeName(item.name);
    }
  }
}

function detectBucket(name) {
  if (MACBOOK_REGEX.test(name)) return "macbooks";
  if (TV_REGEX.test(name)) return "tvs";
  if (DYSON_REGEX.test(name)) return "dyson";
  if (GAMING_REGEX.test(name)) return "gaming";
  if (AC_REGEX.test(name)) return "airconditioners";
  return detectCategory(name); // phones/tablets/watches/headphones/speakers
}

// ── Load input (single file or a cache/ folder, same shapes migrate.js accepts) ──
function loadRaw(inputPath) {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);
  let raw = [];

  function readOne(filePath) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.products)) {
      return parsed.products.map((p) => ({ source: parsed.source, ...p }));
    }
    return null;
  }

  if (stat.isDirectory()) {
    const files = SOURCE_PRIORITY.map((s) => `${s}.json`).filter((f) =>
      fs.existsSync(path.join(resolved, f)),
    );
    for (const file of files) {
      const items = readOne(path.join(resolved, file));
      if (!items) {
        console.error(`  Skipping ${file}: unrecognized shape.`);
        continue;
      }
      console.log(`  ${file}: ${items.length} listing(s)`);
      raw = raw.concat(items);
    }
  } else {
    const items = readOne(resolved);
    if (!items) {
      console.error("Input JSON must be an array or a {source, products:[...]} object.");
      process.exit(1);
    }
    raw = items;
  }
  return raw;
}

let raw = loadRaw(inputPath);
const missingSource = raw.filter((p) => !p.source);
if (missingSource.length > 0) {
  console.error(`${missingSource.length} object(s) missing "source" — every listing must have one.`);
  process.exit(1);
}

for (const p of raw) {
  if (!p.installment_price) p.installment_price = p.cash_price ?? null;
  if (p.price == null) p.price = p.cash_price ?? null;
}

console.log(`Loaded ${raw.length} listing(s) from ${inputPath}\n`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  const stats = { updated: 0, attachedToExisting: 0, newProduct: 0, skippedNoUrl: 0 };
  try {
    if (!dryRun) await client.query("BEGIN");

    // Cache store lookups (id + is_own_store) for the run.
    const storeRes = await client.query(`SELECT id, name FROM stores`);
    const storeIdByName = Object.fromEntries(storeRes.rows.map((r) => [r.name, r.id]));

    const categoryRes = await client.query(`SELECT id, slug FROM categories`);
    const categoryIdBySlug = Object.fromEntries(categoryRes.rows.map((r) => [r.slug, r.id]));

    for (const item of raw) {
      const storeId = storeIdByName[item.source];
      if (!storeId) {
        console.warn(`  Unknown store "${item.source}" — skipping listing "${item.name}". Add it to stores first.`);
        continue;
      }

      // ── Case 1: existing listing (matched by store + url, or store + raw_title) — just an update ──
      let existingListing = null;
      if (item.url) {
        const existing = await client.query(
          `SELECT id, product_id, cash_price, price, installment_price, raw_title FROM store_listings WHERE store_id = $1 AND url = $2`,
          [storeId, item.url],
        );
        if (existing.rows.length > 0) existingListing = existing.rows[0];
      }
      if (!existingListing) {
        const existingByName = await client.query(
          `SELECT id, product_id, cash_price, price, installment_price, raw_title FROM store_listings WHERE store_id = $1 AND raw_title = $2`,
          [storeId, item.name],
        );
        if (existingByName.rows.length > 0) existingListing = existingByName.rows[0];
      }

      if (existingListing) {
        const listing = existingListing;
        if (!dryRun) {
          await client.query(
            `UPDATE store_listings
             SET raw_title = $1, url = COALESCE($2, url), price = $3, cash_price = $4,
                 installment_price = $5, installation_price = $6, status = 'active',
                 last_seen_at = now(), last_checked_at = now(), updated_at = now()
             WHERE id = $7`,
            [item.name, item.url ?? null, item.price, item.cash_price, item.installment_price, item.installation_price ?? null, listing.id],
          );
          if (
            Number(listing.cash_price) !== Number(item.cash_price) ||
            Number(listing.price) !== Number(item.price) ||
            Number(listing.installment_price) !== Number(item.installment_price)
          ) {
            await client.query(
              `INSERT INTO price_history (store_listing_id, price, cash_price, installment_price)
               VALUES ($1, $2, $3, $4)`,
              [listing.id, item.price, item.cash_price, item.installment_price],
            );
          }
        }
        stats.updated += 1;
        continue;
      }

      // ── Case 2: genuinely new listing — find the right product or create one ──
      const bucket = detectBucket(item.name);
      const categorySlug = CATEGORY_SLUG_MAP[bucket];
      const key = extractItemKey(bucket, item);

      let productId = null;

      if (key) {
        // Does an ACTIVE product in this category already have a listing with this exact key?
        const match = await client.query(
          `SELECT sl.product_id
           FROM store_listings sl
           JOIN products p ON p.id = sl.product_id
           WHERE sl.normalized_key = $1
             AND p.status = 'active'
             AND p.category_id = $2
           LIMIT 1`,
          [key, categoryIdBySlug[categorySlug] ?? null],
        );
        if (match.rows.length > 0) {
          productId = match.rows[0].product_id;
          stats.attachedToExisting += 1;
        }
      }

      if (!productId) {
        if (!dryRun) {
          const newProduct = await client.query(
            `INSERT INTO products (canonical_title, category_id, attributes, status)
             VALUES ($1, $2, '{}'::jsonb, 'active') RETURNING id`,
            [item.name, categoryIdBySlug[categorySlug] ?? null],
          );
          productId = newProduct.rows[0].id;
        }
        stats.newProduct += 1;
      }

      if (!dryRun) {
        const listingRes = await client.query(
          `INSERT INTO store_listings
             (store_id, product_id, raw_title, normalized_title, normalized_key, price, cash_price,
              installment_price, installation_price, url, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
           RETURNING id`,
          [
            storeId,
            productId,
            item.name,
            bucket === "phones" || bucket === "tablets" || bucket === "watches" || bucket === "headphones" || bucket === "speakers"
              ? normalizeName(item.name)
              : null,
            key,
            item.price,
            item.cash_price,
            item.installment_price,
            item.installation_price ?? null,
            item.url ?? null,
          ],
        );
        await client.query(
          `INSERT INTO product_matches (store_listing_id, product_id, match_method, confidence_score, status)
           VALUES ($1, $2, $3, $4, 'confirmed')`,
          [listingRes.rows[0].id, productId, key ? "regex_rule" : "manual", key ? 1.0 : 0.5],
        );
      }
      if (!item.url) stats.skippedNoUrl += 1;
    }

    if (dryRun) {
      console.log("\n--dry-run summary:");
    } else {
      await client.query("COMMIT");
      console.log("\nCommitted. Summary:");
    }
    console.log(`  Updated existing listings: ${stats.updated}`);
    console.log(`  New listings attached to an existing product: ${stats.attachedToExisting}`);
    console.log(`  New listings that became a brand-new product: ${stats.newProduct}`);
    if (stats.skippedNoUrl > 0) {
      console.log(`  (${stats.skippedNoUrl} new listings had no URL — future search/check-url style verification won't work for these until the scraper adds one)`);
    }
  } catch (err) {
    if (!dryRun) await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("process-scrape failed:", err);
  process.exit(1);
});