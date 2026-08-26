import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

function floorInches(val) {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  return isNaN(num) ? null : Math.floor(num);
}

function oledMatches(a, b) {
  const aOled = isOled(a._fullKey.screen_type);
  const bOled = isOled(b._fullKey.screen_type);
  if (aOled || bOled) {
    return a._fullKey.screen_type === b._fullKey.screen_type;
  }
  return true;
}

function storageMatches(a, b) {
  if (!a._fullKey.storage_gb || !b._fullKey.storage_gb) return false;
  if (a._fullKey.storage_gb !== b._fullKey.storage_gb) return false;

  const aType = a._fullKey.storage_type || 'SSD';
  const bType = b._fullKey.storage_type || 'SSD';
  // SSD and HDD must NEVER match
  if (aType !== bType) return false;

  return true;
}

function ramMatches(a, b) {
  if (!a._fullKey.ram_gb || !b._fullKey.ram_gb) return false;
  return a._fullKey.ram_gb === b._fullKey.ram_gb;
}

function screenInchesMatches(a, b) {
  const aInches = floorInches(a._fullKey.screen_inches);
  const bInches = floorInches(b._fullKey.screen_inches);
  if (aInches === null || bInches === null) return false;
  return aInches === bInches;
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

const COMPETITOR_FILES = [
  'notebookcentre.json',
  'allsell.json',
  '3dplanet.json',
];

export function runMatcherV2() {
  const redstore = loadStore('redstore.json').map(prepare);
  const competitors = COMPETITOR_FILES.flatMap((file) => loadStore(file)).map(prepare);

  console.log(`[matcherV2] ${redstore.length} redstore vs ${competitors.length} competitor products (${COMPETITOR_FILES.join(', ')})`);

  const full_match = [];
  const gaming_same_brand = [];
  const gaming_cross_brand = [];
  const non_gaming_same_brand = [];
  const non_gaming_cross_brand = [];

  const fullMatchPairKeys = new Set();

  // Tier 1: Strict full match
  for (const a of redstore) {
    for (const b of competitors) {
      const tokenLink = sharesModelToken(a._modelTokens, b._modelTokens);
      if (tokenLink !== true) continue;
      if (!fullKeysMatch(a, b)) continue;

      const sameBrand = a._fullKey.brand && b._fullKey.brand && a._fullKey.brand === b._fullKey.brand;

      full_match.push({
        a: formatEntry(a),
        b: formatEntry(b),
        match_type: 'full_match',
        brand: a._fullKey.brand || a.brand,
        cpu_group: a._cpuTierGroup || null,
        is_gaming: a._isGaming,
        same_brand: !!sameBrand,
      });
      fullMatchPairKeys.add(`${a.id}::${b.store}::${b.id}`);
    }
  }

  // Tier 2 & 3: Group matches
  for (const a of redstore) {
    for (const b of competitors) {
      const pairKey = `${a.id}::${b.store}::${b.id}`;
      if (fullMatchPairKeys.has(pairKey)) continue;

      // Common specs check
      if (!a._cpuTierGroup || !b._cpuTierGroup || a._cpuTierGroup !== b._cpuTierGroup) continue;
      if (!ramMatches(a, b)) continue;
      if (!storageMatches(a, b)) continue;
      if (!screenInchesMatches(a, b)) continue;
      if (!oledMatches(a, b)) continue;

      const sameBrand = a._fullKey.brand && b._fullKey.brand && a._fullKey.brand === b._fullKey.brand;

      // 1. Gaming Match: both have RTX and exact GPU model matches
      if (a._isGaming && b._isGaming) {
        if (!a._gpu || !b._gpu || a._gpu !== b._gpu) continue;

        const entry = {
          a: formatEntry(a),
          b: formatEntry(b),
          is_gaming: true,
          same_brand: !!sameBrand,
          brand: a._fullKey.brand || a.brand,
          cpu_group: a._cpuTierGroup || null,
        };

        if (sameBrand) {
          gaming_same_brand.push(entry);
        } else {
          gaming_cross_brand.push(entry);
        }
      }
      // 2. Non-gaming Match: neither has RTX
      else if (!a._isGaming && !b._isGaming) {
        const entry = {
          a: formatEntry(a),
          b: formatEntry(b),
          is_gaming: false,
          same_brand: !!sameBrand,
          brand: a._fullKey.brand || a.brand,
          cpu_group: a._cpuTierGroup || null,
        };

        if (sameBrand) {
          non_gaming_same_brand.push(entry);
        } else {
          non_gaming_cross_brand.push(entry);
        }
      }
    }
  }

  console.log(`[matcherV2] full_match: ${full_match.length}`);
  console.log(`[matcherV2] gaming_same_brand: ${gaming_same_brand.length}`);
  console.log(`[matcherV2] gaming_cross_brand: ${gaming_cross_brand.length}`);
  console.log(`[matcherV2] non_gaming_same_brand: ${non_gaming_same_brand.length}`);
  console.log(`[matcherV2] non_gaming_cross_brand: ${non_gaming_cross_brand.length}`);

  const output = {
    full_match,
    gaming_same_brand,
    gaming_cross_brand,
    non_gaming_same_brand,
    non_gaming_cross_brand,
  };

  const outPath = path.join(CACHE_DIR, 'matches-v2.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`[matcherV2] written to ${outPath}`);

  return output;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMatcherV2();
}