import { fetchAllBrands } from "./client.js";

const BRAND_IDS = {
  apple: 294,
  samsung: 295,
  xiaomi: 296,
};

function normalize(raw) {
  return {
    name: raw.name.replace(/\s+/g, " ").trim(),
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreWatches() {
  return fetchAllBrands("watches", BRAND_IDS, normalize);
}