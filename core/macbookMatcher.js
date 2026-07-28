import { extractModelCode } from "./modelCode.js";

export function groupMacbooksByCode(products) {
  const groups = new Map();

  // First pass: extract codes directly from all products
  for (const product of products) {
    const code = extractModelCode(product.name);
    if (!code) continue;

    if (!groups.has(code)) {
      groups.set(code, { normalized: code, code, sources: {} });
    }
    const group = groups.get(code);

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

  // Second pass: for products with no direct model code extracted,
  // find which seeded code appears as a substring
  for (const product of products) {
    const directCode = extractModelCode(product.name);
    if (directCode) continue;

    const upperName = product.name.toUpperCase();
    let matchedCode = null;

    for (const code of groups.keys()) {
      if (upperName.includes(code)) {
        matchedCode = code;
        break;
      }
    }

    if (!matchedCode) continue;

    const group = groups.get(matchedCode);
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