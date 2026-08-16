/**
 * scripts/debugMatcher.mjs
 *
 * Diagnostic pass for the matcher: instead of only reporting confirmed
 * matches, this finds NEAR-misses and shows exactly which field broke
 * the match. Two categories:
 *
 *   A) Title-linked pairs — titles share a model token (e.g. both
 *      mention "SF314-59-75QC"), so they're very likely the same
 *      physical laptop, but the spec key didn't match. Shows a
 *      field-by-field diff so you can see which attribute disagrees.
 *
 *   B) Close-spec pairs — same brand + same CPU (the two hardest
 *      fields to coincidentally match), but titles share no token and/or
 *      other spec fields differ. Worth a look in case titles just don't
 *      have extractable codes.
 *
 * Usage: node scripts/debugMatcher.mjs
 */

import fs from 'fs';
import path from 'path';
import { canonicalizeCpuRegex } from '../core/ai/normalizeCpuRegex.js';
import { buildSpecKey } from '../core/specKey.js';
import { extractModelTokens, sharesModelToken } from '../core/modelKey.js';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'notebooks');

function loadStore(filename) {
  const p = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(p)) {
    console.warn(`[debug] missing ${filename}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function prepare(product) {
  const cpuResult = canonicalizeCpuRegex(product.specs?.cpu);
  return {
    ...product,
    _specKey: buildSpecKey(product, cpuResult?.canonical ?? null),
    _modelTokens: extractModelTokens(product.name),
  };
}

/**
 * Field-by-field diff between two spec keys.
 * @returns {{ matchedFields: string[], mismatchedFields: Array<{field, a, b}> }}
 */
function diffSpecKeys(a, b) {
  const matchedFields = [];
  const mismatchedFields = [];

  for (const field of Object.keys(a.required)) {
    const va = a.required[field];
    const vb = b.required[field];
    if (va === null || vb === null) {
      mismatchedFields.push({ field, a: va, b: vb, reason: 'missing on one side' });
    } else if (va !== vb) {
      mismatchedFields.push({ field, a: va, b: vb, reason: 'different values' });
    } else {
      matchedFields.push(field);
    }
  }

  if (a.touch_screen !== undefined && b.touch_screen !== undefined && a.touch_screen !== b.touch_screen) {
    mismatchedFields.push({ field: 'touch_screen', a: a.touch_screen, b: b.touch_screen, reason: 'different values' });
  }

  return { matchedFields, mismatchedFields };
}

function main() {
  const redstore = loadStore('redstore.json').map(prepare);
  const notebookcentre = loadStore('notebookcentre.json').map(prepare);

  console.log(`[debug] ${redstore.length} redstore vs ${notebookcentre.length} notebookcentre products\n`);

  // --- Category A: title-linked pairs (share a model token) ---
  const titleLinked = [];
  for (const a of redstore) {
    for (const b of notebookcentre) {
      const tokenResult = sharesModelToken(a._modelTokens, b._modelTokens);
      if (tokenResult === true) {
        const diff = diffSpecKeys(a._specKey, b._specKey);
        titleLinked.push({ a, b, diff });
      }
    }
  }

  console.log(`=== CATEGORY A: titles share a model token (${titleLinked.length} pairs) ===`);
  if (titleLinked.length === 0) {
    console.log('None found — no redstore/notebookcentre titles share a common SKU-style token at all.');
    console.log('This likely means the two stores just don\'t carry overlapping models yet, not a matcher bug.\n');
  }
  for (const { a, b, diff } of titleLinked) {
    console.log(`\n"${a.name}" (${a.store})  <->  "${b.name}" (${b.store})`);
    console.log(`  shared token(s): ${a._modelTokens.filter((t) => b._modelTokens.includes(t)).join(', ')}`);
    console.log(`  matched fields: ${diff.matchedFields.join(', ') || '(none)'}`);
    if (diff.mismatchedFields.length > 0) {
      console.log('  mismatched fields:');
      for (const m of diff.mismatchedFields) {
        console.log(`    - ${m.field}: "${m.a}" vs "${m.b}"  (${m.reason})`);
      }
    } else {
      console.log('  -> FULL MATCH (should have been caught by matcher.js — investigate if not)');
    }
  }

  // --- Category B: same brand + same CPU, but not title-linked ---
  const closeSpec = [];
  for (const a of redstore) {
    for (const b of notebookcentre) {
      if (!a._specKey.required.brand || !b._specKey.required.brand) continue;
      if (a._specKey.required.brand !== b._specKey.required.brand) continue;
      if (!a._specKey.required.cpu || !b._specKey.required.cpu) continue;
      if (a._specKey.required.cpu !== b._specKey.required.cpu) continue;

      const tokenResult = sharesModelToken(a._modelTokens, b._modelTokens);
      if (tokenResult === true) continue; // already shown in category A

      const diff = diffSpecKeys(a._specKey, b._specKey);
      closeSpec.push({ a, b, diff, tokenResult });
    }
  }

  console.log(`\n\n=== CATEGORY B: same brand + same CPU, no shared title token (${closeSpec.length} pairs) ===`);
  console.log('(showing up to 20 — these are the most likely places a real match is being missed due to spec field noise)\n');
  for (const { a, b, diff, tokenResult } of closeSpec.slice(0, 20)) {
    console.log(`"${a.name}" (${a.store})  <->  "${b.name}" (${b.store})`);
    console.log(`  token overlap: ${tokenResult === null ? 'no tokens extracted on one/both sides' : 'no shared token'}`);
    console.log(`  matched fields: ${diff.matchedFields.join(', ') || '(none)'}`);
    if (diff.mismatchedFields.length > 0) {
      console.log('  mismatched fields:');
      for (const m of diff.mismatchedFields) {
        console.log(`    - ${m.field}: "${m.a}" vs "${m.b}"  (${m.reason})`);
      }
    }
    console.log('');
  }

  const outPath = path.join(CACHE_DIR, 'match-debug.json');
  fs.writeFileSync(outPath, JSON.stringify({ titleLinked, closeSpec }, null, 2));
  console.log(`\nFull report written to ${outPath}`);
}

main();
