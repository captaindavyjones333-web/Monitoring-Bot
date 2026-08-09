import axios from "axios";
import * as cheerio from "cheerio";
import { isConsoleProduct } from "../../core/gamingFilter.js";

const BASE_URL = "https://allsell.am";
const LIST_URLS = [
  "https://allsell.am/am/gaming-systems?cat=578&price=0-899900", // Meta
  "https://allsell.am/am/catalogsearch/result/?q=meta+quest+",
  "https://allsell.am/am/gaming-systems?cat=205&price=0-899900", // Sony
  "https://allsell.am/am/gaming-systems?cat=206&price=0-899900", // Nintendo
  "https://allsell.am/am/gaming-systems?cat=208&price=0-899900", // Xbox
];

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

async function fetchCategoryProducts(categoryUrl) {
  // Fixed pagination: stop after 2 consecutive pages with no genuinely
  // new product URLs, instead of relying on an empty result — this site
  // was found to silently repeat the last page's content past the real
  // end, rather than returning zero results.
  const seen = new Map();
  let page = 1;
  let consecutiveNoNew = 0;
  const MAX_PAGES = 10;

  while (page <= MAX_PAGES) {
    const sep = categoryUrl.includes("?") ? "&" : "?";
    const url = page === 1 ? categoryUrl : `${categoryUrl}${sep}p=${page}`;
    const res = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(res.data);
    const pageProducts = extractListingProducts($);

    if (pageProducts.length === 0) {
      console.log(
        `[allsell-gaming] ${categoryUrl} page ${page}: 0 products, stopping`,
      );
      break;
    }

    let newCount = 0;
    for (const p of pageProducts) {
      if (!seen.has(p.url)) {
        seen.set(p.url, p);
        newCount++;
      }
    }

    console.log(
      `[allsell-gaming] ${categoryUrl} page ${page}: ${pageProducts.length} products, ${newCount} new`,
    );

    if (newCount === 0) {
      consecutiveNoNew++;
      if (consecutiveNoNew >= 2) {
        console.log(`[allsell-gaming] Stopping — repeating content`);
        break;
      }
    } else {
      consecutiveNoNew = 0;
    }

    page++;
    await new Promise((r) => setTimeout(r, 500));
  }

  return [...seen.values()];
}

function parseSimpleProduct(baseName, html) {
  const $ = cheerio.load(html);
  const cashRaw = $("[data-price-type='finalPrice']")
    .first()
    .attr("data-price-amount");
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
    console.warn(`[allsell-gaming] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrapeAllsellGaming() {
  const allListing = [];
  for (const categoryUrl of LIST_URLS) {
    const products = await fetchCategoryProducts(categoryUrl);
    allListing.push(...products);
  }

  const seenUrls = new Set();
  const unique = [];
  for (const p of allListing) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  const filtered = unique.filter((p) => isConsoleProduct(p.name));
  console.log(
    `[allsell-gaming] ${filtered.length} after console-only filter (from ${unique.length})`,
  );

  const results = [];
  for (let i = 0; i < filtered.length; i++) {
    const { name, url } = filtered[i];
    console.log(`[allsell-gaming] (${i + 1}/${filtered.length}) ${name}`);
    const product = await fetchProductPrice(name, url);
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[allsell-gaming] Total: ${results.length}`);
  return results;
}
