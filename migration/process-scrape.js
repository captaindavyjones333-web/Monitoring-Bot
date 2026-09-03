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

import {
  detectCategory,
  MACBOOK_REGEX,
  TV_REGEX,
  GAMING_REGEX,
  AC_REGEX,
  DYSON_REGEX,
} from "../core/categoryDetector.js";
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
  console.error(
    "Usage: node process-scrape.js path/to/scrape.json-or-folder [--dry-run]",
  );
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
  camera: "camera",
  cleaners: "cleaners",
  printers: "printers",
  projectors: "projectors",
  drones: "drones",
  monitors: "monitors",
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
  "notebookcentre",
  "dgcomp",
  "notebookmall",
  "smartbox",
  "miarmenia"
];

// ── Batch grouping functions matching migrate.js / comparator.js ──

function groupTvsAllSources(products) {
  const groups = new Map();
  for (const product of products) {
    const code = extractTvModelCode(product.name);
    if (!code) continue;
    if (!groups.has(code))
      groups.set(code, { normalized: code, code, sources: {} });
    groups.get(code).sources[product.source] = product;
  }
  for (const product of products) {
    if (extractTvModelCode(product.name)) continue;
    const upperName = product.name.toUpperCase();
    let matchedCode = null;
    for (const code of groups.keys()) {
      if (upperName.includes(code)) {
        matchedCode = code;
        break;
      }
    }
    if (!matchedCode) continue;
    groups.get(matchedCode).sources[product.source] = product;
  }
  return groups;
}

function assignBatchKeys(rawItems) {
  const macbookProducts = [];
  const tvProducts = [];
  const dysonProducts = [];
  const gamingProducts = [];
  const acProducts = [];
  const byCategory = {
    phones: [],
    tablets: [],
    watches: [],
    headphones: [],
    speakers: [],
    camera: [],
    cleaners: [],
    printers: [],
    projectors: [],
    drones: [],
    monitors: [],
  };

  for (const p of rawItems) {
    const bucket = detectBucket(p.name, p.category);
    if (bucket === "macbooks") {
      macbookProducts.push(p);
    } else if (bucket === "tvs") {
      tvProducts.push(p);
    } else if (bucket === "dyson") {
      dysonProducts.push(p);
    } else if (bucket === "gaming") {
      gamingProducts.push(p);
    } else if (bucket === "airconditioners") {
      acProducts.push(p);
    } else if (byCategory[bucket]) {
      byCategory[bucket].push(p);
    } else {
      byCategory.phones.push(p);
    }
  }

  // Pre-calculate normalized keys using batch grouping
  for (const [cat, products] of Object.entries(byCategory)) {
    const groups = groupByNormalizedName(products);
    for (const [key, group] of groups) {
      for (const src of Object.keys(group.sources)) {
        const item = group.sources[src];
        if (item) item._assignedKey = key;
      }
    }
  }

  const tvGroups = groupTvsAllSources(tvProducts);
  for (const [key, group] of tvGroups) {
    for (const src of Object.keys(group.sources)) {
      const item = group.sources[src];
      if (item) item._assignedKey = key;
    }
  }

  for (const p of macbookProducts) p._assignedKey = extractModelCode(p.name);
  for (const p of dysonProducts) p._assignedKey = extractDysonKey(p.name);
  for (const p of gamingProducts) p._assignedKey = normalizeGamingName(p.name);
  for (const p of acProducts) p._assignedKey = extractACCode(p.name);

  for (const p of rawItems) {
    if (!p._assignedKey) {
      p._assignedKey = normalizeName(p.name);
    }
  }
}

function extractItemKey(bucket, item) {
  return item._assignedKey || normalizeName(item.name);
}

function detectBucket(name, scraperCategory) {
  // Prefer the category provided directly by the scraper (if present and
  // recognised) over regex-based detection — this is more reliable because
  // each scraper file already knows which category it represents.
  if (scraperCategory && CATEGORY_SLUG_MAP[scraperCategory])
    return scraperCategory;
  if (MACBOOK_REGEX.test(name)) return "macbooks";
  if (TV_REGEX.test(name)) return "tvs";
  if (DYSON_REGEX.test(name)) return "dyson";
  if (GAMING_REGEX.test(name)) return "gaming";
  if (AC_REGEX.test(name)) return "airconditioners";
  return detectCategory(name);
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
      console.error(
        "Input JSON must be an array or a {source, products:[...]} object.",
      );
      process.exit(1);
    }
    raw = items;
  }
  return raw;
}

let raw = loadRaw(inputPath);
const missingSource = raw.filter((p) => !p.source);
if (missingSource.length > 0) {
  console.error(
    `${missingSource.length} object(s) missing "source" — every listing must have one.`,
  );
  process.exit(1);
}

for (const p of raw) {
  if (p.source === "notebookcentre" || p.source === "notebookcentre.am") {
    p.installment_price = null;
  } else if (!p.installment_price) {
    p.installment_price = p.cash_price ?? null;
  }
  if (p.price == null) p.price = p.cash_price ?? null;
}

// Sanitize prices — NUMERIC(12,2) max is 9,999,999,999.99.
// Some scrapers (e.g. vesta) concatenate two price values into one number.
// Null out anything that would overflow rather than crashing the whole run.
const MAX_PRICE = 9_999_999_999.99;
for (const p of raw) {
  for (const field of [
    "price",
    "cash_price",
    "installment_price",
    "installation_price",
  ]) {
    if (p[field] != null && Math.abs(Number(p[field])) > MAX_PRICE) {
      console.warn(
        `  [${p.source}] "${p.name}" — ${field} value ${p[field]} overflows NUMERIC(12,2), setting to null.`,
      );
      p[field] = null;
    }
  }
  // Re-sync price from cash_price if it was just nulled
  if (p.price == null && p.cash_price != null) p.price = p.cash_price;
}

// Deduplicate by (source, url, name) — scrape files sometimes contain the same
// listing more than once, which would cause a unique-constraint violation on INSERT.
{
  const seen = new Set();
  const deduped = [];
  for (const item of raw) {
    const key = `${item.source}||${item.url ?? ""}||${item.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }
  if (deduped.length < raw.length) {
    console.warn(
      `  Deduplicated ${raw.length - deduped.length} duplicate listing(s) from input.`,
    );
  }
  raw = deduped;
}

assignBatchKeys(raw);

console.log(`Loaded ${raw.length} listing(s) from ${inputPath}\n`);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  const stats = {
    updated: 0,
    attachedToExisting: 0,
    newProduct: 0,
    skippedNoUrl: 0,
  };
  try {
    if (!dryRun) await client.query("BEGIN");

    // Cache store lookups (id + is_own_store) for the run.
    const storeRes = await client.query(`SELECT id, name FROM stores`);
    const storeIdByName = Object.fromEntries(
      storeRes.rows.map((r) => [r.name, r.id]),
    );

    const categoryRes = await client.query(`SELECT id, slug FROM categories`);
    const categoryIdBySlug = Object.fromEntries(
      categoryRes.rows.map((r) => [r.slug, r.id]),
    );

    for (const item of raw) {
      const storeId = storeIdByName[item.source];
      if (!storeId) {
        console.warn(
          `  Unknown store "${item.source}" — skipping listing "${item.name}". Add it to stores first.`,
        );
        continue;
      }

      // ── Case 1: existing listing — match by (store + url + title) or (store + title) ──
      // We intentionally match on title too: same URL with a different title is a
      // different variant (e.g. 64 GB vs 128 GB) and must be a separate row, not an
      // overwrite — which would cause a unique-constraint violation.
      let existingListing = null;
      if (item.url) {
        const existing = await client.query(
          `SELECT id, product_id, cash_price, price, installment_price, raw_title
           FROM store_listings WHERE store_id = $1 AND url = $2 AND raw_title = $3`,
          [storeId, item.url, item.name],
        );
        if (existing.rows.length > 0) existingListing = existing.rows[0];
      }
      if (!existingListing) {
        const existingByName = await client.query(
          `SELECT id, product_id, cash_price, price, installment_price, raw_title
           FROM store_listings WHERE store_id = $1 AND raw_title = $2`,
          [storeId, item.name],
        );
        if (existingByName.rows.length > 0)
          existingListing = existingByName.rows[0];
      }

      if (existingListing) {
        const listing = existingListing;
        const bucket = detectBucket(item.name, item.category);
        const categorySlug = CATEGORY_SLUG_MAP[bucket];
        const key = extractItemKey(bucket, item);
        const categoryId = categoryIdBySlug[categorySlug] ?? null;

        if (!dryRun) {
          await client.query(
            `UPDATE store_listings
             SET url = COALESCE($1, url), price = $2, cash_price = $3,
                 installment_price = $4, installation_price = $5,
                 normalized_key = $6,
                 normalized_title = $7,
                 status = 'active',
                 last_seen_at = now(), last_checked_at = now(), updated_at = now()
             WHERE id = $8`,
            [
              item.url ?? null,
              item.price,
              item.cash_price,
              item.installment_price,
              item.installation_price ?? null,
              key,
              bucket === "phones" ||
              bucket === "tablets" ||
              bucket === "watches" ||
              bucket === "headphones" ||
              bucket === "speakers"
                ? normalizeName(item.name)
                : null,
              listing.id,
            ],
          );

          if (categoryId && listing.product_id) {
            await client.query(
              `UPDATE products SET category_id = $1 WHERE id = $2 AND category_id IS NULL`,
              [categoryId, listing.product_id],
            );
          }

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
      const bucket = detectBucket(item.name, item.category);
      const categorySlug = CATEGORY_SLUG_MAP[bucket];
      const key = extractItemKey(bucket, item);

      let productId = null;

      if (key) {
        // Does an ACTIVE product in this category already have a listing with this exact key,
        // AND was NOT explicitly rejected/unmatched by an admin?
        const match = await client.query(
          `SELECT sl.product_id
           FROM store_listings sl
           JOIN products p ON p.id = sl.product_id
           WHERE sl.normalized_key = $1
             AND p.status = 'active'
             AND p.category_id = $2
             AND NOT EXISTS (
               SELECT 1 FROM rejected_matches rm
               WHERE rm.product_id = p.id
                 AND rm.store_id = $3
                 AND (
                   (rm.url IS NOT NULL AND $4::text IS NOT NULL AND rm.url = $4::text)
                   OR (rm.raw_title IS NOT NULL AND rm.raw_title = $5::text)
                 )
             )
           LIMIT 1`,
          [key, categoryIdBySlug[categorySlug] ?? null, storeId, item.url ?? null, item.name],
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
           ON CONFLICT (store_id, url, raw_title) WHERE url IS NOT NULL DO NOTHING
           RETURNING id`,
          [
            storeId,
            productId,
            item.name,
            bucket === "phones" ||
            bucket === "tablets" ||
            bucket === "watches" ||
            bucket === "headphones" ||
            bucket === "speakers"
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
        if (listingRes.rows.length > 0) {
          await client.query(
            `INSERT INTO product_matches (store_listing_id, product_id, match_method, confidence_score, status)
             VALUES ($1, $2, $3, $4, 'confirmed')`,
            [
              listingRes.rows[0].id,
              productId,
              key ? "regex_rule" : "manual",
              key ? 1.0 : 0.5,
            ],
          );
        }
      }
      if (!item.url) stats.skippedNoUrl += 1;
    }

    // ── Bulk Status Synchronization for Missing Listings ─────────────────
    // For each (storeId, categoryId) processed in this scrape batch, any listing currently
    // in the DB with status = 'active' whose URL is NOT in the latest scrape is updated
    // to status = 'missing_from_category'.
    const urlsByStoreAndCategory = new Map();
    for (const item of raw) {
      const storeId = storeIdByName[item.source];
      if (!storeId) continue;
      const bucket = detectBucket(item.name, item.category);
      const categorySlug = CATEGORY_SLUG_MAP[bucket];
      const categoryId = categoryIdBySlug[categorySlug] ?? null;
      if (!categoryId || !item.url) continue;

      const scKey = `${storeId}||${categoryId}`;
      if (!urlsByStoreAndCategory.has(scKey)) {
        urlsByStoreAndCategory.set(scKey, {
          storeId,
          categoryId,
          storeName: item.source,
          categorySlug,
          urls: new Set(),
        });
      }
      urlsByStoreAndCategory.get(scKey).urls.add(item.url);
    }

    let totalMarkedMissing = 0;
    for (const { storeId, categoryId, storeName, categorySlug, urls } of urlsByStoreAndCategory.values()) {
      const urlArray = Array.from(urls);
      if (dryRun) {
        const countRes = await client.query(
          `SELECT COUNT(*) AS count
           FROM store_listings sl
           JOIN products p ON p.id = sl.product_id
           WHERE sl.store_id = $1
             AND p.category_id = $2
             AND sl.status = 'active'
             AND sl.url IS NOT NULL
             AND NOT (sl.url = ANY($3::text[]))`,
          [storeId, categoryId, urlArray],
        );
        const count = Number(countRes.rows[0]?.count || 0);
        if (count > 0) {
          console.log(`  [${storeName} / ${categorySlug}] ${count} active listing(s) would be marked 'missing_from_category'`);
          totalMarkedMissing += count;
        }
      } else {
        const updateRes = await client.query(
          `UPDATE store_listings sl
           SET status = 'missing_from_category',
               in_category = false,
               updated_at = now()
           FROM products p
           WHERE sl.product_id = p.id
             AND sl.store_id = $1
             AND p.category_id = $2
             AND sl.status = 'active'
             AND sl.url IS NOT NULL
             AND NOT (sl.url = ANY($3::text[]))
           RETURNING sl.id`,
          [storeId, categoryId, urlArray],
        );
        const count = updateRes.rowCount || 0;
        if (count > 0) {
          console.log(`  [${storeName} / ${categorySlug}] ${count} active listing(s) marked 'missing_from_category'`);
          totalMarkedMissing += count;
        }
      }
    }

    if (dryRun) {
      console.log("\n--dry-run summary:");
    } else {
      await client.query("COMMIT");
      console.log("\nCommitted. Summary:");
    }
    console.log(`  Updated existing listings: ${stats.updated}`);
    console.log(
      `  New listings attached to an existing product: ${stats.attachedToExisting}`,
    );
    console.log(
      `  New listings that became a brand-new product: ${stats.newProduct}`,
    );
    console.log(
      `  Listings transitioned to missing_from_category: ${totalMarkedMissing}`,
    );
    if (stats.skippedNoUrl > 0) {
      console.log(
        `  (${stats.skippedNoUrl} new listings had no URL — future search/check-url style verification won't work for these until the scraper adds one)`,
      );
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
