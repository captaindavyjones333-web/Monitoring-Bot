import { loadAllCaches } from "./cache_manager.js";
import { detectCategory } from "./categoryDetector.js";
import { groupByNormalizedName } from "./normalizer.js";
import {
  groupMacbooksByCode,
  groupTvsByCode,
  groupDysonByKey,
  groupGamingByName,
  SOURCE_LABELS,
} from "./comparator.js";

const MAX_RESULTS = 15;

function formatPrice(n) {
  return n ? n.toLocaleString("ru-RU").replace(/,/g, " ") : "—";
}

function buildSearchGroupMessage(displayName, group) {
  const lines = [`*${displayName}*`];
  for (const [source, entry] of Object.entries(group.sources)) {
    const label = SOURCE_LABELS[source] || source;
    const price = formatPrice(entry.cash_price);
    const inst = entry.installment_price
      ? ` - ${formatPrice(entry.installment_price)}`
      : "";
    lines.push(`${label} - ${price}${inst}`);
  }
  return lines.join("\n");
}

function groupForCategory(category, products) {
  if (category === "macbooks") return groupMacbooksByCode(products);
  if (category === "tvs") return groupTvsByCode(products);
  if (category === "dyson") return groupDysonByKey(products);
  if (category === "gaming") return groupGamingByName(products);
  return groupByNormalizedName(products);
}

/**
 * Free-text search across every cached product, regardless of category
 * or whether it matched anything in the normal alert pipeline. Every
 * whitespace-separated token in the query must appear as a substring
 * in the product name (case-insensitive) — simple, fast, no external
 * dependencies, sufficient given the dataset size.
 *
 * @returns {{ messages: string[], totalGroups: number }}
 */
export function searchProducts(query) {
  const allProducts = loadAllCaches();
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { messages: [], totalGroups: 0 };

  const matches = allProducts.filter((p) => {
    const name = p.name.toLowerCase();
    return tokens.every((t) => name.includes(t));
  });

  if (matches.length === 0) return { messages: [], totalGroups: 0 };

  const byCategory = {};
  for (const p of matches) {
    const cat = detectCategory(p.name);
    (byCategory[cat] ??= []).push(p);
  }

  const allGroups = [];
  for (const [category, products] of Object.entries(byCategory)) {
    const groups = groupForCategory(category, products);
    for (const [key, group] of groups) {
      const anyEntry = Object.values(group.sources)[0];
      const displayName = anyEntry?.name || key;
      const sourceCount = Object.keys(group.sources).length;
      allGroups.push({ displayName, group, sourceCount });
    }
  }

  // Show cross-store matches first (more useful signal), then
  // single-source hits.
  allGroups.sort((a, b) => b.sourceCount - a.sourceCount);

  const totalGroups = allGroups.length;
  const limited = allGroups.slice(0, MAX_RESULTS);
  const messages = limited.map((g) => buildSearchGroupMessage(g.displayName, g.group));

  return { messages, totalGroups };
}