import * as cheerio from 'cheerio';
import { parseSpecsTable, normalizeSpecs } from './specTable.js';

function cleanText(t = '') {
  return t.replace(/\s+/g, ' ').trim();
}

function parsePriceAmd(text = '') {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/**
 * @param {string} html - full listing page HTML
 * @returns {{ stubs: Array<object>, maxPage: number|null }}
 */
export function parseListingHtml(html) {
  const $ = cheerio.load(html);
  const stubs = [];

  $('.product-grid-item.product[data-id]').each((_, el) => {
    const card = $(el);

    const id = card.attr('data-id') || null;

    const link = card.find('a.product-image-link').first();
    const url = link.attr('href') || null;

    const nameFromTitle = cleanText(card.find('h3.wd-entities-title a').first().text());
    const name = nameFromTitle || cleanText(link.attr('aria-label') || '');

    const priceText = card.find('.wrap-price .price .woocommerce-Price-amount').first().text();
    const price = parsePriceAmd(priceText);

    const thumbnail = card.find('img.attachment-woocommerce_thumbnail').first().attr('src') || null;

    const brandLinkText = cleanText(card.find('.wd-product-brands-links a').first().text());

    // The listing's "quick shop" hover panel renders the exact same
    // attributes table as the product's own detail page, so we usually
    // don't need a second request per product.
    const table = card.find('.hover-content-inner table.shop_attributes').first();
    const hasSpecTable = table.length > 0;
    const raw = parseSpecsTable($, table);
    const { specs, brandRaw } = normalizeSpecs(raw);

    if (!id || !url || !name) return; // skip malformed cards defensively

    stubs.push({
      id,
      store: 'notebookmall.am',
      name,
      url,
      price,
      thumbnail,
      brand_hint: brandLinkText || brandRaw || null,
      specs,
      needs_detail_fetch: !hasSpecTable,
    });
  });

  let maxPage = null;
  $('.woocommerce-pagination .page-numbers').each((_, el) => {
    const n = Number(cleanText($(el).text()));
    if (!Number.isNaN(n) && (maxPage === null || n > maxPage)) maxPage = n;
  });

  return { stubs, maxPage };
}