import * as cheerio from 'cheerio';

/**
 * @param {string} html - the raw string from the API's "products" field
 * @returns {Array<object>} stub product records
 */
export function parseListingHtml(html) {
  const $ = cheerio.load(html);
  const stubs = [];

  $('.product-card').each((_, el) => {
    const card = $(el);

    const id = card.find('[data-id]').first().attr('data-id') || null;

    const link = card.find('a.d-block.rounded-top.product-image-box').first();
    const url = link.attr('href') || null;

    const nameSpan = card.find('h3.product-title span.animate-target').first();
    const name = (nameSpan.attr('title') || nameSpan.text() || '').trim();

    const priceText = card.find('.product-custom-price').first().text();
    const price = parsePriceAmd(priceText);

    const monthlyText = card
      .find('.loan')
      .filter((__, loanEl) => $(loanEl).text().includes('Monthly'))
      .find('.text-dark-emphasis')
      .first()
      .text();
    const monthlyPrice = parsePriceAmd(monthlyText);

    const thumbnail = card.find('img.fit-contain').first().attr('src') || null;

    // Preview only — may be truncated server-side, do not trust as complete.
    const specPreview = card.find('.product-content').first().text().trim().replace(/\s+/g, ' ');
    const specPreviewTruncated = specPreview.endsWith('...');

    if (!id || !url || !name) return; // skip malformed cards defensively

    stubs.push({
      id,
      store: 'notebookcentre.am',
      name,
      url,
      price,
      monthly_price: monthlyPrice,
      thumbnail,
      spec_preview: specPreview,
      spec_preview_truncated: specPreviewTruncated,
    });
  });

  return stubs;
}

/**
 * "279 000 ֏" -> 279000
 */
function parsePriceAmd(text = '') {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}