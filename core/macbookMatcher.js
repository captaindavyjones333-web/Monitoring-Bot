import { extractModelCode } from "./modelCode.js";

export function groupMacbooksByCode(products) {
  const groups = new Map();

  for (const product of products) {
    const code = extractModelCode(product.name);
    // Products with no extractable code fall back to null-key bucket —
    // won't match anything, same safety behavior as an unmatched
    // normalized name elsewhere.
    const key = code || `nocode:${product.name}`;

    if (!groups.has(key)) {
      groups.set(key, { normalized: key, code, sources: {} });
    }

    const group = groups.get(key);
    const existing = group.sources[product.source];
    if (existing) {
      const newCash = product.cash_price ?? Infinity;
      const oldCash = existing.cash_price ?? Infinity;
      if (newCash >= oldCash) continue;
    }

    group.sources[product.source] = {
      name: product.name,
      cash_price: product.cash_price ?? null,
      installment_price: product.installment_price ?? null,
    };
  }

  return groups;
}