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

    // Scoped to this card only — avoids picking up another product's
    // credit_price block when this markup also appears on detail pages.
    const installmentText = $card
      .find(".credit_price .price")
      .first()
      .text()
      .trim();
    const installment_price = installmentText
      ? parseInt(installmentText.replace(/[^\d]/g, ""), 10) || null
      : null;

    products.push({ name, url, installment_price });
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

function parseSimpleProduct(baseName, html, listingInstallment, url = null) {
  const $ = cheerio.load(html);
  const $main = $(".product-info-main").first(); // scope to main product block

  const cashRaw =
    $main
      .find("[data-price-type='finalPrice']")
      .first()
      .attr("data-price-amount") ||
    $("[data-price-type='finalPrice']").first().attr("data-price-amount"); // fallback if not inside product-info-main
  const cash_price = cashRaw ? parseInt(cashRaw, 10) : null;
  if (!cash_price) return null;

  let installment_price = null;
  const installmentText = $main
    .find(".credit_price .price")
    .first()
    .text()
    .trim();
  if (installmentText) {
    installment_price =
      parseInt(installmentText.replace(/[^\d]/g, ""), 10) || null;
  }
  // Prefer the value scraped from the listing page if the detail page didn't yield one
  if (installment_price == null) installment_price = listingInstallment ?? null;

  return { name: baseName, cash_price, installment_price, source: "allsell",
    category: "dyson", url };
}

async function fetchProductPrice(baseName, url, listingInstallment) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    return parseSimpleProduct(baseName, res.data, listingInstallment, url);
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

  console.log(
    `[allsell-dyson] ${unique.length} unique products, fetching details...`,
  );

  const results = [];
  for (let i = 0; i < unique.length; i++) {
    const { name, url } = unique[i];
    console.log(`[allsell-dyson] (${i + 1}/${unique.length}) ${name}`);
    const product = await fetchProductPrice(
      name,
      url,
      unique[i].installment_price,
    );
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[allsell-dyson] Total: ${results.length}`);
  return results;
}
