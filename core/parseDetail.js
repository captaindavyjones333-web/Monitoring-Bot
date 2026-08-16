import * as cheerio from 'cheerio';
import { parseRam, parseStorage, parseWeightKg, parseScreenInches, parseRefreshRateHz } from '../../core/specParsers.js';

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

  // "Credit Price: <span class="loan-total">395 000 ֏</span>"
  const installmentText = $('.loan-total').first().text();
  const installment_price = parsePriceAmd(installmentText);

  return { specsRaw, specs, installment_price };
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
    out.screen_inches = parseScreenInches(out.screen_inches);
  }

  if (out.refresh_rate_hz) {
    out.refresh_rate_hz = parseRefreshRateHz(out.refresh_rate_hz);
  }

  if (out.ram_raw) {
    const { ram_gb, ram_type } = parseRam(out.ram_raw);
    out.ram_gb = ram_gb;
    out.ram_type = ram_type;
    delete out.ram_raw;
  }

  if (out.storage_ssd_raw) {
    const { storage_gb, storage_type } = parseStorage(out.storage_ssd_raw);
    if (storage_gb) {
      out.storage_gb = storage_gb;
      out.storage_type = storage_type || 'SSD';
    }
    delete out.storage_ssd_raw;
  }

  if (out.storage_hdd_raw) {
    const { storage_gb } = parseStorage(out.storage_hdd_raw);
    if (storage_gb) {
      out.storage_hdd_gb = storage_gb;
      // only overwrite primary storage_type if there was no SSD entry
      if (!out.storage_gb) {
        out.storage_gb = storage_gb;
        out.storage_type = 'HDD';
      }
    }
    delete out.storage_hdd_raw;
  }

  if (out.weight_raw) {
    out.weight_kg = parseWeightKg(out.weight_raw);
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