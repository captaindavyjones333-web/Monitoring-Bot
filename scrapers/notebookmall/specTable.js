// Shared by parseListing.js and parseDetail.js — notebookmall (WoodMart/
// WooCommerce) renders the exact same `table.shop_attributes` markup both
// in a product card's hover panel on the listing page and on the product's
// own detail page, so both can reuse this parser.

const LABEL_MAP = {
  'Ապրանքանիշ': 'brand_raw', // Brand
  'Մոդել': 'model', // Model — not part of the shared cache schema, dropped later
  'Պրոցեսոր (CPU)': 'cpu', // Processor
  'Հիշ․ ծավալ': 'ram_raw', // RAM, e.g. "8GB DDR 4"
  'Պահպանման տարողունակություն': 'storage_raw', // Storage, e.g. "256GB M.2 Nvme"
  'Տեսաքարտ': 'gpu', // Graphics card
  'Էկրանի չափ': 'screen_inches_raw', // Screen size, e.g. 15.6"
  'Կետայնություն': 'screen_resolution', // Resolution, e.g. "FHD (1920x1080)"
  'Էկրանի հաճախականություն': 'refresh_rate_hz_raw', // Refresh rate, e.g. "60Hz"
  'Էկրանի տեսակը': 'screen_type_raw', // Display type — multi-value, may include "Touch"
  'Գույն': 'color', // Color
  'Օպերացիոն համակարգ': 'os', // OS
  'Ստեղնաշար': 'keyboard_raw', // Keyboard, e.g. "Backlit"
  'Երաշխիք': 'warranty_raw', // Warranty, e.g. "12 months"
  'Քաշ': 'weight_raw', // Weight, e.g. "1.63 kg"
};

function cleanText(t = '') {
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Parses a WooCommerce `table.shop_attributes` element into a raw
 * label -> value map. Multi-value attributes (e.g. "Display type":
 * ["Tandem OLED", "Touch"]) come back as arrays, single-value ones as
 * strings. Returns {} if no table is present (caller decides what to do).
 */
export function parseSpecsTable($, table) {
  const raw = {};
  if (!table || table.length === 0) return raw;

  table.find('tr.woocommerce-product-attributes-item').each((_, row) => {
    const tr = $(row);
    const label = cleanText(tr.find('.wd-attr-name-label').first().text());
    if (!label) return;

    const terms = tr
      .find('.woocommerce-product-attributes-item__value .wd-attr-term')
      .map((__, t) => cleanText($(t).text()))
      .get()
      .filter(Boolean);

    if (terms.length === 0) return;
    raw[label] = terms.length === 1 ? terms[0] : terms;
  });

  return raw;
}

function parseRamRaw(text) {
  const gbMatch = text.match(/(\d+)\s*GB/i);
  const typeMatch = text.match(/DDR\s?\d/i);
  return {
    ram_gb: gbMatch ? Number(gbMatch[1]) : null,
    ram_type: typeMatch ? typeMatch[0].replace(/\s+/, '').toUpperCase() : null,
  };
}

function parseStorageRaw(text) {
  const m = text.match(/([\d.]+)\s*(GB|TB)/i);
  if (!m) return { storage_gb: null, storage_type: null };
  const storage_gb = m[2].toUpperCase() === 'TB' ? Number(m[1]) * 1024 : Number(m[1]);
  let storage_type = null;
  if (/hdd/i.test(text)) storage_type = 'HDD';
  else if (/ssd|nvme|m\.2/i.test(text)) storage_type = 'SSD';
  return { storage_gb, storage_type };
}

function parseWeightRaw(text) {
  const m = text.replace(',', '.').match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function parseWarrantyRaw(text) {
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseScreenInchesRaw(text) {
  const m = String(text).match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function parseRefreshRateRaw(text) {
  const m = String(text).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * @param {object} raw - output of parseSpecsTable()
 * @returns {{ specs: object, brandRaw: string|null }} - specs normalized
 *   to the same field names used by the notebookcentre/redstore scrapers,
 *   so matcherV2 can compare products across stores. brandRaw is returned
 *   separately since brand lives at the top level of the cache record, not
 *   inside `specs`.
 */
export function normalizeSpecs(raw) {
  const out = {};

  for (const [label, value] of Object.entries(raw)) {
    const key = LABEL_MAP[label];
    if (!key) {
      out[`_unmapped__${label}`] = value; // surfaces new labels instead of silently dropping them
      continue;
    }
    out[key] = value;
  }

  const brandRaw = out.brand_raw ?? null;
  delete out.brand_raw;
  delete out.model; // not part of the shared cache schema

  if (out.ram_raw) {
    const { ram_gb, ram_type } = parseRamRaw(String(out.ram_raw));
    out.ram_gb = ram_gb;
    out.ram_type = ram_type;
  } else {
    out.ram_gb = null;
    out.ram_type = null;
  }
  delete out.ram_raw;

  if (out.storage_raw) {
    const { storage_gb, storage_type } = parseStorageRaw(String(out.storage_raw));
    out.storage_gb = storage_gb;
    out.storage_type = storage_type;
  } else {
    out.storage_gb = null;
    out.storage_type = null;
  }
  delete out.storage_raw;

  out.screen_inches = out.screen_inches_raw ? parseScreenInchesRaw(out.screen_inches_raw) : null;
  delete out.screen_inches_raw;

  out.refresh_rate_hz = out.refresh_rate_hz_raw ? parseRefreshRateRaw(out.refresh_rate_hz_raw) : null;
  delete out.refresh_rate_hz_raw;

  // "Display type" bundles the panel type (e.g. "Tandem OLED") together
  // with a "Touch" term when the screen is touch-capable.
  if (out.screen_type_raw !== undefined) {
    const terms = Array.isArray(out.screen_type_raw) ? out.screen_type_raw : [out.screen_type_raw];
    const touchTerm = terms.find((t) => /touch/i.test(t));
    const typeTerms = terms.filter((t) => !/touch/i.test(t));
    out.screen_type = typeTerms.length ? typeTerms.join(', ') : null;
    // the attribute was listed explicitly for this product, so the absence
    // of a "Touch" term is a real "no", not a missing value
    out.touch_screen = Boolean(touchTerm);
  } else {
    out.screen_type = null;
    out.touch_screen = null; // store never listed this attribute — unknown, not guessed
  }
  delete out.screen_type_raw;

  out.weight_kg = out.weight_raw ? parseWeightRaw(String(out.weight_raw)) : null;
  delete out.weight_raw;

  out.warranty_months = out.warranty_raw ? parseWarrantyRaw(String(out.warranty_raw)) : null;
  delete out.warranty_raw;

  out.backlit_keyboard = out.keyboard_raw !== undefined
    ? /backlit|լուսավորվող/i.test(String(out.keyboard_raw))
    : null;
  delete out.keyboard_raw;

  out.cpu = out.cpu ?? null;
  out.gpu = out.gpu ?? null;
  out.screen_resolution = out.screen_resolution ?? null;
  out.color = out.color ?? null;
  out.os = out.os ?? null;

  return { specs: out, brandRaw };
}