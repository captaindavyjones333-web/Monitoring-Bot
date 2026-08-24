// fuzzy-match.js — scans products for likely duplicates and populates
// the review queue (product_merge_candidates).
//
// TRUE reuse this time: earlier versions called normalizeName() alone
// (just the base text-cleanup step) and compared strings — that's an
// APPROXIMATION of your matcher, not the matcher itself, and it's what
// caused 128GB and 256GB products to merge (the base step doesn't carry
// the same resolver logic groupByNormalizedName applies on top).
//
// This version does the real thing: takes every active product's
// canonical_title per category, reshapes it into the exact {name,
// source, cash_price, installment_price} shape your group*() functions
// expect (using each product's id AS the "source" field), and calls the
// SAME grouping function migrate.js/runComparison use. Any group that
// ends up containing 2+ DIFFERENT product ids is a real signal: your
// actual matcher — not an approximation of it — thinks they're the same
// product.
//
// Usage:
//   node fuzzy-match.js                 (writes suggestions to the DB)
//   node fuzzy-match.js --dry-run       (prints what it would insert)

import "dotenv/config";
import pg from "pg";

import { groupByNormalizedName } from "../core/normalizer.js";
import {
  groupMacbooksByCode,
  groupDysonByKey,
  groupGamingByName,
  groupACsByCode,
} from "../core/comparator.js";
import { extractTvModelCode } from "../core/tvModelCode.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Same RS-anchor-free TV grouping used in migrate.js (groupTvsByCode in
// comparator.js only seeds codes from redstore — see product-db-design.md
// §5 for why that's intentionally not replicated here).
function groupTvsAllSources(products) {
  const groups = new Map();
  for (const product of products) {
    const code = extractTvModelCode(product.name);
    if (!code) continue;
    if (!groups.has(code)) groups.set(code, { normalized: code, code, sources: {} });
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

function groupForCategory(categorySlug, syntheticItems) {
  switch (categorySlug) {
    case "macbooks":
      return groupMacbooksByCode(syntheticItems);
    case "tvs":
      return groupTvsAllSources(syntheticItems);
    case "dyson":
      return groupDysonByKey(syntheticItems);
    case "gaming":
      return groupGamingByName(syntheticItems);
    case "air-conditioners":
      return groupACsByCode(syntheticItems);
    default:
      // phones, tablets, watches, headphones, speakers
      return groupByNormalizedName(syntheticItems);
  }
}

async function run() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT p.id, p.canonical_title, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'active'`,
    );
    console.log(`Loaded ${result.rows.length} active product(s).`);

    const byCategory = new Map(); // slug -> [{id, canonical_title}]
    let noCategoryCount = 0;
    for (const p of result.rows) {
      if (!p.category_slug) {
        noCategoryCount += 1;
        continue;
      }
      if (!byCategory.has(p.category_slug)) byCategory.set(p.category_slug, []);
      byCategory.get(p.category_slug).push(p);
    }
    if (noCategoryCount > 0) console.log(`${noCategoryCount} product(s) have no category — skipped.`);

    const candidatePairs = [];

    for (const [categorySlug, products] of byCategory) {
      // Reshape into exactly what the real group*() functions expect —
      // product.id doubles as the "source" field so we can read which
      // products landed together afterward.
      const syntheticItems = products.map((p) => ({
        name: p.canonical_title,
        source: p.id,
        cash_price: null,
        installment_price: null,
      }));

      const groups = groupForCategory(categorySlug, syntheticItems);

      for (const [key, group] of groups) {
        const productIds = Object.keys(group.sources);
        if (productIds.length < 2) continue; // only one product in this group — nothing to suggest
        for (let i = 0; i < productIds.length; i++) {
          for (let j = i + 1; j < productIds.length; j++) {
            candidatePairs.push({ productAId: productIds[i], productBId: productIds[j], categorySlug, key });
          }
        }
      }
    }

    console.log(`\nFound ${candidatePairs.length} candidate pair(s) via the real grouping functions:`);
    const titleById = new Map(result.rows.map((p) => [p.id, p.canonical_title]));
    for (const pair of candidatePairs.slice(0, 30)) {
      console.log(`  [${pair.categorySlug} / key: ${pair.key}] "${titleById.get(pair.productAId)}"  <->  "${titleById.get(pair.productBId)}"`);
    }
    if (candidatePairs.length > 30) console.log(`  ... and ${candidatePairs.length - 30} more`);

    if (dryRun) {
      console.log("\n--dry-run: no database writes performed.");
      return;
    }

    let inserted = 0;
    for (const pair of candidatePairs) {
      await client.query(
        `INSERT INTO product_merge_candidates (product_a_id, product_b_id, confidence_score, status)
         VALUES ($1, $2, 0.95, 'suggested')
         ON CONFLICT (product_a_id, product_b_id) DO NOTHING`,
        [pair.productAId, pair.productBId],
      );
      inserted += 1;
    }
    console.log(`\nInserted ${inserted} suggestion(s) into product_merge_candidates.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Fuzzy match pass failed:", err);
  process.exit(1);
});