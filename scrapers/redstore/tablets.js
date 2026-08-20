import { fetchAllBrands } from "./client.js";

// VERIFY: same brand_id values as phones — check network tab on the
// tablets category page to confirm these IDs actually apply here.
const BRAND_IDS = {
  apple: 294,
  samsung: 295,
  xiaomi: 296,
  amazon: 512,
  remarkable: 513,
};

// Attribute IDs observed to carry the chip name for tablets (e.g. "Apple M5",
// "Apple M4"). Titles sometimes omit the chip entirely, so we backfill it
// from whichever of these attributes is present, in this priority order.
const CHIP_ATTRIBUTE_IDS = [426, 425, 423, 427, 3205];

function getConnectivitySuffix(simValue) {
  const s = simValue.trim().toLowerCase();

  switch (s) {
    case "2 sim":
      return " Dual-Sim";
    case "1 sim + esim":
      return " Nano-Sim";
    case "1 sim":
      return " LTE";
    default:
      console.warn(
        `[redstore/tablets] No connectivity suffix applied for: "${simValue}"`,
      );
      return "";
  }
}

// Pulls the chip name (e.g. "M5", "M4", "M2 Pro") out of one of the known
// chip attributes, stripping the leading "Apple" word since the title
// already establishes the brand.
function getChipName(raw) {
  for (const attrId of CHIP_ATTRIBUTE_IDS) {
    const attr = raw.attributes?.find((a) => a.attribute_value_id === attrId);
    const value = attr?.attribute_value?.trim();
    if (value) {
      const chip = value.replace(/\bapple\b/gi, "").replace(/\s+/g, " ").trim();
      if (chip) return chip;
    }
  }
  return null;
}

// Checks whether the chip name is already present somewhere in the title,
// so we don't duplicate it (e.g. title already says "iPad Pro M5").
function titleHasChip(title, chip) {
  const escaped = chip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "i");
  return pattern.test(title);
}

function normalize(raw) {
  const simAttr = raw.attributes?.find((a) => a.attribute_id === 19);
  const simValue = simAttr?.attribute_value || "";
  const suffix = getConnectivitySuffix(simValue);

  let cleanedName = raw.name;

  // Only strip/rebuild SIM-MECHANISM wording (nano-sim / dual-sim / esim
  // phrasing) — never touch "5G"/"LTE"/"Wi-Fi" here. Those describe
  // network generation, which comes from the title itself, a completely
  // separate axis this attribute doesn't tell us anything about.
  if (suffix) {
    cleanedName = cleanedName
      .replace(/\b\d?\s*sim\s*\+\s*e[\s-]?sim\b/gi, "")
      .replace(/\bnano[\s-]?sim\b/gi, "")
      .replace(/\bdual[\s-]?sim\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Backfill the chip name if it's missing from the title.
  const chip = getChipName(raw);
  if (chip && !titleHasChip(cleanedName, chip)) {
    cleanedName = `${cleanedName} ${chip}`.replace(/\s+/g, " ").trim();
  }

  const productName = suffix ? `${cleanedName}${suffix}` : cleanedName;

  return {
    name: productName,
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
    category: "tablets",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreTablets() {
  return fetchAllBrands("tablets", BRAND_IDS, normalize);
}