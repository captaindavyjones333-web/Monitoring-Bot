import * as cheerio from 'cheerio';

// Armenian icon-alt labels -> our internal raw keys.
// 'Էկրանի կետայնություն' literally means "screen resolution" but on this
// site the value actually bundles resolution + refresh rate + panel type
// together (e.g. "1920 x 1200 60Hz OLED"), so it gets its own combined
// parser instead of a 1:1 field mapping.
const LABEL_MAP = {
  'Պրոցեսոր': 'cpu',
  'Օպերատիվ Հիշողություն': 'ram_raw',
  'Էկրանի անկյունագիծ': 'screen_inches_raw',
  'Էկրանի կետայնություն': 'screen_combined_raw',
  'Հիշողություն': 'storage_raw',
  'Տեսաքարտ': 'gpu',
  'Օպերացիոն Համակարգ': 'os',
  'Սենսորային էկրան': 'touch_screen_raw',
  // seen on other product types on this platform, kept defensively in case
  // a given notebook lists them too
  'Գույն': 'color',
  'Երաշխիք': 'warranty_raw',
  'Քաշ': 'weight_raw',
};

const YES_NO = { 'այո': true, 'ոչ': false, 'yes': true, 'no': false };

function cleanText(t = '') {
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} html - full product detail page HTML (post-render)
 * @returns {object} raw label -> value map, keyed by our internal names
 */
function parseSpecCards(html) {
  const $ = cheerio.load(html);
  const raw = {};

  // Each spec card is an icon (with the label as its alt text) next to a
  // ".min-w-0" block whose second line (.font-semibold) is the value.
  // Anchoring on the icon's alt text and the nearby ".flex.items-center
  // .gap-4" wrapper avoids depending on the card's outer Tailwind classes,
  // which contain bracket characters that are awkward/fragile to select on.
  $('img[alt]').each((_, img) => {
    const label = cleanText($(img).attr('alt') || '');
    if (!label) return;

    const wrapper = $(img).closest('.flex.items-center.gap-4');
    if (wrapper.length === 0) return;

    const value = cleanText(wrapper.find('.font-semibold').first().text());
    if (!value) return;

    raw[label] = value;
  });

  return raw;
}

function parseRam(text) {
  const gbMatch = text.match(/(\d+)\s*GB/i);
  const typeMatch = text.match(/DDR\s?\d/i);
  return {
    ram_gb: gbMatch ? Number(gbMatch[1]) : null,
    ram_type: typeMatch ? typeMatch[0].replace(/\s+/, '').toUpperCase() : null,
  };
}

function parseStorage(text) {
  const m = text.match(/([\d.]+)\s*(GB|TB)/i);
  if (!m) return { storage_gb: null, storage_type: null };
  const storage_gb = m[2].toUpperCase() === 'TB' ? Number(m[1]) * 1024 : Number(m[1]);
  let storage_type = null;
  if (/hdd/i.test(text)) storage_type = 'HDD';
  else if (/ssd/i.test(text)) storage_type = 'SSD';
  return { storage_gb, storage_type };
}

function parseScreenInches(text) {
  const m = text.match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function parseWeight(text) {
  const m = text.replace(',', '.').match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function parseWarranty(text) {
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * "1920 x 1200 60Hz OLED" -> { screen_resolution: "1920x1200", refresh_rate_hz: 60, screen_type: "OLED" }
 * Any of the three pieces may be absent; whatever's left over after pulling
 * out resolution/Hz becomes screen_type verbatim (never invented).
 */
function parseScreenCombined(text) {
  const resMatch = text.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/i);
  const hzMatch = text.match(/(\d+)\s*Hz/i);

  let rest = text;
  if (resMatch) rest = rest.replace(resMatch[0], '');
  if (hzMatch) rest = rest.replace(hzMatch[0], '');
  rest = cleanText(rest);

  return {
    screen_resolution: resMatch ? `${resMatch[1]}x${resMatch[2]}` : null,
    refresh_rate_hz: hzMatch ? Number(hzMatch[1]) : null,
    screen_type: rest || null,
  };
}

/**
 * @param {string} html - full product detail page HTML (post-render)
 * @returns {object} specs, normalized to the same field names used by the
 *   other stores' scrapers (notebookcentre/redstore/notebookmall) so
 *   matcherV2 can compare products across stores.
 */
export function parseDetailSpecs(html) {
  const raw = parseSpecCards(html);
  const out = {};

  for (const [label, value] of Object.entries(raw)) {
    const key = LABEL_MAP[label];
    if (!key) {
      out[`_unmapped__${label}`] = value; // surfaces new labels instead of silently dropping them
      continue;
    }
    out[key] = value;
  }

  if (out.ram_raw) {
    const { ram_gb, ram_type } = parseRam(out.ram_raw);
    out.ram_gb = ram_gb;
    out.ram_type = ram_type;
  } else {
    out.ram_gb = null;
    out.ram_type = null;
  }
  delete out.ram_raw;

  if (out.storage_raw) {
    const { storage_gb, storage_type } = parseStorage(out.storage_raw);
    out.storage_gb = storage_gb;
    out.storage_type = storage_type;
  } else {
    out.storage_gb = null;
    out.storage_type = null;
  }
  delete out.storage_raw;

  out.screen_inches = out.screen_inches_raw ? parseScreenInches(out.screen_inches_raw) : null;
  delete out.screen_inches_raw;

  if (out.screen_combined_raw) {
    const { screen_resolution, refresh_rate_hz, screen_type } = parseScreenCombined(out.screen_combined_raw);
    out.screen_resolution = screen_resolution;
    out.refresh_rate_hz = refresh_rate_hz;
    out.screen_type = screen_type;
  } else {
    out.screen_resolution = null;
    out.refresh_rate_hz = null;
    out.screen_type = null;
  }
  delete out.screen_combined_raw;

  if (out.touch_screen_raw !== undefined) {
    out.touch_screen = YES_NO[out.touch_screen_raw.toLowerCase()] ?? null;
  } else {
    out.touch_screen = null; // card wasn't shown for this product — unknown, not guessed
  }
  delete out.touch_screen_raw;

  out.weight_kg = out.weight_raw ? parseWeight(out.weight_raw) : null;
  delete out.weight_raw;

  out.warranty_months = out.warranty_raw ? parseWarranty(out.warranty_raw) : null;
  delete out.warranty_raw;

  out.cpu = out.cpu ?? null;
  out.gpu = out.gpu ?? null;
  out.os = out.os ?? null;
  out.color = out.color ?? null;

  return out;
}