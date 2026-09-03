
import * as cheerio from 'cheerio';

const LABEL_MAP = {
  'Color': 'color',
  'Processor': 'cpu',
  'Screen type': 'screen_type',
  'Screen': 'screen_inches',
  'Display Refresh Rate': 'refresh_rate_hz',
  'Screen resolution': 'screen_resolution',
  'RAM': 'ram_raw',
  'SSD storage': 'storage_ssd_raw',
  'HDD storage': 'storage_hdd_raw',
  'Graphics card': 'gpu',
  'Touch screen': 'touch_screen',
  'Backlit keyboard': 'backlit_keyboard',
  'Rotating screen': 'rotating_screen',
  'Login/Logout': 'ports',
  'Camera': 'camera',
  'Weight': 'weight_raw',
  'Audio system': 'audio_system',
  'Operating system': 'os',
  'Warranty': 'warranty_raw',
};

const YES_NO = { yes: true, no: false };

function cleanText(t = '') {
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} html - full detail page HTML (or just the Description block)
 * @returns {{ specsRaw: object, specs: object, installment_price: number|null }}
 */
export function parseDetailHtml(html) {
  const $ = cheerio.load(html);
  const specsRaw = {};

  $('.option-list > li').each((_, el) => {
    const li = $(el);
    const labelSpan = li.find('> span').first();
    const label = cleanText(labelSpan.text()).replace(/:$/, '');
    if (!label) return;

    const valueSpan = li.find('span.text-dark-emphasis').first();
    const badges = valueSpan.find('span.badge');

    let value;
    if (badges.length > 0) {
      value = badges.map((__, b) => cleanText($(b).text())).get();
    } else {
      value = cleanText(valueSpan.text());
    }

    specsRaw[label] = value;
  });

  const specs = normalizeSpecs(specsRaw);

  // Credit price is not tracked for Notebookcentre — set to null.
  return { specsRaw, specs, installment_price: null };
}

function normalizeSpecs(raw) {
  const out = {};

  for (const [label, value] of Object.entries(raw)) {
    const key = LABEL_MAP[label];
    if (!key) {
      out[`_unmapped__${label}`] = value; // surfaces new labels instead of silently dropping them
      continue;
    }
    out[key] = value;
  }

  // --- derived / cleaned fields ---

  if (out.screen_inches) {
    const m = String(out.screen_inches).match(/([\d.]+)/);
    out.screen_inches = m ? Number(m[1]) : null;
  }

  if (out.refresh_rate_hz) {
    const m = String(out.refresh_rate_hz).match(/(\d+)/);
    out.refresh_rate_hz = m ? Number(m[1]) : null;
  }

  if (out.ram_raw) {
    const gbMatch = out.ram_raw.match(/(\d+)\s*GB/i);
    const typeMatch = out.ram_raw.match(/DDR\d/i);
    out.ram_gb = gbMatch ? Number(gbMatch[1]) : null;
    out.ram_type = typeMatch ? typeMatch[0].toUpperCase() : null;
    delete out.ram_raw;
  }

  if (out.storage_ssd_raw) {
    const m = out.storage_ssd_raw.match(/(\d+)\s*(GB|TB)/i);
    if (m) {
      out.storage_gb = m[2].toUpperCase() === 'TB' ? Number(m[1]) * 1024 : Number(m[1]);
      out.storage_type = 'SSD';
    }
    delete out.storage_ssd_raw;
  }

  if (out.storage_hdd_raw) {
    const m = out.storage_hdd_raw.match(/(\d+)\s*(GB|TB)/i);
    if (m) {
      out.storage_hdd_gb = m[2].toUpperCase() === 'TB' ? Number(m[1]) * 1024 : Number(m[1]);
      // only overwrite primary storage_type if there was no SSD entry
      if (!out.storage_gb) {
        out.storage_gb = out.storage_hdd_gb;
        out.storage_type = 'HDD';
      }
    }
    delete out.storage_hdd_raw;
  }

  if (out.weight_raw) {
    // Armenian-style decimal comma: "1,50 kilogram"
    const m = out.weight_raw.replace(',', '.').match(/([\d.]+)/);
    out.weight_kg = m ? Number(m[1]) : null;
    delete out.weight_raw;
  }

  if (out.warranty_raw) {
    const m = out.warranty_raw.match(/(\d+)/);
    out.warranty_months = m ? Number(m[1]) : null;
    delete out.warranty_raw;
  }

  for (const boolField of ['touch_screen', 'backlit_keyboard', 'rotating_screen']) {
    if (out[boolField] !== undefined) {
      const lower = String(out[boolField]).toLowerCase();
      out[boolField] = YES_NO[lower] ?? null;
    }
  }

  return out;
}

function parsePriceAmd(text = '') {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}