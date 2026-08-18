import { groupByNormalizedName, normalizeName } from '../core/normalizer.js';
import { loadAllCaches } from '../core/cache_manager.js';

const all = loadAllCaches();
const matches = all.filter(p => /iphone\s*17\s*pro\s*max/i.test(p.name) && /512gb/i.test(p.name) && /esim/i.test(p.name));
console.log("Matches:", matches);
const groups = groupByNormalizedName(matches);
console.log("Group keys:");
for (const [k, v] of groups) {
  console.log("Key:", k, "Sources:", Object.keys(v.sources));
}
