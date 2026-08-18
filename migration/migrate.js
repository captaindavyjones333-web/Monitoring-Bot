// migrate.js — one-time import of the JSON price-comparison data into
// monitoring_bot (Postgres). Reuses the REAL matching logic from /core
// (categoryDetector.js, normalizer.js, comparator.js, tvModelCode.js,
// dysonModelCode.js, acModelCode.js, gamingNormalizer.js) instead of
// re-deriving it — see product-db-design.md §5/§8 for the reasoning.
//
// Usage:
//   node migrate.js path/to/products.json            (writes to DB)
//   node migrate.js path/to/cache-folder              (reads every *.json file in a folder)
//   node migrate.js path/to/products.json --dry-run   (no DB writes, prints a summary)
//
// products.json must be a flat JSON array of objects shaped like:
//   { "name": "...", "cash_price": 123, "installment_price": 456|null,
//     "installation_price": 789|null, "source": "redstore", "url": "https://..." }

import fs from "node:fs";
import path from "node:path";
try {
  await import("dotenv/config");
} catch {
  // dotenv not installed — fine for --dry-run, or if env vars are set another way
}

import {
  detectCategory,
  MACBOOK_REGEX,
  TV_REGEX,
  GAMING_REGEX,
  AC_REGEX,
  DYSON_REGEX,
} from "../core/categoryDetector.js";
import { normalizeName, groupByNormalizedName } from "../core/normalizer.js";
import { extractTvModelCode } from "../core/tvModelCode.js";
import {
  groupMacbooksByCode,
  groupDysonByKey,
  groupGamingByName,
  groupACsByCode,
} from "../core/comparator.js";

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputPath = args.find((a) => !a.startsWith("--"));

if (!inputPath) {
  console.error("Usage: node migrate.js path/to/products.json [--dry-run]");
  process.exit(1);
}

// ── Category bucket name -> global categories.slug (see fix-categories.sql) ──
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

// Preferred source order for picking a canonical title / display name,
// mirrors comparator.js's SOURCE_LABELS key order.
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

// ── TV grouping WITHOUT the redstore-anchor requirement ───────────────
// groupTvsByCode() in comparator.js only seeds codes from redstore's
// listings, so a TV redstore doesn't carry can never group. This mirrors
// its logic exactly (same extractTvModelCode, same two-pass structure,
// same keep-cheapest-per-source rule) but seeds codes from EVERY source,
// like groupMacbooksByCode/groupDysonByKey/groupACsByCode/groupGamingByName
// already do. See product-db-design.md §5 for why this is intentional.
function groupTvsAllSources(products) {
  const groups = new Map();

  for (const product of products) {
    const code = extractTvModelCode(product.name);
    if (!code) continue;

    if (!groups.has(code)) {
      groups.set(code, { normalized: code, code, sources: {} });
    }
    const group = groups.get(code);
    const existing = group.sources[product.source];
    if (existing) {
      const newCash = product.cash_price ?? Infinity;
      const oldCash = existing.cash_price ?? Infinity;
      if (newCash >= oldCash) continue;
    }
    group.sources[product.source] = {
      name: product.name,
      cash_price: product.cash_price ?? null,
      installment_price: product.installment_price ?? null,
    };
  }

  for (const product of products) {
    if (extractTvModelCode(product.name)) continue; // handled above

    const upperName = product.name.toUpperCase();
    let matchedCode = null;
    for (const code of groups.keys()) {
      if (upperName.includes(code)) {
        matchedCode = code;
        break;
      }
    }
    if (!matchedCode) continue;

    const group = groups.get(matchedCode);
    const existing = group.sources[product.source];
    if (existing) {
      const newCash = product.cash_price ?? Infinity;
      const oldCash = existing.cash_price ?? Infinity;
      if (newCash >= oldCash) continue;
    }
    group.sources[product.source] = {
      name: product.name,
      cash_price: product.cash_price ?? null,
      installment_price: product.installment_price ?? null,
    };
  }

  return groups;
}

// ── Load + normalize input ─────────────────────────────────────────
// inputPath can be a single JSON file OR a directory containing several
// *.json files (e.g. a cache/ folder with redstore.json, vlv.json, ...).
// Every object must already carry its own "source" field.
const resolvedInput = path.resolve(inputPath);
const stat = fs.statSync(resolvedInput);

let raw = [];
if (stat.isDirectory()) {
  const files = SOURCE_PRIORITY.map((s) => `${s}.json`).filter((f) =>
    fs.existsSync(path.join(resolvedInput, f)),
  );
  if (files.length === 0) {
    console.error(`No valid store .json files found in directory: ${resolvedInput}`);
    process.exit(1);
  }
  console.log(`Reading ${files.length} active store JSON file(s) from ${resolvedInput}:`);
  for (const file of files) {
    const filePath = path.join(resolvedInput, file);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));

    let items;
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && Array.isArray(parsed.products)) {
      // Shape: { source, scraped_at, count, products: [...] } — inject
      // the top-level source into each product.
      items = parsed.products.map((p) => ({ source: parsed.source, ...p }));
    } else {
      console.error(
        `  Skipping ${file}: not a JSON array or {source, products:[...]} object.`,
      );
      continue;
    }

    console.log(`  ${file}: ${items.length} listing(s)`);
    raw = raw.concat(items);
  }
} else {
  const parsed = JSON.parse(fs.readFileSync(resolvedInput, "utf8"));
  raw = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.products)
      ? parsed.products.map((p) => ({ source: parsed.source, ...p }))
      : parsed;
}

if (!Array.isArray(raw)) {
  console.error("Input JSON must be a flat array of product objects.");
  process.exit(1);
}
const missingSource = raw.filter((p) => !p.source);
if (missingSource.length > 0) {
  console.error(
    `${missingSource.length} object(s) are missing a "source" field — every listing must have one. First offender: ${JSON.stringify(missingSource[0]).slice(0, 200)}`,
  );
  process.exit(1);
}

// De-duplicate: same (store, url) pair, or same (store, name, cash_price)
// when url is missing, appearing more than once in the input (common if
// a scraper re-visits the same page or the same product is listed twice).
function dedupeKey(p) {
  if (p.url) return `url::${p.source}::${p.url}::${p.name}`;
  return `noturl::${p.source}::${p.name}::${p.cash_price ?? "null"}`;
}
const seenKeys = new Set();
const dedupedRaw = [];
let duplicateCount = 0;
for (const p of raw) {
  const k = dedupeKey(p);
  if (seenKeys.has(k)) {
    duplicateCount += 1;
    continue;
  }
  seenKeys.add(k);
  dedupedRaw.push(p);
}
if (duplicateCount > 0) {
  console.log(
    `Removed ${duplicateCount} duplicate listing(s) (same store+url, or same store+name+price with no url).`,
  );
}
raw = dedupedRaw;

// Business rule confirmed by the user: missing/null/0 installment_price
// is treated as equal to cash_price.
for (const p of raw) {
  if (!p.installment_price) p.installment_price = p.cash_price ?? null;
  if (p.price == null) p.price = p.cash_price ?? null;
}

// ── Reproduce runComparison's exact category routing (comparator.js) ──
const macbookProducts = raw.filter((p) => MACBOOK_REGEX.test(p.name));
const tvProducts = raw.filter(
  (p) => TV_REGEX.test(p.name) && !MACBOOK_REGEX.test(p.name),
);
const dysonProducts = raw.filter(
  (p) =>
    DYSON_REGEX.test(p.name) &&
    !MACBOOK_REGEX.test(p.name) &&
    !TV_REGEX.test(p.name),
);
const gamingProducts = raw.filter(
  (p) =>
    GAMING_REGEX.test(p.name) &&
    !MACBOOK_REGEX.test(p.name) &&
    !TV_REGEX.test(p.name) &&
    !DYSON_REGEX.test(p.name),
);
const acProducts = raw.filter(
  (p) =>
    (AC_REGEX.test(p.name) || p.installation_price !== undefined) &&
    !MACBOOK_REGEX.test(p.name) &&
    !TV_REGEX.test(p.name) &&
    !DYSON_REGEX.test(p.name) &&
    !GAMING_REGEX.test(p.name),
);
const remaining = raw.filter(
  (p) =>
    !MACBOOK_REGEX.test(p.name) &&
    !TV_REGEX.test(p.name) &&
    !DYSON_REGEX.test(p.name) &&
    !GAMING_REGEX.test(p.name) &&
    !(AC_REGEX.test(p.name) || p.installation_price !== undefined),
);

const byCategory = {
  phones: [],
  tablets: [],
  watches: [],
  headphones: [],
  speakers: [],
};
for (const p of remaining) {
  const cat = detectCategory(p.name);
  (byCategory[cat] || byCategory.phones).push(p);
}

// ── Build { categoryBucket, groups: Map<key, {sources}> }[] ─────────
const bucketResults = [];

for (const [cat, products] of Object.entries(byCategory)) {
  bucketResults.push({ bucket: cat, groups: groupByNormalizedName(products) });
}
bucketResults.push({
  bucket: "macbooks",
  groups: groupMacbooksByCode(macbookProducts),
});
bucketResults.push({ bucket: "tvs", groups: groupTvsAllSources(tvProducts) });
bucketResults.push({ bucket: "dyson", groups: groupDysonByKey(dysonProducts) });
bucketResults.push({
  bucket: "gaming",
  groups: groupGamingByName(gamingProducts),
});
bucketResults.push({
  bucket: "airconditioners",
  groups: groupACsByCode(acProducts),
});

// ── Enrichment lookup: recover url / installation_price / full raw record ──
// The grouping functions only copy {name, cash_price, installment_price[,
// installation_price]} into group.sources — url isn't propagated. Since
// group.sources[source].name is copied verbatim from the original record,
// we can look the original back up by (source, name, cash_price).
const rawLookup = new Map();
for (const p of raw) {
  rawLookup.set(`${p.source}::${p.name}::${p.cash_price ?? "null"}`, p);
  // Fallback key without price, in case of price-changed re-lookups.
  if (!rawLookup.has(`${p.source}::${p.name}`)) {
    rawLookup.set(`${p.source}::${p.name}`, p);
  }
}
function findOriginal(source, name, cashPrice) {
  return (
    rawLookup.get(`${source}::${name}::${cashPrice ?? "null"}`) ??
    rawLookup.get(`${source}::${name}`) ??
    null
  );
}

// ── Flatten into products + store_listings rows ─────────────────────
const productsToInsert = [];
const listingsToInsert = [];

let groupCounter = 0;
for (const { bucket, groups } of bucketResults) {
  const categorySlug = CATEGORY_SLUG_MAP[bucket];

  for (const [key, group] of groups) {
    const sourceKeys = Object.keys(group.sources);
    if (sourceKeys.length === 0) continue;

    // Pick canonical title: prefer redstore, else first available in SOURCE_PRIORITY order.
    let canonicalSource =
      SOURCE_PRIORITY.find((s) => group.sources[s]) ?? sourceKeys[0];
    const canonicalTitle = group.sources[canonicalSource].name;

    groupCounter += 1;
    const productRef = {
      tempId: `p${groupCounter}`,
      canonical_title: canonicalTitle,
      category_slug: categorySlug,
      normalized_key: key,
    };
    productsToInsert.push(productRef);

    for (const source of sourceKeys) {
      const entry = group.sources[source];
      const original = findOriginal(source, entry.name, entry.cash_price);

      listingsToInsert.push({
        product_temp_id: productRef.tempId,
        store_slug: source,
        raw_title: entry.name,
        normalized_title:
          bucket === "phones" ||
          bucket === "tablets" ||
          bucket === "watches" ||
          bucket === "headphones" ||
          bucket === "speakers"
            ? normalizeName(entry.name)
            : null,
        normalized_key: key,
        price: original?.price ?? entry.cash_price ?? null,
        cash_price: entry.cash_price ?? null,
        installment_price: entry.installment_price ?? null,
        installation_price:
          entry.installation_price ?? original?.installation_price ?? null,
        url: original?.url ?? null,
      });
    }
  }
}

// ── Summary (always printed) ─────────────────────────────────────────
console.log(`Loaded ${raw.length} raw listings from ${inputPath}`);
console.log(`Category bucket sizes (pre-grouping):`);
console.log(
  `  macbooks: ${macbookProducts.length}, tvs: ${tvProducts.length}, dyson: ${dysonProducts.length}, gaming: ${gamingProducts.length}, ac: ${acProducts.length}`,
);
for (const [cat, products] of Object.entries(byCategory)) {
  console.log(`  ${cat}: ${products.length}`);
}
console.log(`\nResulting canonical products: ${productsToInsert.length}`);
console.log(`Resulting store listings: ${listingsToInsert.length}`);
console.log(`\nSample groups:`);
for (const p of productsToInsert.slice(0, 8)) {
  const listings = listingsToInsert.filter(
    (l) => l.product_temp_id === p.tempId,
  );
  console.log(
    `  [${p.category_slug}] "${p.canonical_title}" (key: ${p.normalized_key}) -- ${listings.length} store(s): ${listings.map((l) => l.store_slug).join(", ")}`,
  );
}

if (dryRun) {
  console.log("\n--dry-run: no database writes performed.");
  process.exit(0);
}

// ── Database writes ──────────────────────────────────────────────────
const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 0. Truncate previous data to start with clean records
    console.log("Cleaning previous products, store listings, matches, candidates, and logs...");
    await client.query(
      `TRUNCATE product_matches, price_history, product_merge_candidates, audit_log, store_listings, products CASCADE;`,
    );

    // Update unique index on store_listings to allow multiple variants on same URL
    await client.query(`DROP INDEX IF EXISTS uq_store_listings_url;`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_store_listings_store_url_raw_title
      ON store_listings (store_id, url, raw_title) WHERE url IS NOT NULL;
    `);

    // 1. Ensure all stores exist
    const storeIdBySlug = {};
    for (const slug of SOURCE_PRIORITY) {
      const res = await client.query(
        `INSERT INTO stores (name, is_own_store)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [slug, slug === "redstore"],
      );
      storeIdBySlug[slug] = res.rows[0].id;
    }

    // 2. Look up category ids
    const categoryIdBySlug = {};
    const catRes = await client.query(`SELECT id, slug FROM categories`);
    for (const row of catRes.rows) categoryIdBySlug[row.slug] = row.id;

    // 3. Insert products + store_listings + product_matches
    let inserted = 0;
    for (const p of productsToInsert) {
      const categoryId = categoryIdBySlug[p.category_slug] ?? null;

      const productRes = await client.query(
        `INSERT INTO products (canonical_title, category_id, attributes)
         VALUES ($1, $2, '{}'::jsonb)
         RETURNING id`,
        [p.canonical_title, categoryId],
      );
      const productId = productRes.rows[0].id;

      const listings = listingsToInsert.filter(
        (l) => l.product_temp_id === p.tempId,
      );
      for (const l of listings) {
        const storeId = storeIdBySlug[l.store_slug];
        if (!storeId) continue; // unknown source in the data, skip rather than crash

        const listingRes = await client.query(
          `INSERT INTO store_listings
             (store_id, product_id, raw_title, normalized_title, normalized_key,
              price, cash_price, installment_price, installation_price, url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (store_id, url, raw_title) WHERE url IS NOT NULL DO NOTHING
           RETURNING id`,
          [
            storeId,
            productId,
            l.raw_title,
            l.normalized_title,
            l.normalized_key,
            l.price,
            l.cash_price,
            l.installment_price,
            l.installation_price,
            l.url,
          ],
        );

        if (listingRes.rows.length === 0) {
          // A row with this (store, url) already exists — skip rather than
          // fail the whole transaction. This shouldn't normally trigger
          // (the dedup pass above should catch it first), so it's worth
          // investigating if this prints often.
          console.warn(
            `  Skipped duplicate (store=${l.store_slug}, url=${l.url}) — already inserted.`,
          );
          continue;
        }
        const listingId = listingRes.rows[0].id;

        await client.query(
          `INSERT INTO product_matches
             (store_listing_id, product_id, match_method, confidence_score, status)
           VALUES ($1,$2,'regex_rule',1.0,'confirmed')`,
          [listingId, productId],
        );
      }
      inserted += 1;
    }

    await client.query("COMMIT");
    console.log(
      `\nInserted ${inserted} products and ${listingsToInsert.length} store listings into monitoring_bot.`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
