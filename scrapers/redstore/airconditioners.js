import { fetchAllBrands } from "./client.js";

const BRAND_IDS = {
  brand_295: 295,
  brand_326: 326,
  brand_345: 345,
};

function getInstallationPrice(raw) {
  const attr = raw.attributes?.find((a) => a.attribute_id === 184);
  if (!attr) return null;
  const value = parseFloat(String(attr.attribute_value).replace(/[^\d.]/g, ""));
  if (isNaN(value)) return null;
  return value > 18000 ? 30000 : 25000;
}

function normalize(raw) {
  return {
    name: raw.name.replace(/\s+/g, " ").trim(),
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    installation_price: getInstallationPrice(raw),
    source: "redstore",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreAirConditioners() {
  return fetchAllBrands("air-conditioners", BRAND_IDS, normalize);
}