import fs from 'fs';
import path from 'path';
import { canonicalizeCpuRegex } from './ai/normalizeCpuRegex.js';
import { canonicalizeGpuRegex } from './ai/normalizeGpuRegex.js';
import { extractModelTokens, sharesModelToken } from './modelKey.js';
import { extractCpuTierGroup, isGamingGpu, isOled } from './cpuGroup.js';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'notebooks');

function loadStore(filename) {
  const p = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(p)) {
    console.warn(`[matcherV2] missing ${filename}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function normalizeResolution(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{3,4})\s*[xX]\s*(\d{3,4})/);
  return m ? `${m[1]}x${m[2]}` : null;
}

function normalizeScreenType(raw) {
  return raw ? String(raw).trim().toUpperCase() : null;
}

function normalizeBrand(raw) {
  return raw ? String(raw).trim().toUpperCase() : null;
}

function normalizeBoolean(raw) {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const s = String(raw).trim().toLowerCase();
  if (['yes', 'true', '1'].includes(s)) return true;
  if (['no', 'false', '0'].includes(s)) return false;
  return undefined;
}

function prepare(product) {
  const cpu = canonicalizeCpuRegex(product.specs?.cpu)?.canonical ?? null;
  const gpu = canonicalizeGpuRegex(product.specs?.gpu)?.canonical ?? null;
  const screenType = normalizeScreenType(product.specs?.screen_type);

  return {
    ...product,
    _modelTokens: extractModelTokens(product.name),
    _cpu: cpu,
    _gpu: gpu,
    _cpuTierGroup: extractCpuTierGroup(cpu),
    _isGaming: isGamingGpu(gpu),
    _fullKey: {
      brand: normalizeBrand(product.brand),
      cpu,
      gpu,
      ram_gb: product.specs?.ram_gb ?? null,
      ram_type: product.specs?.ram_type ?? null,
      storage_gb: product.specs?.storage_gb ?? null,
      storage_type: product.specs?.storage_type ?? null,
      screen_resolution: normalizeResolution(product.specs?.screen_resolution),
      screen_inches: product.specs?.screen_inches ?? null,
      refresh_rate_hz: product.specs?.refresh_rate_hz ?? null,
      screen_type: screenType,
    },
    _touchScreen: normalizeBoolean(product.specs?.touch_screen),
  };
}

function fullKeysMatch(a, b) {
  for (const field of Object.keys(a._fullKey)) {
    const va = a._fullKey[field];
    const vb = b._fullKey[field];
    if (va === null || vb === null) return false;
    if (va !== vb) return false;
  }
  if (a._touchScreen !== undefined && b._touchScreen !== undefined) {
    if (a._touchScreen !== b._touchScreen) return false;
  }
  return true;
}

function groupKeysMatch(a, b) {
  if (!a._fullKey.brand || !b._fullKey.brand) return false;
  if (a._fullKey.brand !== b._fullKey.brand) return false;

  if (!a._cpuTierGroup || !b._cpuTierGroup) return false;
  if (a._cpuTierGroup !== b._cpuTierGroup) return false;

  if (a._isGaming !== b._isGaming) return false; // never cross gaming/non-gaming

  const eitherOled = isOled(a._fullKey.screen_type) || isOled(b._fullKey.screen_type);
  if (eitherOled && a._fullKey.screen_type !== b._fullKey.screen_type) return false;

  return true;
}

/**
 * Formats "parameter/parameter/.../" per your requested output shape.
 */
function formatSpecString(p) {
  const parts = [];
  if (p._cpu) parts.push(p._cpu);
  if (p._gpu) parts.push(p._gpu);
  if (p.specs?.ram_gb) parts.push(`${p.specs.ram_gb}GB${p.specs.ram_type ? ' ' + p.specs.ram_type : ''}`);
  if (p.specs?.storage_gb) parts.push(`${p.specs.storage_gb}GB${p.specs.storage_type ? ' ' + p.specs.storage_type : ''}`);
  if (p._fullKey.screen_resolution) parts.push(p._fullKey.screen_resolution);
  if (p._fullKey.screen_inches) parts.push(`${p._fullKey.screen_inches}"`);
  if (p._fullKey.refresh_rate_hz) parts.push(`${p._fullKey.refresh_rate_hz}Hz`);
  if (p._touchScreen !== undefined) parts.push(p._touchScreen ? 'Touch' : 'No Touch');
  if (p._fullKey.screen_type) parts.push(p._fullKey.screen_type);
  return parts.join('/');
}

function formatEntry(p) {
  return {
    store: p.store,
    name: formatSpecString(p) ? `${p.name} /${formatSpecString(p)}/` : p.name,
    price: `${p.price ?? 'N/A'} - ${p.installment_price ?? 'N/A'}`,
    url: p.url,
  };
}

export function runMatcherV2() {
  const redstore = loadStore('redstore.json').map(prepare);
  const notebookcentre = loadStore('notebookcentre.json').map(prepare);

  console.log(`[matcherV2] ${redstore.length} redstore vs ${notebookcentre.length} notebookcentre products`);

  const full_match = [];
  const non_gaming_group_match = [];
  const gaming_group_match = [];

  const fullMatchPairKeys = new Set();

  // Tier 1
  for (const a of redstore) {
    for (const b of notebookcentre) {
      const tokenLink = sharesModelToken(a._modelTokens, b._modelTokens);
      if (tokenLink !== true) continue;
      if (!fullKeysMatch(a, b)) continue;

      full_match.push({ a: formatEntry(a), b: formatEntry(b) });
      fullMatchPairKeys.add(`${a.id}::${b.id}`);
    }
  }

  // Tier 2 / 3 — skip anything already in tier 1
  for (const a of redstore) {
    for (const b of notebookcentre) {
      if (fullMatchPairKeys.has(`${a.id}::${b.id}`)) continue;
      if (!groupKeysMatch(a, b)) continue;

      const entry = { a: formatEntry(a), b: formatEntry(b) };
      if (a._isGaming) gaming_group_match.push(entry);
      else non_gaming_group_match.push(entry);
    }
  }

  console.log(`[matcherV2] full_match: ${full_match.length}`);
  console.log(`[matcherV2] non_gaming_group_match: ${non_gaming_group_match.length}`);
  console.log(`[matcherV2] gaming_group_match: ${gaming_group_match.length}`);

  const output = { full_match, non_gaming_group_match, gaming_group_match };
  const outPath = path.join(CACHE_DIR, 'matches-v2.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`[matcherV2] written to ${outPath}`);

  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
}
runMatcherV2();