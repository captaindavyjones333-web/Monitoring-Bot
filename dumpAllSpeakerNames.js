// debug/checkMacbookMC7.mjs
import { loadAllCaches } from "./core/cache_manager.js";
import { MACBOOK_REGEX } from "./core/categoryDetector.js";
import { groupMacbooksByCode, buildMacbookComparisons } from "./core/comparator.js";

const all = loadAllCaches();
const macbooks = all.filter((p) => MACBOOK_REGEX.test(p.name));

const groups = groupMacbooksByCode(macbooks);

for (const code of ["MLY23", "MLY43", "MC7X4", "MC7W4"]) {
  const group = groups.get(code);
  console.log(`\n=== ${code} ===`);
  if (!group) {
    console.log("No group found");
    continue;
  }
  console.log("sources:", Object.keys(group.sources));
}

const comparisons = buildMacbookComparisons(groups);
const mc7Air = comparisons.filter((c) => c.message.includes("MC7") || c.message.includes("MLY"));
for (const c of mc7Air) {
  console.log(`\nhasAlert=${c.hasAlert}`);
  console.log(c.message);
}