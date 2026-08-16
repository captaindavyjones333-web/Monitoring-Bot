import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'ai');

function cachePath(namespace) {
  return path.join(CACHE_DIR, `${namespace}.json`);
}

function loadNamespace(namespace) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(namespace), 'utf8'));
  } catch {
    return {};
  }
}

function saveNamespace(namespace, obj) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(namespace), JSON.stringify(obj, null, 2));
}

export function hashKey(raw) {
  return crypto.createHash('sha256').update(String(raw).trim().toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Get-or-compute with disk persistence.
 * @param {string} namespace - e.g. "cpu", "gpu"
 * @param {string} rawInput - the raw string being canonicalized (used to derive the key)
 * @param {() => Promise<any>} computeFn - called only on cache miss
 */
export async function cached(namespace, rawInput, computeFn) {
  const store = loadNamespace(namespace);
  const key = hashKey(rawInput);

  if (store[key] !== undefined) {
    return store[key].value;
  }

  const value = await computeFn();
  store[key] = { raw: rawInput, value, cached_at: new Date().toISOString() };
  saveNamespace(namespace, store);

  return value;
}