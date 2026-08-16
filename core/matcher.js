import fs from 'fs';
import path from 'path';
import { canonicalizeCpuRegex } from './ai/normalizeCpuRegex.js';
import { buildSpecKey, specKeysMatch } from './specKey.js';
import { extractModelTokens, sharesModelToken } from './modelKey.js';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'notebooks');

function loadStore(filename) {
  const p = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(p)) {
    console.warn(`[matcher] missing ${filename}`);
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
 * @param {Array} productsA - normalized products from store A
 * @param {Array} productsB - normalized products from store B
 * @returns {{ matches: Array, unmatched: {a: Array, b: Array} }}
 */
export function matchProducts(productsA, productsB) {
  const preparedA = productsA.map(prepare);
  const preparedB = productsB.map(prepare);

  const matches = [];
  const matchedAIds = new Set();
  const matchedBIds = new Set();

  for (const a of preparedA) {
    for (const b of preparedB) {
      if (!specKeysMatch(a._specKey, b._specKey)) continue;

      const tokenResult = sharesModelToken(a._modelTokens, b._modelTokens);

      if (tokenResult === false) continue; // specs match but titles actively disagree — reject

      matches.push({
        status: tokenResult === true ? 'verified' : 'spec_only',
        a: { id: a.id, store: a.store, name: a.name, price: a.price, url: a.url },
        b: { id: b.id, store: b.store, name: b.name, price: b.price, url: b.url },
        spec_key: a._specKey.required,
      });
      matchedAIds.add(a.id);
      matchedBIds.add(b.id);
    }
  }

  const unmatchedA = preparedA.filter((p) => !matchedAIds.has(p.id));
  const unmatchedB = preparedB.filter((p) => !matchedBIds.has(p.id));

  return {
    matches,
    unmatched: {
      a: unmatchedA.map((p) => ({ id: p.id, store: p.store, name: p.name })),
      b: unmatchedB.map((p) => ({ id: p.id, store: p.store, name: p.name })),
    },
  };
}

export function runMatcher() {
  const redstore = loadStore('redstore.json');
  const notebookcentre = loadStore('notebookcentre.json');

  console.log(`[matcher] ${redstore.length} redstore vs ${notebookcentre.length} notebookcentre products`);

  const result = matchProducts(redstore, notebookcentre);

  const verified = result.matches.filter((m) => m.status === 'verified').length;
  const specOnly = result.matches.filter((m) => m.status === 'spec_only').length;

  console.log(`[matcher] ${verified} verified matches, ${specOnly} spec-only matches (review these)`);
  console.log(`[matcher] ${result.unmatched.a.length} redstore + ${result.unmatched.b.length} notebookcentre products unmatched`);

  fs.writeFileSync(
    path.join(CACHE_DIR, 'matches.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(`[matcher] written to ${path.join(CACHE_DIR, 'matches.json')}`);

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
}
runMatcher();