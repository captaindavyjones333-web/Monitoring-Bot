import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://allsell.am";

const CATEGORY_URLS = [
  "https://allsell.am/am/audio-video-photo/audio/headphones?mgs_brand=16&price=5900-309500", // Apple
  "https://allsell.am/am/audio-video-photo/audio/headphones?mgs_brand=43&price=5900-309500", // Samsung
  "https://allsell.am/am/audio-video-photo/audio/headphones?mgs_brand=21&price=5900-309500", // Marshall
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

function getTotalPages($) {
  let maxPage = 1;
  $("a[href*='p=']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/[?&]p=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
  });
  return maxPage;
}

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

async function fetchListingPage(categoryUrl, page) {
  const separator = categoryUrl.includes("?") ? "&" : "?";
  const url = page === 1 ? categoryUrl : `${categoryUrl}${separator}p=${page}`;
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  const products = extractListingProducts($);
  const totalPages = page === 1 ? getTotalPages($) : null;
  return { products, totalPages };
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
    console.warn(`[allsell-headphones] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrapeAllsellHeadphones() {
  const allListingProducts = [];

  for (const categoryUrl of CATEGORY_URLS) {
    console.log(`[allsell-headphones] Fetching: ${categoryUrl}`);
    const { products: firstPage, totalPages } = await fetchListingPage(categoryUrl, 1);
    allListingProducts.push(...firstPage);

    for (let page = 2; page <= totalPages; page++) {
      const { products } = await fetchListingPage(categoryUrl, page);
      allListingProducts.push(...products);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const seenUrls = new Set();
  const unique = [];
  for (const p of allListingProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  console.log(`[allsell-headphones] ${unique.length} unique products, fetching details...`);

  const results = [];
  for (let i = 0; i < unique.length; i++) {
    const { name, url } = unique[i];
    console.log(`[allsell-headphones] (${i + 1}/${unique.length}) ${name}`);
    const product = await fetchProductPrice(name, url);
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[allsell-headphones] Total: ${results.length}`);
  return results;
}