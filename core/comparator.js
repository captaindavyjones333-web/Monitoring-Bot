import { normalizeName, groupByNormalizedName } from "./normalizer.js";

const THRESHOLD_FLAT = 3000; // 3000 AMD flat threshold
const THRESHOLD_PERCENT = 0.1; // 10% threshold

const SOURCE_LABELS = {
  redstore: "RS",
  yerevanmobile: "YM",
  mobilecentre: "Mobile",
  allsell: "Allsell",
  "3dplanet": "3D",
};

// Source display order in the message (Redstore always first)
const SOURCE_ORDER = [
  "redstore",
  "yerevanmobile",
  "mobilecentre",
  "allsell",
  "3dplanet",
];

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Determine if a competitor price needs a flag vs Redstore price.
 *
 * ✅ = competitor is cheaper OR within threshold (flat 3000 OR 10% of RS price)
 * ❗ = competitor is more than threshold cheaper than RS (RS is overpriced)
 *
 * Per spec:
 *   ✅ if competitor_price >= rs_price - threshold   (RS is competitive)
 *   ❗ if competitor_price < rs_price - threshold    (RS is too expensive)
 *
 * @param {number} rsPrice         - Redstore price
 * @param {number} competitorPrice - Other store price
 * @returns {"✅"|"❗"|""}
 */
function getFlag(rsPrice, competitorPrice) {
  if (!rsPrice || !competitorPrice) return "";

  const diff = rsPrice - competitorPrice; // positive = RS is more expensive

  // ❗ if RS is more expensive by more than threshold
  if (diff > THRESHOLD_FLAT || diff > rsPrice * THRESHOLD_PERCENT) return "❗";

  // ✅ otherwise (RS is cheaper or within threshold)
  return "✅";
}

/**
 * Format a price pair (cash / installment) with flags.
 * @param {number|null} cash
 * @param {number|null} installment
 * @param {number|null} rsCash
 * @param {number|null} rsInstallment
 * @param {boolean} isRedstore
 * @returns {string}  e.g. "✅359.000 - ✅379.000"
 */
function formatPricePair(cash, installment, rsCash, rsInstallment, isRedstore) {
  const fmt = (n) => (n ? n.toLocaleString("ru-RU").replace(/,/g, " ") : "—");

  // If no installment price, use cash price as installment
  const effectiveInstallment = installment ?? cash;

  if (isRedstore) {
    const parts = [fmt(cash)];
    if (effectiveInstallment) parts.push(fmt(effectiveInstallment));
    return parts.join(" - ");
  }

  // Check if prices exactly match Redstore
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

// ─── Build comparison report ──────────────────────────────────────────────────

/**
 * Compare all grouped products and return alert items.
 *
 * @param {Map} groups - output of groupByNormalizedName()
 * @returns {Array<{ key, hasAlert, message }>}
 */
export function buildComparisons(groups) {
  const results = [];

  for (const [key, group] of groups) {
    const rs = group.sources["redstore"];

    // Skip products not listed on Redstore (nothing to compare against)
    if (!rs) continue;

    const rsCash = rs.cash_price;
    const rsInstallment = rs.installment_price;

    let hasAlert = false;
    const lines = [];

    const displayName = rs.name
      .replace(
        /\b(Midnight|Starlight|Blue|Black|White|Red|Green|Yellow|Purple|Pink|Gold|Silver|Titanium|Natural|Desert|Ultramarine|Teal|Coral|Graphite|Alpine|Storm|Clay|Lavender|Mint|Sage|Cosmic Orange|Deep Blue|Sierra Blue|Space Gray|Space Grey|Deep Purple|Product Red|Sky Blue|Desert Titanium|Black Titanium|White Titanium|Natural Titanium|Rose Gold|Mocha|Brown|Navy|Orange)\b/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();

    lines.push(`*${displayName}*`);

    for (const source of SOURCE_ORDER) {
      const entry = group.sources[source];
      const label = SOURCE_LABELS[source];

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

      // Check if any competitor triggered ❗
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

    results.push({
      key,
      hasAlert,
      message: lines.join("\n"),
    });
  }

  return results;
}

/**
 * Filter to only alert items and format as numbered list.
 * @param {Array} comparisons - output of buildComparisons()
 * @returns {string[]} array of formatted Telegram messages, one per product
 */

const BRAND_ORDER = [
  "iphone",
  "samsung",
  "xiaomi",
  "poco",
  "redmi",
  "google",
  "pixel",
  "oneplus",
  "nothing",
];

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

  // iPhone ordering
  if (name.includes("iphone")) {
    const model = IPHONE_ORDER.findIndex((m) => name.includes(m));
    return `0_${model >= 0 ? model : 99}_${name}`;
  }

  // Samsung ordering
  if (name.includes("samsung")) {
    const series = SAMSUNG_ORDER.findIndex((s) => name.includes(s));
    return `1_${series >= 0 ? series : 99}_${name}`;
  }

  // Xiaomi ordering
  if (
    name.includes("xiaomi") ||
    name.includes("poco") ||
    name.includes("redmi")
  ) {
    return `2_${name}`;
  }

  // Google Pixel
  if (name.includes("google") || name.includes("pixel")) {
    return `3_${name}`;
  }

  // OnePlus
  if (name.includes("oneplus")) {
    return `4_${name}`;
  }

  // Nothing
  if (name.includes("nothing")) {
    return `5_${name}`;
  }

  return `6_${name}`;
}

export function getAlertMessages(comparisons) {
  const alerts = comparisons.filter((c) => c.hasAlert);

  // Sort by brand and model order
  alerts.sort((a, b) => {
    const keyA = getSortKey(a.message);
    const keyB = getSortKey(b.message);
    return keyA.localeCompare(keyB);
  });

  return alerts.map((item, i) => `${i + 1}. ${item.message}`);
}

/**
 * Full pipeline: takes raw product array → returns alert messages.
 * @param {Array} allProducts
 * @returns {string[]}
 */
export function runComparison(allProducts) {
  const groups = groupByNormalizedName(allProducts);
  const comparisons = buildComparisons(groups);
  return getAlertMessages(comparisons);
}
