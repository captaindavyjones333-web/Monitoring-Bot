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

function normalize(raw) {
  const simAttr = raw.attributes?.find((a) => a.attribute_id === 19);
  const simValue = simAttr?.attribute_value || "";

  let simSuffix = "";
  const s = simValue.toLowerCase();
  if (
    s.includes("esim") &&
    !s.includes("nano") &&
    !s.includes("sim +") &&
    !s.includes("+ esim") &&
    !s.includes("1 sim")
  ) {
    simSuffix = " eSim";
  } else if (
    s.includes("1 sim + esim") ||
    s.includes("sim + esim") ||
    s.includes("nano")
  ) {
    simSuffix = " Nano-Sim";
  } else if (s.includes("2 esim") || s.includes("dual esim")) {
    simSuffix = " Dual eSim";
  }

  const rawName = raw.name;
  const productName =
    simSuffix &&
    !rawName.toLowerCase().includes("esim") &&
    !rawName.toLowerCase().includes("nano")
      ? `${rawName}${simSuffix}`
      : rawName;

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
