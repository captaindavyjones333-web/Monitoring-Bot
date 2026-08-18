import { loadAllCaches } from '../core/cache_manager.js';

const all = loadAllCaches();
const matches = all.filter(p => /iphone\s*17\s*pro\s*max/i.test(p.name));
console.log(`Found ${matches.length} matches in cache:`);
for (const m of matches) {
  console.log(`[${m.source}] ${m.name} | ${m.cash_price}`);
}
