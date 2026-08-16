import { parseRam, parseStorage, parseScreenInches, parseRefreshRateHz } from './specParsers.js';

export const ATTRIBUTE_ID_MAP = {
  8: 'cpu',
  1: 'screen_inches',
  9: 'screen_resolution',
  10: 'refresh_rate_hz',
  6: 'ram_gb',
  4: 'storage_gb',
  15: 'touch_screen',
  12: 'gpu',
  20: 'year',
  24: 'screen_type',
};

export const BRAND_LIST = [
  { id: 295, name: 'Samsung' },
  { id: 296, name: 'Xiaomi' },
  { id: 297, name: 'DELL' },
  { id: 298, name: 'HP' },
  { id: 299, name: 'Lenovo' },
  { id: 301, name: 'Acer' },
  { id: 310, name: 'Asus' },
  { id: 355, name: 'Microsoft' },
  { id: 370, name: 'MSI' },
];

// { Samsung: 295, Xiaomi: 296, ... } — ready to pass into fetchAllBrands()
export const BRAND_IDS = Object.fromEntries(
  BRAND_LIST.map((b) => [b.name, b.id])
);

// Longest-name-first, for defensive substring matching against product names.
const BRAND_NAMES_SORTED = [...BRAND_LIST]
  .map((b) => b.name)
  .sort((a, b) => b.length - a.length);

/**
 * Given a product's `attributes` array (attribute_id, attribute_value, ...),
 * returns a flat object keyed by canonical field name.
 */
export function mapAttributes(attributesArr = []) {
  const out = {};
  for (const attr of attributesArr) {
    const key = ATTRIBUTE_ID_MAP[attr.attribute_id];
    if (!key) continue;
    out[key] = attr.attribute_value ?? attr.attribute_value_id ?? null;
  }

  // redstore sends these combined, e.g. "8GB DDR4", "256GB SSD" — split
  // into number+type so the shape matches other stores (notebookcentre etc.)
  if (out.ram_gb) {
    const { ram_gb, ram_type } = parseRam(out.ram_gb);
    out.ram_gb = ram_gb;
    if (ram_type) out.ram_type = ram_type;
  }
  if (out.storage_gb) {
    const { storage_gb, storage_type } = parseStorage(out.storage_gb);
    out.storage_gb = storage_gb;
    if (storage_type) out.storage_type = storage_type;
  }

  // redstore sends these as raw strings ("15.6\"", "60") — parse to
  // numbers so they compare equal to notebookcentre's already-numeric output
  if (out.screen_inches !== undefined) {
    out.screen_inches = parseScreenInches(out.screen_inches);
  }
  if (out.refresh_rate_hz !== undefined) {
    out.refresh_rate_hz = parseRefreshRateHz(out.refresh_rate_hz);
  }

  return out;
}

/**
 * fetchAllBrands() calls normalize(raw) without telling us which brand
 * batch the product came from, so we still need to resolve brand from
 * the product itself:
 * 1. an attribute literally named "Brand", if the API ever sends one
 * 2. fallback: match product name against the known brand list
 */
export function detectBrand(productName = '', attributesArr = []) {
  const brandAttr = attributesArr.find(
    (a) => (a.attribute_name || '').trim().toLowerCase() === 'brand'
  );
  if (brandAttr?.attribute_value) return brandAttr.attribute_value.trim();

  const nameLower = productName.toLowerCase();
  for (const brand of BRAND_NAMES_SORTED) {
    if (nameLower.includes(brand.toLowerCase())) return brand;
  }
  return null;
}