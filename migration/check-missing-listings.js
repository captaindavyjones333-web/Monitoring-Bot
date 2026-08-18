// check-missing-listings.js — for every store covered by a fresh scrape,
// finds listings that WERE active but did NOT appear in this batch, and
// automatically checks whether they still exist by fetching their stored
// URL — instead of assuming they were removed just because a store's
// category page stopped showing them (the original problem this whole
// system exists to solve).
//
// Run this AFTER process-scrape.js, on the same scrape file/folder.
//
// Usage:
//   node check-missing-listings.js path/to/scrape.json
//   node check-missing-listings.js path/to/cache-folder --dry-run
//
// IMPORTANT CAVEAT: price extraction from the fetched page is BEST-EFFORT
// generic parsing (JSON-LD structured data, then OpenGraph/product meta
// tags, then a regex fallback for "<number> ֏" in the raw HTML). It does
// NOT run a headless browser, so any store whose price is rendered
// client-side by JavaScript (no server-rendered HTML, no structured
// data) will fail extraction even though the page genuinely still
// exists. Test this against a real listing from each of your stores
// before trusting it — if a store consistently fails extraction, that
// store needs a Puppeteer-based check instead (see the
// PER_STORE_CHECKERS extension point below), which I can't write blind
// since it depends on that store's specific page structure.

import fs from "node:fs";
import path from "node:path";
try {
  await import("dotenv/config");
} catch {}
import pg from "pg";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputPath = args.find((a) => !a.startsWith("--"));

if (!inputPath) {
  console.error("Usage: node check-missing-listings.js path/to/scrape.json-or-folder [--dry-run]");
  process.exit(1);
}

// After this many consecutive "not found" checks across separate scrape
// cycles, a listing flips from missing_from_category to removed. A
// single failed check never marks something removed — see design doc §4.
const REMOVE_AFTER_CONSECUTIVE_MISSES = 3;

// ── Extension point: per-store custom checkers ───────────────────────
// If the generic fetch+parse below fails for a given store (e.g. its
// prices only render via client-side JS), add a function here that uses
// your existing Puppeteer scraping logic for a single product page
// instead. Falls back to the generic checker for any store not listed.
//
// Example shape:
//   PER_STORE_CHECKERS.somestore = async (url) => {
//     const html = await scrapeWithPuppeteer(url); // your existing logic
//     return extractPriceFromHtml(html);
//   };
const PER_STORE_CHECKERS = {};

// ── Generic price extraction ──────────────────────────────────────────
function parsePriceNumber(raw) {
  const cleaned = String(raw).replace(/[,\s]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function findPriceInJsonLd(node) {
  if (node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPriceInJsonLd(item);
      if (found != null) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    if (node.price != null) {
      const num = parsePriceNumber(node.price);
      if (num != null) return num;
    }
    if (node.offers) {
      const found = findPriceInJsonLd(node.offers);
      if (found != null) return found;
    }
    for (const key of Object.keys(node)) {
      if (key === "price" || key === "offers") continue;
      const found = findPriceInJsonLd(node[key]);
      if (found != null) return found;
    }
  }
  return null;
}

function extractPriceFromHtml(html) {
  // 1. JSON-LD structured data (most reliable when present)
  const ldJsonBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldJsonBlocks) {
    const jsonMatch = block.match(/>([\s\S]*?)<\/script>/i);
    if (!jsonMatch) continue;
    try {
      const data = JSON.parse(jsonMatch[1]);
      const price = findPriceInJsonLd(data);
      if (price != null) return { price, method: "json-ld" };
    } catch {
      // malformed JSON-LD — skip this block
    }
  }

  // 2. OpenGraph / product meta tags
  const metaPatterns = [
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([\d.,\s]+)["']/i,
    /<meta[^>]+content=["']([\d.,\s]+)["'][^>]+property=["']product:price:amount["']/i,
    /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([\d.,\s]+)["']/i,
  ];
  for (const re of metaPatterns) {
    const m = html.match(re);
    if (m) {
      const num = parsePriceNumber(m[1]);
      if (num != null) return { price: num, method: "meta-tag" };
    }
  }

  // 3. Fallback — Armenian Dram symbol directly in visible page text
  const dramMatch = html.match(/([\d][\d,.\s]{2,10}[\d])\s*֏/) || html.match(/֏\s*([\d][\d,.\s]{2,10}[\d])/);
  if (dramMatch) {
    const num = parsePriceNumber(dramMatch[1]);
    if (num != null) return { price: num, method: "dram-regex-fallback" };
  }

  return null;
}

async function checkListing(storeSlug, url) {
  const checker = PER_STORE_CHECKERS[storeSlug];
  if (checker) return checker(url);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) {
      return { notFound: true };
    }
    if (!response.ok) {
      return { inconclusive: true, reason: `HTTP ${response.status}` };
    }
    const html = await response.text();
    const extracted = extractPriceFromHtml(html);
    if (extracted) {
      return { found: true, price: extracted.price, method: extracted.method };
    }
    return { inconclusive: true, reason: "page loaded but no price could be extracted" };
  } catch (err) {
    return { inconclusive: true, reason: err.message };
  }
}

// ── Load input (same shapes as migrate.js / process-scrape.js) ────────
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
    const files = fs.readdirSync(resolved).filter((f) => f.toLowerCase().endsWith(".json"));
    for (const file of files) {
      const items = readOne(path.join(resolved, file));
      if (!items) continue;
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

const raw = loadRaw(inputPath);
console.log(`Loaded ${raw.length} listing(s) from ${inputPath} to determine what's currently visible.\n`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    // URLs seen in this batch, grouped by store.
    const seenUrlsByStore = new Map(); // storeName -> Set<url>
    for (const item of raw) {
      if (!item.source || !item.url) continue;
      if (!seenUrlsByStore.has(item.source)) seenUrlsByStore.set(item.source, new Set());
      seenUrlsByStore.get(item.source).add(item.url);
    }

    const storesInBatch = [...seenUrlsByStore.keys()];
    console.log(`Stores covered by this batch: ${storesInBatch.join(", ")}\n`);

    const storeRes = await client.query(
      `SELECT id, name FROM stores WHERE name = ANY($1::text[])`,
      [storesInBatch],
    );

    let totalMissing = 0;
    let stillActive = 0;
    let nowRemoved = 0;
    let inconclusive = 0;
    let stillMissing = 0;

    for (const store of storeRes.rows) {
      const seenUrls = seenUrlsByStore.get(store.name) ?? new Set();

      const candidates = await client.query(
        `SELECT id, url, raw_title, status, search_attempts
         FROM store_listings
         WHERE store_id = $1 AND status IN ('active', 'missing_from_category') AND url IS NOT NULL`,
        [store.id],
      );

      const missing = candidates.rows.filter((row) => !seenUrls.has(row.url));
      totalMissing += missing.length;

      console.log(`${store.name}: ${missing.length} listing(s) not seen in this batch, checking URLs...`);

      for (const listing of missing) {
        const result = await checkListing(store.name, listing.url);

        if (result.found) {
          stillActive += 1;
          console.log(`  ACTIVE (via ${result.method}, price ${result.price}) — ${listing.raw_title}`);
          if (!dryRun) {
            await client.query(
              `UPDATE store_listings
               SET status = 'active', cash_price = $1, price = $1, in_category = false,
                   search_attempts = 0, last_seen_at = now(), last_checked_at = now(), updated_at = now()
               WHERE id = $2`,
              [result.price, listing.id],
            );
            await client.query(
              `INSERT INTO price_history (store_listing_id, price, cash_price)
               VALUES ($1, $2, $2)`,
              [listing.id, result.price],
            );
          }
          continue;
        }

        if (result.notFound) {
          const nextAttempts = (listing.search_attempts ?? 0) + 1;
          if (nextAttempts >= REMOVE_AFTER_CONSECUTIVE_MISSES) {
            nowRemoved += 1;
            console.log(`  REMOVED (404, ${nextAttempts} consecutive misses) — ${listing.raw_title}`);
            if (!dryRun) {
              await client.query(
                `UPDATE store_listings SET status = 'removed', search_attempts = $1, last_checked_at = now(), updated_at = now() WHERE id = $2`,
                [nextAttempts, listing.id],
              );
            }
          } else {
            stillMissing += 1;
            console.log(`  still missing (404, attempt ${nextAttempts}/${REMOVE_AFTER_CONSECUTIVE_MISSES}) — ${listing.raw_title}`);
            if (!dryRun) {
              await client.query(
                `UPDATE store_listings SET status = 'missing_from_category', search_attempts = $1, last_checked_at = now(), updated_at = now() WHERE id = $2`,
                [nextAttempts, listing.id],
              );
            }
          }
          continue;
        }

        // Inconclusive (network error, non-404 non-200, or page loaded
        // but no price found): don't increment the removal counter —
        // we genuinely don't know, so don't risk a false "removed".
        inconclusive += 1;
        console.log(`  INCONCLUSIVE (${result.reason}) — ${listing.raw_title} — ${listing.url}`);
        if (!dryRun) {
          await client.query(
            `UPDATE store_listings SET status = 'missing_from_category', last_checked_at = now(), updated_at = now() WHERE id = $1`,
            [listing.id],
          );
        }
      }
    }

    console.log(`\n${dryRun ? "Would update" : "Updated"}:`);
    console.log(`  Total checked: ${totalMissing}`);
    console.log(`  Confirmed still active: ${stillActive}`);
    console.log(`  Still missing (under retry threshold): ${stillMissing}`);
    console.log(`  Marked removed (${REMOVE_AFTER_CONSECUTIVE_MISSES}+ consecutive misses): ${nowRemoved}`);
    console.log(`  Inconclusive (needs manual check in the panel): ${inconclusive}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("check-missing-listings failed:", err);
  process.exit(1);
});