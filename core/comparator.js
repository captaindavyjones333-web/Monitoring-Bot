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
} from "./categoryDetector.js";
import { extractModelCode } from "./modelCode.js";
import { extractTvModelCode } from "./tvModelCode.js";
import { extractDysonKey } from "./dysonModelCode.js";
import { normalizeGamingName } from "./gamingNormalizer.js";

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
  eldorado: "Eldorado",
  zigzag: "Zigzag",
};

const SOURCE_ORDER_BY_CATEGORY = {
  phones: ["redstore", "yerevanmobile", "mobilecentre", "allsell", "3dplanet"],
  tablets: ["redstore", "yerevanmobile", "mobilecentre", "allsell", "3dplanet"],
  watches: ["redstore", "yerevanmobile", "mobilecentre", "allsell", "3dplanet"],
  headphones: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "3dplanet",
  ],
  speakers: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "3dplanet",
    "eldorado",
  ],
  macbooks: [
    "redstore",
    "yerevanmobile",
    "mobilecentre",
    "allsell",
    "icentre",
    "ispace",
  ],
  tvs: ["redstore", "yerevanmobile", "mobilecentre", "allsell"],
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
};

/**
 * True if at least one non-redstore source has a real entry in this
 * group's sources. Used as a final gate before treating any comparison
 * as alert-worthy — a group where every competitor is "Առկա չէ" must
 * never generate an alert, regardless of how hasAlert was computed.
 */
function hasAnyCompetitorEntry(sources) {
  return Object.keys(sources).some(
    (source) => source !== "redstore" && sources[source],
  );
}

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

  const cashStr = cash
    ? cashMatch
      ? "Նույնն է"
      : `${cashFlag}${fmt(cash)}`
    : "—";
  const instStr = effectiveInstallment
    ? installmentMatch
      ? "Նույնն է"
      : `${instFlag}${fmt(effectiveInstallment)}`
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

export function buildComparisons(groups, category) {
  const buckets = new Map();
  const sourceOrder = SOURCE_ORDER_BY_CATEGORY[category];

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
    let anyCompetitorAcrossAllTiers = false; // NEW
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
    const slashMatch = name.match(/\/\d+\s*GB\s*(?:RAM)?\/([\d.]+\s*[GT]B)\b/i);
    if (slashMatch) return slashMatch[1].replace(/\s+/g, "").toUpperCase();

    // Match patterns like "16 GB, 512 GB" or "16 GB, 1 TB"
    const commaMatch = name.match(/\d+\s*GB\s*,\s*([\d.]+\s*[GT]B)\b/i);
    if (commaMatch) return commaMatch[1].replace(/\s+/g, "").toUpperCase();

    // Match patterns like "512GB SSD" or "1TB SSD"
    const ssdMatch = name.match(/([\d.]+\s*[GT]B)\s*SSD/i);
    if (ssdMatch) return ssdMatch[1].replace(/\s+/g, "").toUpperCase();

    // Match patterns like "8GB/256GB" (without leading slash)
    const ramStorageMatch = name.match(/\b\d+\s*GB\s*\/\s*([\d.]+\s*[GT]B)\b/i);
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
  const sourceOrder = SOURCE_ORDER_BY_CATEGORY.macbooks;
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

    for (const source of sourceOrder) {
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

    const hasAnyCompetitor = sourceOrder.some(
      (source) => source !== "redstore" && group.sources[source],
    );

    perCodeResults.push({
      key,
      seriesKey,
      storage,
      hasAlert,
      hasAnyCompetitor,
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
    items.sort((a, b) => (a.rsCash ?? 0) - (b.rsCash ?? 0));

    const hasAlert = items.some((item) => item.hasAlert);
    const anyCompetitorAcrossItems = items.some((item) => item.hasAnyCompetitor);
    const allLines = [`*${seriesKey}*`];

    for (const item of items) {
      if (!item.hasAnyCompetitor) continue;
      allLines.push(...item.lines);
    }

    const finalHasAlert = hasAlert && anyCompetitorAcrossItems;
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

    const finalHasAlert = hasAlert && hasAnyCompetitorEntry(group.sources);
    results.push({
      key,
      hasAlert: finalHasAlert,
      message: lines.join("\n"),
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
    speakers: [],
    tvs: [],
    dyson: [],
    gaming: [],
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
    speakers: buckets.speakers.map((msg, i) => `${i + 1}. ${msg}`),
    tvs: buckets.tvs.map((msg, i) => `${i + 1}. ${msg}`),
    dyson: buckets.dyson.map((msg, i) => `${i + 1}. ${msg}`),
    gaming: buckets.gaming.map((msg, i) => `${i + 1}. ${msg}`),
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

  const remaining = allProducts.filter(
    (p) =>
      !MACBOOK_REGEX.test(p.name) &&
      !TV_REGEX.test(p.name) &&
      !/\bdyson\b/i.test(p.name) &&
      !GAMING_REGEX.test(p.name),
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

  const allComparisons = [
    ...otherComparisons,
    ...macbookComparisons,
    ...tvComparisons,
    ...dysonComparisons,
    ...gamingComparisons,
  ];
  return splitAlertsByCategory(allComparisons);
}
