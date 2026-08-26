import * as cheerio from 'cheerio';
import { parseSpecsTable, normalizeSpecs } from './specTable.js';

/**
 * @param {string} html - full product detail page HTML
 * @returns {{ specs: object, brandRaw: string|null }}
 */
export function parseDetailHtml(html) {
  const $ = cheerio.load(html);
  const table = $('table.woocommerce-product-attributes.shop_attributes').first();
  const raw = parseSpecsTable($, table);
  return normalizeSpecs(raw);
}