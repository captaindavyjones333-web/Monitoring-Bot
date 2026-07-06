import axios from "axios";
import { saveCache, markUpdated } from "../core/cache_manager.js";

const BASE_URL =
  "https://admin.redstore.am/api/v1/catalog/smartphones/category";

const BRAND_IDS = {
  apple: 294,
  samsung: 295,
  xiaomi: 296,
  google: 352,
  oneplus: 304,
  nothing: 478,
};

async function fetchBrand(brandId) {
  const firstRes = await axios.get(BASE_URL, {
    params: { view: "all", "brand_id[]": brandId, page: 1 },
  });

  const { last_page, data: firstPage } = firstRes.data.data.products;

  if (last_page === 1) return firstPage;

  const rest = await Promise.all(
    Array.from({ length: last_page - 1 }, (_, i) =>
      axios
        .get(BASE_URL, {
          params: { view: "all", "brand_id[]": brandId, page: i + 2 },
        })
        .then((r) => r.data.data.products.data),
    ),
  );

  return [...firstPage, ...rest.flat()];
}

function getSimSuffix(simValue) {
  const s = simValue.trim().toLowerCase();

  switch (s) {
    case "2 esim":
      return " Dual eSim";
    case "1 sim + esim":
      return " Nano-Sim";
    case "2 sim":
      return " Dual-Sim";
    case "1 sim":
      return ""; // base/default variant, no suffix
    case "without sim card capability":
      return " eSim"; // eSIM-only, no physical SIM slot
    default:
      console.warn(`[redstore] Unrecognized SIM value: "${simValue}"`);
      return "";
  }
}

function normalize(raw) {
  const simAttr = raw.attributes?.find((a) => a.attribute_id === 19);
  const simValue = simAttr?.attribute_value || "";
  const simSuffix = getSimSuffix(simValue);

  // Strip any generic SIM wording from the raw title — it's often vague
  // ("eSim") and doesn't reliably reflect the real variant. We rebuild
  // the SIM portion from the canonical attribute instead.
  const rawName = raw.name;
  const cleanedName = rawName
    .replace(/\b(?:dual\s+)?e[\s-]?sim\b/gi, "")
    .replace(/\b\d?\s*sim\s*\+\s*e[\s-]?sim\b/gi, "")
    .replace(/\bnano[\s-]?sim\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const productName = simSuffix ? `${cleanedName}${simSuffix}` : cleanedName;

  return {
    name: productName,
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
  };
}

export async function scrapeRedstore() {
  const results = [];

  for (const [brand, id] of Object.entries(BRAND_IDS)) {
    try {
      const products = await fetchBrand(id);
      results.push(...products.map(normalize));
    } catch (err) {
      console.error(`Redstore: failed to fetch brand ${brand}:`, err.message);
    }
  }

  return results;
}
