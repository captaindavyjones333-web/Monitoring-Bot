import { fetchAllBrands } from "./client.js";

const BRAND_IDS = {
  apple: 294,
};
const RAM_ATTR_ID = 6;
const STORAGE_ATTR_ID = 4;

function parseMemoryValue(valueStr) {
  if (!valueStr) return null;

  const match = valueStr.match(/(\d+(?:\.\d+)?)\s*(GB|TB)/i);
  if (!match) return null;

  return {
    amount: parseFloat(match[1]),
    unit: match[2].toUpperCase(),
  };
}

function getAttributeValue(attributes, attributeValueId) {
  if (!Array.isArray(attributes)) return null;
  const attr = attributes.find(
    (a) => a.attribute_id === attributeValueId,
  );
  return attr ? attr.attribute_value : null;
}

function buildRamStorageSuffix(attributes) {
  const ram = parseMemoryValue(getAttributeValue(attributes, RAM_ATTR_ID));
  const storage = parseMemoryValue(
    getAttributeValue(attributes, STORAGE_ATTR_ID),
  );

  if (!ram || !storage) return null;

  return `${ram.amount}GB/${storage.amount}${storage.unit}`;
}

function normalize(raw) {
  const baseName = raw.name.replace(/\s+/g, " ").trim();
  const suffix = buildRamStorageSuffix(raw.attributes);

  const name =
    suffix && !baseName.includes(suffix) ? `${baseName} ${suffix}` : baseName;

  return {
    name,
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
    category: "macbooks",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreMacbooks() {
  return fetchAllBrands("notebooks", BRAND_IDS, normalize);
}
