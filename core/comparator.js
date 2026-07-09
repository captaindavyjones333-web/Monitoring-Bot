import {
  normalizeName,
  groupByNormalizedName,
  getModelKey,
  getStorageLabel,
} from "./normalizer.js";
import { detectCategory, MACBOOK_REGEX } from "./categoryDetector.js";
import { extractModelCode } from "./modelCode.js";

const THRESHOLD_FLAT = 3000;
const THRESHOLD_PERCENT = 0.1;

const SOURCE_LABELS = {
  redstore: "RS",
  yerevanmobile: "YM",
  mobilecentre: "Mobile",
  allsell: "Allsell",
  "3dplanet": "3D",
  icentre: "iCentre",
  ispace: "iSpace",
};

const SOURCE_ORDER = [
  "redstore",
  "yerevanmobile",
  "mobilecentre",
  "allsell",
  "3dplanet",
  "icentre",
  "ispace",
];

function getFlag(rsPrice, competitorPrice) {
  if (!rsPrice || !competitorPrice) return "";
  const diff = rsPrice - competitorPrice;
  if (diff > THRESHOLD_FLAT || diff > rsPrice * THRESHOLD_PERCENT) return "❗";
  return "✅";
}

function formatPricePair(cash, installment, rsCash, rsInstallment, isRedstore) {
  const fmt = (n) => (n ? n.toLocaleString("ru-RU").replace(/,/g, " ") : "—");
  const effectiveInstallment = installment ?? cash;

  if (isRedstore) {
    const parts = [fmt(cash)];
    if (effectiveInstallment) parts.push(fmt(effectiveInstallment));
    return parts.join(" - ");
  }

  const rsEffectiveInstallment = rsInstallment ?? rsCash;
  const cashMatch = cash === rsCash;
  const installmentMatch = effectiveInstallment === rsEffectiveInstallment;
  if (cashMatch && installmentMatch) return "Արժեքները նույնն են";

  const cashFlag = cash ? getFlag(rsCash, cash) : "";
  const instFlag = effectiveInstallment
    ? getFlag(rsEffectiveInstallment, effectiveInstallment)
    : "";

  const cashStr = cash ? `${cashFlag}${fmt(cash)}` : "—";
  const instStr = effectiveInstallment
    ? `${instFlag}${fmt(effectiveInstallment)}`
    : null;

  return instStr ? `${cashStr} - ${instStr}` : cashStr;
}

// ─── Standard (name-based) comparison, used for phones/tablets/watches/headphones ──

function parseStorageValue(label) {
  const m = label ? label.match(/(\d+)\s*(gb|tb)/i) : null;
  if (!m) return 0;
  const num = parseInt(m[1], 10);
  return m[2].toLowerCase() === "tb" ? num * 1024 : num;
}

export function buildComparisons(groups) {
  const buckets = new Map();

  for (const [key, group] of groups) {
    const rs = group.sources["redstore"];
    if (!rs) continue;

    const modelKey = getModelKey(key);
    if (!buckets.has(modelKey)) buckets.set(modelKey, []);

    const storageLabel = getStorageLabel(key);
    buckets.get(modelKey).push({ storageLabel, group });
  }

  const results = [];

  for (const [modelKey, tiers] of buckets) {
    tiers.sort(
      (a, b) =>
        parseStorageValue(a.storageLabel) - parseStorageValue(b.storageLabel),
    );

    let hasAlert = false;
    const lines = [];

    const firstRs = tiers[0].group.sources["redstore"];
    const displayName = firstRs.name
      .replace(/\b\d+\s*(?:gb|tb)\b/gi, "")
      .replace(
        /\b(Midnight|Starlight|Blue|Black|White|Red|Green|Yellow|Purple|Pink|Gold|Silver|Titanium|Natural|Desert|Ultramarine|Teal|Coral|Graphite|Alpine|Storm|Clay|Lavender|Mint|Sage|Cosmic Orange|Deep Blue|Sierra Blue|Space Gray|Space Grey|Deep Purple|Product Red|Sky Blue|Desert Titanium|Black Titanium|White Titanium|Natural Titanium|Rose Gold|Mocha|Brown|Navy|Orange)\b/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();

    lines.push(`*${displayName}*`);

    for (const { storageLabel, group } of tiers) {
      const rs = group.sources["redstore"];
      const rsCash = rs.cash_price;
      const rsInstallment = rs.installment_price;

      if (storageLabel) lines.push(`\n_${storageLabel}_`);

      for (const source of SOURCE_ORDER) {
        const entry = group.sources[source];
        const label = SOURCE_LABELS[source];
        if (!label) continue; // source not applicable/known, skip silently

        if (!entry) {
          lines.push(`${label} - Առկա չէ`);
          continue;
        }

        const isRS = source === "redstore";
        const priceStr = formatPricePair(
          entry.cash_price,
          entry.installment_price,
          rsCash,
          rsInstallment,
          isRS,
        );
        lines.push(`${label} - ${priceStr}`);

        if (!isRS) {
          if (entry.cash_price) {
            const flag = getFlag(rsCash, entry.cash_price);
            if (flag === "❗" || flag === "✅") hasAlert = true;
          }
          if (entry.installment_price) {
            const flag = getFlag(
              rsInstallment ?? rsCash,
              entry.installment_price,
            );
            if (flag === "❗" || flag === "✅") hasAlert = true;
          }
        }
      }
    }

    results.push({ key: modelKey, hasAlert, message: lines.join("\n") });
  }

  return results;
}

// ─── Code-based comparison, used for macbooks ──────────────────────────────

export function groupMacbooksByCode(products) {
  const redstoreProducts = products.filter((p) => p.source === "redstore");
  const otherProducts = products.filter((p) => p.source !== "redstore");

  const groups = new Map();

  // Anchor: extract codes only from redstore, since its formatting is
  // clean and consistent. Every group is seeded by a real redstore code.
  for (const product of redstoreProducts) {
    const code = extractModelCode(product.name);
    if (!code) continue; // skip redstore products with no extractable code

    if (!groups.has(code)) {
      groups.set(code, { normalized: code, code, sources: {} });
    }
    const group = groups.get(code);
    group.sources["redstore"] = {
      name: product.name,
      cash_price: product.cash_price ?? null,
      installment_price: product.installment_price ?? null,
    };
  }

  // For every other product, find which redstore code (if any) appears
  // as a substring of its name — sidesteps needing each site's own
  // regex extraction to produce an identical string.
  for (const product of otherProducts) {
    const upperName = product.name.toUpperCase();
    let matchedCode = null;

    for (const code of groups.keys()) {
      if (upperName.includes(code)) {
        matchedCode = code;
        break;
      }
    }

    if (!matchedCode) continue; // no matching redstore code found, skip

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

/**
 * Extract storage label (e.g. "512GB", "1TB") from any source name in
 * the group.  Redstore names usually omit storage, so we look across all
 * available sources. yerevanmobile format: "/16GB/512GB/",
 * ispace: "16 GB, 512 GB", mobilecentre: "512GB SSD", etc.
 */
function extractStorageFromGroup(group) {
  // Priority: yerevanmobile (cleanest), then any other non-redstore, then redstore
  const sourceOrder = [
    "yerevanmobile",
    "ispace",
    "mobilecentre",
    "3dplanet",
    "icentre",
    "allsell",
    "redstore",
  ];

  for (const src of sourceOrder) {
    const entry = group.sources[src];
    if (!entry) continue;

    const name = entry.name;

    // Match patterns like "/16GB/512GB/" or "/16GB RAM/1TB/"
    const slashMatch = name.match(
      /\/\d+\s*GB\s*(?:RAM)?\/([\d.]+\s*[GT]B)\b/i,
    );
    if (slashMatch) return slashMatch[1].replace(/\s+/g, "").toUpperCase();

    // Match patterns like "16 GB, 512 GB" or "16 GB, 1 TB"
    const commaMatch = name.match(
      /\d+\s*GB\s*,\s*([\d.]+\s*[GT]B)\b/i,
    );
    if (commaMatch) return commaMatch[1].replace(/\s+/g, "").toUpperCase();

    // Match patterns like "512GB SSD" or "1TB SSD"
    const ssdMatch = name.match(/([\d.]+\s*[GT]B)\s*SSD/i);
    if (ssdMatch) return ssdMatch[1].replace(/\s+/g, "").toUpperCase();

    // Match patterns like "8GB/256GB" (without leading slash)
    const ramStorageMatch = name.match(
      /\b\d+\s*GB\s*\/\s*([\d.]+\s*[GT]B)\b/i,
    );
    if (ramStorageMatch)
      return ramStorageMatch[1].replace(/\s+/g, "").toUpperCase();
  }

  return null;
}

/**
 * Extract a "series key" from a redstore macbook name.
 * e.g. "MacBook Air 13.6'' M5 MDHE4(Midnight)" → "MacBook Air 13.6'' M5"
 * This strips model code, color, parentheses, and trailing whitespace.
 */
function getMacbookSeriesKey(name, code) {
  let cleaned = name;
  // Remove model code (and any trailing letters like RU/A)
  if (code) {
    cleaned = cleaned.replace(
      new RegExp(`\\b${code}[A-Z]{0,2}[\\/-]?[A-Z]?\\b`, "gi"),
      "",
    );
  }
  // Remove color in parentheses and any remaining parenthesized text
  cleaned = cleaned.replace(/\(.*?\)/g, "");
  // Remove trailing chip variant suffixes that come AFTER the chip name
  // (e.g. keep "M5 Pro" but don't duplicate)
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

export function buildMacbookComparisons(groups) {
  // Step 1: Build per-code comparisons with storage info
  const perCodeResults = [];

  for (const [key, group] of groups) {
    const rs = group.sources["redstore"];
    if (!rs) continue;

    const rsCash = rs.cash_price;
    const rsInstallment = rs.installment_price;
    const storage = extractStorageFromGroup(group);
    const seriesKey = getMacbookSeriesKey(rs.name, group.code);

    let hasAlert = false;
    const lines = [];

    // Sub-header with storage and model code
    const storagePart = storage ? `${storage}` : "";
    const codePart = group.code ? `[${group.code}]` : "";
    const subHeader = [storagePart, codePart].filter(Boolean).join(" ");
    if (subHeader) lines.push(`\n_${subHeader}_`);

    for (const source of SOURCE_ORDER) {
      const entry = group.sources[source];
      const label = SOURCE_LABELS[source];
      if (!label) continue;

      if (!entry) {
        lines.push(`${label} - Առկա չէ`);
        continue;
      }

      const isRS = source === "redstore";
      const priceStr = formatPricePair(
        entry.cash_price,
        entry.installment_price,
        rsCash,
        rsInstallment,
        isRS,
      );
      lines.push(`${label} - ${priceStr}`);

      if (!isRS) {
        if (entry.cash_price) {
          const flag = getFlag(rsCash, entry.cash_price);
          if (flag === "❗" || flag === "✅") hasAlert = true;
        }
        if (entry.installment_price) {
          const flag = getFlag(
            rsInstallment ?? rsCash,
            entry.installment_price,
          );
          if (flag === "❗" || flag === "✅") hasAlert = true;
        }
      }
    }

    perCodeResults.push({
      key,
      seriesKey,
      storage,
      hasAlert,
      rsCash,
      lines,
    });
  }

  // Step 2: Group by series key and merge into combined messages
  const seriesMap = new Map();
  for (const item of perCodeResults) {
    if (!seriesMap.has(item.seriesKey)) {
      seriesMap.set(item.seriesKey, []);
    }
    seriesMap.get(item.seriesKey).push(item);
  }

  const results = [];

  for (const [seriesKey, items] of seriesMap) {
    // Sort items within a series by redstore cash price (ascending)
    items.sort((a, b) => (a.rsCash ?? 0) - (b.rsCash ?? 0));

    const hasAlert = items.some((item) => item.hasAlert);
    const allLines = [`*${seriesKey}*`];

    for (const item of items) {
      allLines.push(...item.lines);
    }

    results.push({
      key: seriesKey,
      hasAlert,
      message: allLines.join("\n"),
    });
  }

  return results;
}

// ─── Sorting / final message assembly ──────────────────────────────────────

const IPHONE_ORDER = [
  "iphone 13",
  "iphone 14",
  "iphone 15",
  "iphone 16",
  "iphone 17",
];
const SAMSUNG_ORDER = ["galaxy a", "galaxy s", "galaxy z"];

function getSortKey(message) {
  const name = message.toLowerCase();

  if (name.includes("iphone")) {
    const model = IPHONE_ORDER.findIndex((m) => name.includes(m));
    return `0_${model >= 0 ? model : 99}_${name}`;
  }
  if (name.includes("samsung")) {
    const series = SAMSUNG_ORDER.findIndex((s) => name.includes(s));
    return `1_${series >= 0 ? series : 99}_${name}`;
  }
  if (
    name.includes("xiaomi") ||
    name.includes("poco") ||
    name.includes("redmi")
  ) {
    return `2_${name}`;
  }
  if (name.includes("google") || name.includes("pixel")) return `3_${name}`;
  if (name.includes("oneplus")) return `4_${name}`;
  if (name.includes("nothing")) return `5_${name}`;
  return `6_${name}`;
}

export function splitAlertsByCategory(comparisons) {
  const alerts = comparisons.filter((c) => c.hasAlert);

  alerts.sort((a, b) =>
    getSortKey(a.message).localeCompare(getSortKey(b.message)),
  );

  const buckets = {
    phones: [],
    tablets: [],
    watches: [],
    headphones: [],
    macbooks: [],
  };

  for (const item of alerts) {
    const category = detectCategory(item.message);
    buckets[category].push(item.message);
  }

  return {
    phones: buckets.phones.map((msg, i) => `${i + 1}. ${msg}`),
    tablets: buckets.tablets.map((msg, i) => `${i + 1}. ${msg}`),
    watches: buckets.watches.map((msg, i) => `${i + 1}. ${msg}`),
    headphones: buckets.headphones.map((msg, i) => `${i + 1}. ${msg}`),
    macbooks: buckets.macbooks.map((msg, i) => `${i + 1}. ${msg}`),
  };
}

/**
 * Full pipeline: splits products into macbooks (code-matched) vs.
 * everything else (name-matched), builds comparisons for each, merges,
 * then splits into per-category alert lists.
 */
export function runComparison(allProducts) {
  const macbookProducts = allProducts.filter((p) => MACBOOK_REGEX.test(p.name));
  const otherProducts = allProducts.filter((p) => !MACBOOK_REGEX.test(p.name));

  const otherGroups = groupByNormalizedName(otherProducts);
  const otherComparisons = buildComparisons(otherGroups);

  const macbookGroups = groupMacbooksByCode(macbookProducts);
  const macbookComparisons = buildMacbookComparisons(macbookGroups);

  const allComparisons = [...otherComparisons, ...macbookComparisons];
  return splitAlertsByCategory(allComparisons);
}
