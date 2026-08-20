import {
  normalizeName,
  groupByNormalizedName,
  getModelKey,
  getStorageLabel,
} from "./normalizer.js";
import {
  detectCategory,
  MACBOOK_REGEX,
  TV_REGEX,
  GAMING_REGEX,
  AC_REGEX,
} from "./categoryDetector.js";
import { extractModelCode } from "./modelCode.js";
import { extractTvModelCode } from "./tvModelCode.js";
import { extractDysonKey } from "./dysonModelCode.js";
import { extractACCode } from "./acModelCode.js";
import { normalizeGamingName } from "./gamingNormalizer.js";

const THRESHOLD_FLAT = 3000;
const THRESHOLD_PERCENT = 0.1;

export const SOURCE_LABELS = {
  redstore: "RS",
  yerevanmobile: "YM",
  mobilecentre: "Mobile",
  allsell: "Allsell",
  "3dplanet": "3D",
  icentre: "iCentre",
  ispace: "iSpace",
  eldorado: "Eldorado",
  zigzag: "Zigzag",
  vesta: "Vesta",
  vlv: "VLV",
  vega: "Vega",
};

const SOURCE_ORDER_BY_CATEGORY = {
  phones: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "3dplanet",
    "vega",
    "zigzag",
    "vlv",
  ],
  tablets: ["redstore", "yerevanmobile", "mobilecentre", "allsell", "3dplanet"],
  watches: ["redstore", "yerevanmobile", "mobilecentre", "allsell", "3dplanet"],
  headphones: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "3dplanet",
    "zigzag",
  ],
  speakers: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "3dplanet",
    "eldorado",
    "zigzag",
  ],
  macbooks: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "3dplanet",
    "icentre",
    "ispace",
  ],
  tvs: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "vesta",
    "vega",
    "zigzag",
    "vlv",
    "eldorado",
  ],
  dyson: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "3dplanet",
    "eldorado",
    "zigzag",
  ],
  gaming: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "3dplanet",
    "eldorado",
  ],
  airconditioners: ["redstore", "allsell", "eldorado", "vesta", "vlv"],
};

function hasAnyCompetitorEntry(sources) {
  return Object.keys(sources).some(
    (source) => source !== "redstore" && sources[source],
  );
}

function getFlag(rsPrice, competitorPrice) {
  if (!rsPrice || !competitorPrice) return "";
  if (competitorPrice < rsPrice) return "‼️";
  if (competitorPrice > rsPrice) return "♦️";
  return "🏷";
}

function formatInstallation(installation) {
  if (installation === null || installation === undefined) return null;
  if (installation === 0) return "անվճար";
  return `${installation.toLocaleString("ru-RU").replace(/,/g, " ")} ֏`;
}

function formatPricePair(cash, installment, rsCash, rsInstallment, isRedstore, sourcesGroup, sourceOrder) {
  const fmt = (n, bold = false) => {
    if (n === null || n === undefined) return "—";
    const formatted = n.toLocaleString("ru-RU").replace(/,/g, " ");
    return bold ? `*${formatted}*` : formatted;
  };

  // Always fall back installment to cash if not present or zero
  const effectiveInstallment = installment || cash;
  const effectiveRsInstallment = rsInstallment || rsCash;

  if (isRedstore) {
    const competitors = (sourceOrder || []).filter(
      (s) => s !== "redstore" && sourcesGroup?.[s],
    );

    const cashIsAffordable =
      competitors.length > 0 &&
      competitors.every((s) => {
        const compCash = sourcesGroup[s].cash_price;
        return compCash && rsCash < compCash;
      });

    const instIsAffordable =
      competitors.length > 0 &&
      competitors.every((s) => {
        const compEntry = sourcesGroup[s];
        const compInst = compEntry.installment_price || compEntry.cash_price;
        return compInst && effectiveRsInstallment < compInst;
      });

    const cashPart = cashIsAffordable ? `✅${fmt(cash)}` : fmt(cash);
    const instPart = instIsAffordable
      ? `${fmt(effectiveInstallment)}✅`
      : fmt(effectiveInstallment);

    return `${cashPart} - ${instPart}`;
  }

  const cashMatch = cash === rsCash;
  const installmentMatch = effectiveInstallment === effectiveRsInstallment;

  const cashFlag = cash ? getFlag(rsCash, cash) : "";
  const instFlag = effectiveInstallment
    ? getFlag(effectiveRsInstallment, effectiveInstallment)
    : "";

  const cashBold = cashFlag === "‼️";
  const instBold = instFlag === "‼️";

  const cashStr = cash
    ? cashMatch
      ? "🏷"
      : `${cashFlag}${fmt(cash, cashBold)}`
    : "—";

  // Always show installment (falling back to cash) — icon goes AFTER the price
  const instStr = installmentMatch
    ? "🏷"
    : `${fmt(effectiveInstallment, instBold)}${instFlag}`;

  return `${cashStr} - ${instStr}`;
}

// ─── Standard (name-based) comparison, used for phones/tablets/watches/headphones ──

function parseStorageValue(label) {
  const m = label ? label.match(/(\d+)\s*(gb|tb)/i) : null;
  if (!m) return 0;
  const num = parseInt(m[1], 10);
  return m[2].toLowerCase() === "tb" ? num * 1024 : num;
}

const TIER_1_BRANDS = [
  "iphone",
  "samsung",
  "xiaomi",
  "redmi",
  "poco",
  "google",
  "pixel",
];

const TIER_1_PHONE_SOURCES = [
  "redstore",
  "yerevanmobile",
  "mobilecentre",
  "allsell",
  "3dplanet",
];

const TIER_2_PHONE_SOURCES = [
  "redstore",
  "yerevanmobile",
  "3dplanet",
  "zigzag",
  "vega",
  "vlv",
  "allsell",
];

function getSourceOrderForProduct(modelKey, category) {
  if (category !== "phones") {
    return SOURCE_ORDER_BY_CATEGORY[category];
  }
  const isTier1 = TIER_1_BRANDS.some((b) => modelKey.toLowerCase().includes(b));
  return isTier1 ? TIER_1_PHONE_SOURCES : TIER_2_PHONE_SOURCES;
}

export function buildComparisons(groups, category) {
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
    const sourceOrder = getSourceOrderForProduct(modelKey, category);
    tiers.sort(
      (a, b) =>
        parseStorageValue(a.storageLabel) - parseStorageValue(b.storageLabel),
    );

    let hasAlert = false;
    let anyCompetitorAcrossAllTiers = false; // NEW
    const lines = [];

    const firstRs = tiers[0].group.sources["redstore"];
    const displayName = firstRs.name
      .replace(/\b\d+\s*(?:gb|tb)\b/gi, "")
      .replace(
        /\b(Midnight|Starlight|Blue|Black|White|Red|Green|Yellow|Purple|Pink|Blush|Brass|Gold|Silver|Titanium|Natural|Desert|Ultramarine|Teal|Coral|Graphite|Alpine|Storm|Clay|Lavender|Mint|Sage|Cosmic Orange|Deep Blue|Sierra Blue|Space Gray|Space Grey|Deep Purple|Product Red|Sky Blue|Desert Titanium|Black Titanium|White Titanium|Natural Titanium|Rose Gold|Mocha|Brown|Navy|Orange|Porcelain|Obsidian|Hazel|Snow|Chalk|Charcoal|Fog|Lemongrass|Indigo|Jade|Moonstone|Bay|Aloe|Peony|Wintergreen|Sorta Seafoam|Sorta Sunny|Shadow|Jetblack|Onyx|Cobalt|Marble|Amber|Peach|Lime|Emerald|Phantom|Crafted|Icy|Silver Shadow|Blue Shadow|White Shadow|Black Shadow|Violet Shadow|Peach Pink|Onyx Black|Cobalt Violet|Marble Gray|Marble Grey|Amber Yellow|Titanium Jetblack|Crafted Black|Icy Blue|Gray|Grey)\b/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .replace(/[\/\\,\-_\s]+$/, "")
      .trim();

    lines.push(`*${displayName}*`);

    for (const { storageLabel, group } of tiers) {
      const rs = group.sources["redstore"];
      const rsCash = rs.cash_price;
      const rsInstallment = rs.installment_price;

      const hasAnyCompetitor = sourceOrder.some(
        (source) => source !== "redstore" && group.sources[source],
      );

      if (!hasAnyCompetitor) continue; // skip this tier's lines entirely

      anyCompetitorAcrossAllTiers = true; // NEW — mark that at least one tier had someone

      if (storageLabel) lines.push(`\n_${storageLabel}_`);

      for (const source of sourceOrder) {
        const entry = group.sources[source];
        const label = SOURCE_LABELS[source];
        if (!label) continue;

        if (!entry) {
          lines.push(`${label} - ❌`);
          continue;
        }

        const isRS = source === "redstore";
        const priceStr = formatPricePair(
          entry.cash_price,
          entry.installment_price,
          rsCash,
          rsInstallment,
          isRS,
          group.sources,
          sourceOrder,
        );
        lines.push(`${label} - ${priceStr}`);

        const installStr = formatInstallation(entry.installation_price);
        if (installStr) lines.push(`  + Տեղադրում՝ ${installStr}`);

        if (!isRS) {
          if (entry.cash_price) {
            const flag = getFlag(rsCash, entry.cash_price);
            if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
          }
          if (entry.installment_price) {
            const flag = getFlag(
              rsInstallment ?? rsCash,
              entry.installment_price,
            );
            if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
          }
        }
      }
    }

    const finalHasAlert = hasAlert && anyCompetitorAcrossAllTiers; // CHANGED
    results.push({
      key: modelKey,
      hasAlert: finalHasAlert,
      message: lines.join("\n"),
    });
  }

  return results;
}

// ─── Code-based comparison, used for macbooks ──────────────────────────────

export function groupMacbooksByCode(products) {
  const groups = new Map();

  // First pass: extract codes directly from all products
  for (const product of products) {
    let code = extractModelCode(product.name);
    if (!code) continue;

    // Hardcode fix: Allsell listed MHFH4 (256GB code) in title that specifies 512GB
    if (code === "MHFH4" && /512\s*(GB|ԳԲ)/i.test(product.name)) {
      code = "MHFJ4";
    }

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

/**
 * Extract storage label (e.g. "512GB", "1TB") from any source name in
 * the group.  Redstore names usually omit storage, so we look across all
 * available sources. yerevanmobile format: "/16GB/512GB/",
 * ispace: "16 GB, 512 GB", mobilecentre: "512GB SSD", etc.
 */
function extractStorageFromGroup(group) {
  // Priority: redstore (now has RAM/Storage suffix), then yerevanmobile, ispace, mobilecentre, etc.
  const sourceOrder = [
    "redstore",
    "yerevanmobile",
    "ispace",
    "mobilecentre",
    "3dplanet",
    "icentre",
    "allsell",
  ];

  for (const src of sourceOrder) {
    const entry = group.sources[src];
    if (!entry) continue;

    const name = entry.name;

    // Match pattern like "8GB/256GB" or "16GB/1TB" or "16GB / 512GB" or "/16GB/512GB/" or "/16GB RAM/1TB/"
    const ramStorageMatch = name.match(
      /\b(\d+\s*GB)\s*(?:RAM)?\s*[\/,]\s*([\d.]+\s*[GT]B)\b/i,
    );
    if (ramStorageMatch) {
      return `${ramStorageMatch[1].replace(/\s+/g, "").toUpperCase()}/${ramStorageMatch[2].replace(/\s+/g, "").toUpperCase()}`;
    }

    // Match patterns like "/16GB/512GB/" or "/16GB RAM/1TB/"
    const slashMatch = name.match(/\/\d+\s*GB\s*(?:RAM)?\/([\d.]+\s*[GT]B)\b/i);
    if (slashMatch) return slashMatch[1].replace(/\s+/g, "").toUpperCase();

    // Match patterns like "16 GB, 512 GB" or "16 GB, 1 TB"
    const commaMatch = name.match(/\d+\s*GB\s*,\s*([\d.]+\s*[GT]B)\b/i);
    if (commaMatch) return commaMatch[1].replace(/\s+/g, "").toUpperCase();

    // Match patterns like "512GB SSD" or "1TB SSD"
    const ssdMatch = name.match(/([\d.]+\s*[GT]B)\s*SSD/i);
    if (ssdMatch) return ssdMatch[1].replace(/\s+/g, "").toUpperCase();

    // Single storage match like "512GB" or "1TB"
    const singleMatch = name.match(/\b([\d.]+\s*[GT]B)\b/i);
    if (singleMatch) return singleMatch[1].replace(/\s+/g, "").toUpperCase();
  }

  return null;
}

/**
 * Extract a "series key" from a macbook name.
 * e.g. "MacBook Air 13.6'' M5 MDHE4(Midnight)" → "MacBook Air 13.6'' M5"
 * This strips model code, color, parentheses, RAM/Storage, and trailing whitespace.
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

  if (cleaned.includes("/")) {
    const parts = cleaned.split("/").map((s) => s.trim());
    let base = parts[0];
    if (parts[1] && /^M\d/i.test(parts[1])) {
      base += ` ${parts[1]}`;
    }
    cleaned = base;
  }

  // Remove color in parentheses and any remaining parenthesized text
  cleaned = cleaned.replace(/\(.*?\)/g, "");
  cleaned = cleaned.replace(/^Apple\s+/i, "");

  // Remove RAM and Storage tokens (e.g. 8GB, 16GB, 24GB, 32GB, 64GB, 128GB, 256GB, 512GB, 1TB, 2TB, RAM, SSD)
  cleaned = cleaned.replace(/\b\d+\s*(GB|TB)\b/gi, "");
  cleaned = cleaned.replace(/\b(RAM|SSD)\b/gi, "");

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

export function buildMacbookComparisons(groups) {
  const sourceOrder = SOURCE_ORDER_BY_CATEGORY.macbooks;

  // ── Step 1: build per-code records ──────────────────────────────────────
  const perCodeResults = [];

  for (const [key, group] of groups) {
    const rs = group.sources["redstore"];
    const anchorCash = rs ? rs.cash_price : undefined;
    const anchorInstallment = rs ? rs.installment_price : undefined;
    const storage = extractStorageFromGroup(group);

    // Derive the series key from redstore's name when available, otherwise
    // fall back to any other source's name for this code.
    const sampleEntry = rs || Object.values(group.sources)[0];
    if (!sampleEntry) continue;
    const seriesKey = getMacbookSeriesKey(sampleEntry.name, group.code);

    const hasAnyCompetitor = sourceOrder.some(
      (source) => source !== "redstore" && group.sources[source],
    );

    perCodeResults.push({
      key: group.code || key, // model code e.g. "MDE04"
      seriesKey, // e.g. "MacBook Pro 14.2\" M5"
      storage, // e.g. "512GB"
      anchorCash,
      anchorInstallment,
      hasRS: !!rs,
      hasAnyCompetitor,
      group, // full group with sources
    });
  }

  // ── Step 2: group by series, then by storage+rsCash bucket ───────────────
  // Codes that share the same series + storage + RS price are color variants
  // → show them merged under one sub-header with all codes combined.
  const normalizeSeriesKeyForMatching = (key) =>
    key
      .toLowerCase()
      .replace(/["'’‘“”]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const seriesMap = new Map();
  for (const item of perCodeResults) {
    const matchKey = normalizeSeriesKeyForMatching(item.seriesKey);
    if (!seriesMap.has(matchKey)) seriesMap.set(matchKey, []);
    seriesMap.get(matchKey).push(item);
  }

  const results = [];

  for (const [, items] of seriesMap) {
    const anchorItems = items.filter((i) => i.hasRS);
    const orphanItems = items.filter((i) => !i.hasRS);

    // Display title always comes from redstore's own text (falls back to
    // any item's text if this series somehow has no redstore entry).
    const seriesKey = (anchorItems[0] ?? items[0]).seriesKey;

    // Sort by RS price ascending (cheapest storage tier first)
    anchorItems.sort((a, b) => (a.anchorCash ?? 0) - (b.anchorCash ?? 0));

    const buckets = new Map();
    for (const item of anchorItems) {
      const bucketKey = item.storage ?? "";
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey).push(item);
    }

    for (const orphan of orphanItems) {
      const bucketKey = orphan.storage ?? "";
      if (buckets.has(bucketKey)) {
        buckets.get(bucketKey).push(orphan);
      }
    }

    let seriesHasAlert = false;
    let anyCompetitorAcrossSeries = false;
    const allLines = [`*${seriesKey}*`];

    for (const [, bucket] of buckets) {
      // Aggregate: do any of these codes have a competitor?
      const bucketHasCompetitor = bucket.some((i) => i.hasAnyCompetitor);
      if (!bucketHasCompetitor) continue;

      anyCompetitorAcrossSeries = true;

      // Merged code label e.g. "[MDE04/MDE44]"
      const codes = bucket.map((i) => i.key).join("/");
      const storage = bucket[0].storage;
      const subHeader = storage ? `${storage} [${codes}]` : `[${codes}]`;
      allLines.push(`\n_${subHeader}_`);

      // RS prices come from any one of the bucket items (they're the same price)
      const anchorCash = bucket[0].anchorCash;
      const anchorInstallment = bucket[0].anchorInstallment;

      for (const source of sourceOrder) {
        const label = SOURCE_LABELS[source];
        if (!label) continue;

        const isAnchor = source === "redstore";

        if (isAnchor) {
          // RS: just show its price (taken from first bucket item)
          // Build aggregated sources for the bucket across all items
          const aggregatedSources = {};
          for (const s of sourceOrder) {
            const entries = bucket.map((i) => i.group.sources[s]).filter(Boolean);
            if (entries.length > 0) {
              entries.sort((a, b) => (a.cash_price ?? Infinity) - (b.cash_price ?? Infinity));
              aggregatedSources[s] = entries[0];
            }
          }

          const priceStr = formatPricePair(
            anchorCash,
            anchorInstallment,
            anchorCash,
            anchorInstallment,
            true,
            aggregatedSources,
            sourceOrder,
          );
          allLines.push(`${label} - ${priceStr}`);
          continue;
        }

        // Competitor: collect all entries across codes in this bucket,
        // then pick the minimum cash price (= cheapest color available).
        const competitorEntries = bucket
          .map((i) => i.group.sources[source])
          .filter(Boolean);

        if (competitorEntries.length === 0) {
          allLines.push(`${label} - ❌`);
          continue;
        }

        // Pick entry with lowest cash_price
        competitorEntries.sort(
          (a, b) => (a.cash_price ?? Infinity) - (b.cash_price ?? Infinity),
        );
        const bestEntry = competitorEntries[0];

        const priceStr = formatPricePair(
          bestEntry.cash_price,
          bestEntry.installment_price,
          anchorCash,
          anchorInstallment,
          false,
        );
        allLines.push(`${label} - ${priceStr}`);

        if (bestEntry.cash_price) {
          const flag = getFlag(anchorCash, bestEntry.cash_price);
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") seriesHasAlert = true;
        }
        if (bestEntry.installment_price) {
          const flag = getFlag(
            anchorInstallment ?? anchorCash,
            bestEntry.installment_price,
          );
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") seriesHasAlert = true;
        }
      }
    }

    const finalHasAlert = seriesHasAlert && anyCompetitorAcrossSeries;
    results.push({
      key: seriesKey,
      hasAlert: finalHasAlert,
      message: allLines.join("\n"),
    });
  }

  return results;
}

export function groupTvsByCode(products) {
  const redstoreProducts = products.filter((p) => p.source === "redstore");
  const otherProducts = products.filter((p) => p.source !== "redstore");

  const groups = new Map();

  for (const product of redstoreProducts) {
    const code = extractTvModelCode(product.name);
    if (!code) continue;

    if (!groups.has(code)) {
      groups.set(code, { normalized: code, code, sources: {} });
    }
    groups.get(code).sources["redstore"] = {
      name: product.name,
      cash_price: product.cash_price ?? null,
      installment_price: product.installment_price ?? null,
    };
  }

  for (const product of otherProducts) {
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

export function buildTvComparisons(groups) {
  const sourceOrder = SOURCE_ORDER_BY_CATEGORY.tvs;
  const results = [];

  for (const [key, group] of groups) {
    const rs = group.sources["redstore"];
    if (!rs) continue;

    const rsCash = rs.cash_price;
    const rsInstallment = rs.installment_price;

    let hasAlert = false;
    const lines = [];

    const displayName = rs.name
      .replace(/\(.*?\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    lines.push(`*${displayName} [${group.code}]*`);

    for (const source of sourceOrder) {
      const entry = group.sources[source];
      const label = SOURCE_LABELS[source];
      if (!label) continue;

      if (!entry) {
        lines.push(`${label} - ❌`);
        continue;
      }

      const isRS = source === "redstore";
      const priceStr = formatPricePair(
        entry.cash_price,
        entry.installment_price,
        rsCash,
        rsInstallment,
        isRS,
        group.sources,
        sourceOrder,
      );
      lines.push(`${label} - ${priceStr}`);

      if (!isRS) {
        if (entry.cash_price) {
          const flag = getFlag(rsCash, entry.cash_price);
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
        }
        if (entry.installment_price) {
          const flag = getFlag(
            rsInstallment ?? rsCash,
            entry.installment_price,
          );
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
        }
      }
    }

    const finalHasAlert = hasAlert && hasAnyCompetitorEntry(group.sources);
    results.push({
      key,
      hasAlert: finalHasAlert,
      message: lines.join("\n"),
    });
  }

  return results;
}

export function groupDysonByKey(products) {
  const groups = new Map();

  for (const product of products) {
    const key = extractDysonKey(product.name);
    if (!key) continue; // accessories/non-device products, e.g. "Display Stand"

    if (!groups.has(key)) {
      groups.set(key, { normalized: key, code: key, sources: {} });
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

export function buildDysonComparisons(groups) {
  const sourceOrder = SOURCE_ORDER_BY_CATEGORY.dyson;
  const results = [];

  for (const [key, group] of groups) {
    const rs = group.sources["redstore"];
    if (!rs) continue;

    const rsCash = rs.cash_price;
    const rsInstallment = rs.installment_price;

    let hasAlert = false;
    const lines = [];

    const displayName = rs.name.replace(/\s+/g, " ").trim();
    lines.push(`*${displayName}*`);

    for (const source of sourceOrder) {
      const entry = group.sources[source];
      const label = SOURCE_LABELS[source];
      if (!label) continue;

      if (!entry) {
        lines.push(`${label} - ❌`);
        continue;
      }

      const isRS = source === "redstore";
      const priceStr = formatPricePair(
        entry.cash_price,
        entry.installment_price,
        rsCash,
        rsInstallment,
        isRS,
        group.sources,
        sourceOrder,
      );
      lines.push(`${label} - ${priceStr}`);

      if (!isRS) {
        if (entry.cash_price) {
          const flag = getFlag(rsCash, entry.cash_price);
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
        }
        if (entry.installment_price) {
          const flag = getFlag(
            rsInstallment ?? rsCash,
            entry.installment_price,
          );
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
        }
      }
    }

    const finalHasAlert = hasAlert && hasAnyCompetitorEntry(group.sources);
    results.push({
      key,
      hasAlert: finalHasAlert,
      message: lines.join("\n"),
    });
  }

  return results;
}

export function groupGamingByName(products) {
  const groups = new Map();

  for (const product of products) {
    const key = normalizeGamingName(product.name);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, { normalized: key, sources: {} });
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

export function buildGamingComparisons(groups) {
  const sourceOrder = SOURCE_ORDER_BY_CATEGORY.gaming;
  const results = [];

  for (const [key, group] of groups) {
    const rs = group.sources["redstore"];
    if (!rs) continue;

    const rsCash = rs.cash_price;
    const rsInstallment = rs.installment_price;

    let hasAlert = false;
    const lines = [];

    lines.push(`*${rs.name.trim()}*`);

    for (const source of sourceOrder) {
      const entry = group.sources[source];
      const label = SOURCE_LABELS[source];
      if (!label) continue;

      if (!entry) {
        lines.push(`${label} - ❌`);
        continue;
      }

      const isRS = source === "redstore";
      const priceStr = formatPricePair(
        entry.cash_price,
        entry.installment_price,
        rsCash,
        rsInstallment,
        isRS,
        group.sources,
        sourceOrder,
      );
      lines.push(`${label} - ${priceStr}`);

      if (!isRS) {
        if (entry.cash_price) {
          const flag = getFlag(rsCash, entry.cash_price);
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
        }
        if (entry.installment_price) {
          const flag = getFlag(
            rsInstallment ?? rsCash,
            entry.installment_price,
          );
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
        }
      }
    }

    const finalHasAlert = hasAlert && hasAnyCompetitorEntry(group.sources);
    results.push({
      key,
      hasAlert: finalHasAlert,
      message: lines.join("\n"),
    });
  }

  return results;
}

export function groupACsByCode(products) {
  const groups = new Map();

  for (const product of products) {
    const code = extractACCode(product.name);
    if (!code) continue;
    const key = code;

    if (!groups.has(key)) {
      groups.set(key, { normalized: key, sources: {} });
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
      installation_price: product.installation_price ?? null,
    };
  }

  return groups;
}

export function buildACComparisons(groups) {
  const sourceOrder = SOURCE_ORDER_BY_CATEGORY.airconditioners;
  const results = [];

  for (const [key, group] of groups) {
    const rs = group.sources["redstore"];
    if (!rs) continue;

    const rsCash = rs.cash_price;
    const rsInstallment = rs.installment_price;

    let hasAlert = false;
    const lines = [];

    const displayName = rs.name.replace(/\s+/g, " ").trim();
    lines.push(`*${displayName}*`);

    for (const source of sourceOrder) {
      const entry = group.sources[source];
      const label = SOURCE_LABELS[source];
      if (!label) continue;

      if (!entry) {
        lines.push(`${label} - ❌`);
        continue;
      }

      const isRS = source === "redstore";
      const priceStr = formatPricePair(
        entry.cash_price,
        entry.installment_price,
        rsCash,
        rsInstallment,
        isRS,
        group.sources,
        sourceOrder,
      );
      lines.push(`${label} - ${priceStr}`);

      const installStr = formatInstallation(entry.installation_price);
      if (installStr) lines.push(`  + Տեղադրում՝ ${installStr}`);

      if (!isRS) {
        if (entry.cash_price) {
          const flag = getFlag(rsCash, entry.cash_price);
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
        }
        if (entry.installment_price) {
          const flag = getFlag(
            rsInstallment ?? rsCash,
            entry.installment_price,
          );
          if (flag === "‼️" || flag === "♦️" || flag === "🏷" || flag === "✅") hasAlert = true;
        }
      }
    }

    const finalHasAlert = hasAlert && hasAnyCompetitorEntry(group.sources);
    results.push({ key, hasAlert: finalHasAlert, message: lines.join("\n") });
  }

  return results;
}

// ─── Sorting / final message assembly ──────────────────────────────────────

const IPHONE_ORDER = [
  "iphone 13",
  "iphone 14",
  "iphone 15",
  "iphone 16",
  "iphone 17 air",
  "iphone air",
  "iphone 17e",
  "iphone 17",
  "iphone 17 pro",
  "iphone 17 pro max",
];
const SAMSUNG_ORDER = ["galaxy a", "galaxy s", "galaxy z"];

function getIphoneSortIndex(name) {
  const specificityOrder = [
    "iphone 17 pro max",
    "iphone 17 pro",
    "iphone 17 air",
    "iphone air",
    "iphone 17e",
    "iphone 17",
    "iphone 16",
    "iphone 15",
    "iphone 14",
    "iphone 13",
  ];
  const matched = specificityOrder.find((m) => name.includes(m));
  return matched ? IPHONE_ORDER.indexOf(matched) : 99;
}

export function getSortKey(message) {
  const name = message.toLowerCase();

  if (name.includes("iphone")) {
    const model = getIphoneSortIndex(name);
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

function getPhoneGroupKey(message) {
  const name = message.toLowerCase();

  // 1. iPhones: Group by generation series (e.g. 13 series, 14 series, 15 series, 16 series, 17 series incl. Air)
  if (name.includes("iphone")) {
    if (name.includes("iphone 17") || name.includes("iphone air") || /\b17\s*air\b/i.test(name))
      return "0_iphone_17";
    if (name.includes("iphone 16")) return "0_iphone_16";
    if (name.includes("iphone 15")) return "0_iphone_15";
    if (name.includes("iphone 14")) return "0_iphone_14";
    if (name.includes("iphone 13")) return "0_iphone_13";
    if (name.includes("iphone 12")) return "0_iphone_12";
    if (name.includes("iphone 11")) return "0_iphone_11";
    if (name.includes("iphone se")) return "0_iphone_se";
    return "0_iphone_other";
  }

  // 2. Samsung: S series in one message, Z series in one message, A series in one message
  if (name.includes("samsung") || name.includes("galaxy")) {
    if (name.includes("galaxy s")) return "1_samsung_s";
    if (
      name.includes("galaxy z") ||
      name.includes("fold") ||
      name.includes("flip")
    )
      return "1_samsung_z";
    if (name.includes("galaxy a")) return "1_samsung_a";
    return "1_samsung_other";
  }

  // 3. Xiaomi: Poco series in one message, Redmi series in one message, Note series in one message, others in one message
  if (
    name.includes("xiaomi") ||
    name.includes("redmi") ||
    name.includes("poco")
  ) {
    if (name.includes("poco")) return "2_xiaomi_poco";
    if (name.includes("note")) return "2_xiaomi_note";
    if (name.includes("redmi")) return "2_xiaomi_redmi";
    return "2_xiaomi_other";
  }

  // 4. Google Pixel: All in one message
  if (name.includes("google") || name.includes("pixel")) {
    return "3_google_pixel";
  }

  // 5. Other brands: One message per brand (Honor, OnePlus, Nothing, Asus, ZTE, etc.)
  const brands = [
    "honor",
    "oneplus",
    "nothing",
    "asus",
    "zte",
    "sony",
    "huawei",
    "oppo",
    "realme",
    "motorola",
    "nokia",
  ];
  for (const b of brands) {
    if (name.includes(b)) return `4_brand_${b}`;
  }

  return `5_other_${name.split("\n")[0]}`;
}

export function groupPhoneAlerts(phoneMessages) {
  const groups = new Map();

  for (const msg of phoneMessages) {
    const groupKey = getPhoneGroupKey(msg);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(msg);
  }

  const resultMessages = [];
  let counter = 1;

  for (const [groupKey, msgs] of groups) {
    if (msgs.length === 1) {
      resultMessages.push(`${counter}. ${msgs[0]}`);
    } else {
      const combined = msgs.map((m) => m.trim()).join("\n\n");
      resultMessages.push(`${counter}. ${combined}`);
    }
    counter++;
  }

  return resultMessages;
}

function getBrandGroupKey(category, message) {
  const name = message.toLowerCase();

  if (category === "watches") {
    if (/apple|i\s*watch/i.test(name)) return "apple";
    if (/samsung|galaxy/i.test(name)) return "samsung";
    if (/xiaomi/i.test(name)) return "xiaomi";
    return "other";
  }

  if (category === "headphones") {
    if (/airpods/i.test(name)) return "airpods";
    if (/beats/i.test(name)) return "beats";
    if (/marshall/i.test(name)) return "marshall";
    if (/sony/i.test(name)) return "sony";
    if (/jbl/i.test(name)) return "jbl";
    if (/bose/i.test(name)) return "bose";
    if (/belkin/i.test(name)) return "belkin";
    if (/logitech/i.test(name)) return "logitech";
    if (/oneplus/i.test(name)) return "oneplus";
    if (/nothing/i.test(name)) return "nothing";
    if (/xiaomi|redmi|poco/i.test(name)) return "xiaomi";
    if (/galaxy\s*buds|samsung/i.test(name)) return "galaxy buds";
    if (/buds/i.test(name)) return "galaxy buds";
    return "other";
  }

  if (category === "tablets") {
    if (/ipad/i.test(name)) return "ipad";
    if (/samsung|galaxy/i.test(name)) return "samsung";
    if (/xiaomi|redmi|poco/i.test(name)) return "xiaomi";
    if (/amazon|\bfire\b/i.test(name)) return "amazon";
    if (/remarkable/i.test(name)) return "remarkable";
    return "other";
  }

  if (category === "speakers") {
    if (/jbl/i.test(name)) return "jbl";
    if (/marshall/i.test(name)) return "marshall";
    if (/harman/i.test(name)) return "harman kard";
    if (/bose/i.test(name)) return "bose";
    if (/beats/i.test(name)) return "beats";
    if (/sony/i.test(name)) return "sony";
    if (/yandex|станция/i.test(name)) return "yandex";
    if (/xiaomi/i.test(name)) return "xiaomi";
    return "other";
  }

  if (category === "gaming") {
    if (/playstation|ps5|ps4/i.test(name)) return "playstation";
    if (/nintendo|switch/i.test(name)) return "nintendo";
    if (/xbox/i.test(name)) return "xbox";
    if (/meta|quest|oculus/i.test(name)) return "meta";
    if (/logitech/i.test(name)) return "logitech";
    if (/pxn/i.test(name)) return "pxn";
    if (/thrustmaster/i.test(name)) return "thrustmaster";
    if (/hori/i.test(name)) return "hori";
    return "other";
  }

  if (category === "dyson") {
    return "dyson";
  }

  return message;
}

export function groupCategoryAlertsByBrand(category, messages) {
  const grouped = new Map();

  for (const msg of messages) {
    const key = getBrandGroupKey(category, msg);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(msg);
  }

  const order = {
    watches: ["apple", "samsung", "xiaomi", "other"],
    tablets: ["ipad", "samsung", "xiaomi", "amazon", "remarkable", "other"],
    headphones: [
      "airpods",
      "galaxy buds",
      "marshall",
      "sony",
      "xiaomi",
      "oneplus",
      "nothing",
      "logitech",
      "jbl",
      "bose",
      "belkin",
      "beats",
      "other",
    ],
    speakers: [
      "jbl",
      "marshall",
      "harman kard",
      "bose",
      "beats",
      "sony",
      "yandex",
      "xiaomi",
      "other",
    ],
    gaming: [
      "playstation",
      "nintendo",
      "xbox",
      "meta",
      "logitech",
      "pxn",
      "thrustmaster",
      "hori",
      "other",
    ],
    dyson: ["dyson"],
  }[category];

  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
    if (!order) return a.localeCompare(b);
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== bi) {
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
    }
    return a.localeCompare(b);
  });

  const resultMessages = [];
  let counter = 1;

  for (const key of sortedKeys) {
    const msgs = grouped.get(key);
    if (msgs.length === 1) {
      resultMessages.push(`${counter}. ${msgs[0]}`);
    } else {
      const combined = msgs.map((m) => m.trim()).join("\n\n");
      resultMessages.push(`${counter}. ${combined}`);
    }
    counter++;
  }

  return resultMessages;
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
    speakers: [],
    tvs: [],
    dyson: [],
    gaming: [],
    airconditioners: [],
  };

  for (const item of alerts) {
    const category = detectCategory(item.message);
    buckets[category].push(item.message);
  }

  return {
    phones: groupPhoneAlerts(buckets.phones),
    tablets: groupCategoryAlertsByBrand("tablets", buckets.tablets),
    watches: groupCategoryAlertsByBrand("watches", buckets.watches),
    headphones: groupCategoryAlertsByBrand("headphones", buckets.headphones),
    macbooks: buckets.macbooks.map((msg, i) => `${i + 1}. ${msg}`),
    speakers: groupCategoryAlertsByBrand("speakers", buckets.speakers),
    tvs: buckets.tvs.map((msg, i) => `${i + 1}. ${msg}`),
    dyson: groupCategoryAlertsByBrand("dyson", buckets.dyson),
    gaming: groupCategoryAlertsByBrand("gaming", buckets.gaming),
    airconditioners: buckets.airconditioners.map(
      (msg, i) => `${i + 1}. ${msg}`,
    ),
  };
}

/**
 * Full pipeline: splits products into macbooks (code-matched) vs.
 * everything else (name-matched), builds comparisons for each, merges,
 * then splits into per-category alert lists.
 */
export function runComparison(allProducts) {
  const macbookProducts = allProducts.filter((p) => MACBOOK_REGEX.test(p.name));
  const tvProducts = allProducts.filter(
    (p) => TV_REGEX.test(p.name) && !MACBOOK_REGEX.test(p.name),
  );
  const dysonProducts = allProducts.filter(
    (p) =>
      /\bdyson\b/i.test(p.name) &&
      !MACBOOK_REGEX.test(p.name) &&
      !TV_REGEX.test(p.name),
  );
  const gamingProducts = allProducts.filter(
    (p) =>
      GAMING_REGEX.test(p.name) &&
      !MACBOOK_REGEX.test(p.name) &&
      !TV_REGEX.test(p.name) &&
      !/\bdyson\b/i.test(p.name),
  );

  const acProducts = allProducts.filter(
    (p) =>
      (AC_REGEX.test(p.name) || p.installation_price !== undefined) &&
      !MACBOOK_REGEX.test(p.name) &&
      !TV_REGEX.test(p.name) &&
      !/\bdyson\b/i.test(p.name) &&
      !GAMING_REGEX.test(p.name),
  );

  const remaining = allProducts.filter(
    (p) =>
      !MACBOOK_REGEX.test(p.name) &&
      !TV_REGEX.test(p.name) &&
      !/\bdyson\b/i.test(p.name) &&
      !GAMING_REGEX.test(p.name) &&
      !(AC_REGEX.test(p.name) || p.installation_price !== undefined),
  );

  const byCategory = {
    phones: [],
    tablets: [],
    watches: [],
    headphones: [],
    speakers: [],
  };
  for (const p of remaining) {
    const cat = detectCategory(p.name);
    (byCategory[cat] || byCategory.phones).push(p);
  }

  let otherComparisons = [];
  for (const [cat, products] of Object.entries(byCategory)) {
    const groups = groupByNormalizedName(products);
    otherComparisons = otherComparisons.concat(buildComparisons(groups, cat));
  }

  const macbookComparisons = buildMacbookComparisons(
    groupMacbooksByCode(macbookProducts),
  );
  const tvComparisons = buildTvComparisons(groupTvsByCode(tvProducts));
  const dysonComparisons = buildDysonComparisons(
    groupDysonByKey(dysonProducts),
  );
  const gamingComparisons = buildGamingComparisons(
    groupGamingByName(gamingProducts),
  );
  const acComparisons = buildACComparisons(groupACsByCode(acProducts));

  const allComparisons = [
    ...otherComparisons,
    ...macbookComparisons,
    ...tvComparisons,
    ...dysonComparisons,
    ...gamingComparisons,
    ...acComparisons,
  ];
  return splitAlertsByCategory(allComparisons);
}
