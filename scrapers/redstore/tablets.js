import { fetchAllBrands } from "./client.js";

// VERIFY: same brand_id values as phones — check network tab on the
// tablets category page to confirm these IDs actually apply here.
const BRAND_IDS = {
  apple: 294,
  samsung: 295,
  xiaomi: 296,
};

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

  const productName = suffix ? `${cleanedName}${suffix}` : cleanedName;

  return {
    name: productName,
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
  };
}

export async function scrapeRedstoreTablets() {
  return fetchAllBrands("tablets", BRAND_IDS, normalize);
}
