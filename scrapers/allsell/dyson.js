import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://allsell.am";
const LIST_URL = "https://allsell.am/am/beauty-and-care/dyson";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

function extractListingProducts($) {
  const products = [];
  $(".product-item-info").each((_, el) => {
    const $card = $(el);
    const name = $card.find(".product-item-link").first().text().trim();
    if (!name) return;
    const href =
      $card.find("a.product-item-photo").attr("href") ||
      $card.find(".product-item-link").attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    products.push({ name, url });
  });
  return products;
}

async function fetchListingPage(page) {
  const sep = LIST_URL.includes("?") ? "&" : "?";
  const url = page === 1 ? LIST_URL : `${LIST_URL}${sep}p=${page}`;
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  return extractListingProducts($);
}

function parseSimpleProduct(baseName, html) {
  const $ = cheerio.load(html);
  const cashRaw = $("[data-price-type='finalPrice']").first().attr("data-price-amount");
  const cash_price = cashRaw ? parseInt(cashRaw, 10) : null;
  if (!cash_price) return null;

  const installmentText = $(".credit_price .price").first().text().trim();
  const installment_price = installmentText
    ? parseInt(installmentText.replace(/[^\d]/g, ""), 10) || null
    : null;

  return { name: baseName, cash_price, installment_price, source: "allsell" };
}

async function fetchProductPrice(baseName, url) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    return parseSimpleProduct(baseName, res.data);
  } catch (err) {
    console.warn(`[allsell-dyson] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrapeAllsellDyson() {
  const allListingProducts = [];
  let page = 1;

  while (page <= 10) {
    const products = await fetchListingPage(page);
    console.log(`[allsell-dyson] Page ${page}: ${products.length} products`);
    if (products.length === 0) break;
    allListingProducts.push(...products);
    page++;
    await new Promise((r) => setTimeout(r, 500));
  }

  // allsell was reported to duplicate products across pages — dedupe
  // by URL before fetching details, so we don't fetch the same page twice.
  const seenUrls = new Set();
  const unique = [];
  for (const p of allListingProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  console.log(`[allsell-dyson] ${unique.length} unique products, fetching details...`);

  const results = [];
  for (let i = 0; i < unique.length; i++) {
    const { name, url } = unique[i];
    console.log(`[allsell-dyson] (${i + 1}/${unique.length}) ${name}`);
    const product = await fetchProductPrice(name, url);
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[allsell-dyson] Total: ${results.length}`);
  return results;
}