import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://allsell.am";

const CATEGORY_URLS = [
  "https://allsell.am/en/smart-watches?cat=349&price=5900-349500", // Samsung
  "https://allsell.am/en/smart-watches?cat=348&price=5900-349500", // Apple
  "https://allsell.am/en/smart-watches?mgs_brand=4&price=5900-349500", // Xiaomi
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

function parseSimpleProduct(baseName, html, url = null) {
  const $ = cheerio.load(html);
  const cashRaw = $("[data-price-type='finalPrice']").first().attr("data-price-amount");
  const cash_price = cashRaw ? parseInt(cashRaw, 10) : null;
  if (!cash_price) return null;

  const installmentText = $(".credit_price .price").first().text().trim();
  const installment_price = installmentText
    ? parseInt(installmentText.replace(/[^\d]/g, ""), 10) || null
    : null;

  return { name: baseName, cash_price, installment_price, source: "allsell",
    category: "watches", url };
}

async function fetchWatchVariants(baseName, url) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const html = res.data;

    const attrStart = html.indexOf('"attributes"');
    const optionStart = html.indexOf('"optionPrices"');
    const priceFormatStart = html.indexOf('"priceFormat"');

    if (attrStart === -1 || optionStart === -1 || priceFormatStart === -1) {
      return [parseSimpleProduct(baseName, html, url)].filter(Boolean);
    }

    let optionPrices;
    try {
      const chunk = html.slice(optionStart, priceFormatStart);
      const jsonStr = chunk.replace(/^"optionPrices"\s*:\s*/, "").replace(/,\s*$/, "");
      optionPrices = JSON.parse(jsonStr);
    } catch {
      return [parseSimpleProduct(baseName, html, url)].filter(Boolean);
    }

    let attributes;
    try {
      const attrChunk = html.slice(attrStart, optionStart);
      let jsonStr = attrChunk.replace(/^"attributes"\s*:\s*/, "");
      let depth = 0, endIndex = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === "{") depth++;
        else if (jsonStr[i] === "}") {
          depth--;
          if (depth === 0) { endIndex = i + 1; break; }
        }
      }
      jsonStr = jsonStr.slice(0, endIndex);
      attributes = JSON.parse(jsonStr);
    } catch {
      return [parseSimpleProduct(baseName, html, url)].filter(Boolean);
    }

    const sizeAttr = Object.values(attributes).find((a) => a.code === "screen_diagonal");
    const colorAttr = Object.values(attributes).find((a) => a.code === "color");

    if (!sizeAttr && !colorAttr) {
      return [parseSimpleProduct(baseName, html, url)].filter(Boolean);
    }

    const results = [];
    const seen = new Set();

    const sizeOptions = sizeAttr ? sizeAttr.options : [null];
    const colorOptions = colorAttr ? colorAttr.options : [null];

    for (const sizeOption of sizeOptions) {
      for (const colorOption of colorOptions) {
        const key = `${sizeOption?.id ?? "x"}|${colorOption?.id ?? "x"}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let productId;
        if (sizeOption && colorOption) {
          productId = sizeOption.products.find((id) => colorOption.products.includes(id));
        } else if (sizeOption) {
          productId = sizeOption.products[0];
        } else if (colorOption) {
          productId = colorOption.products[0];
        }
        if (!productId || !optionPrices[productId]) continue;

        const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
        const installment_price = optionPrices[productId].creditPrice?.amount ?? null;
        if (!cash_price) continue;

        const parts = [baseName];
        if (sizeOption) parts.push(sizeOption.label);
        if (colorOption) parts.push(colorOption.label);

        results.push({
          name: parts.join(" "),
          cash_price,
          installment_price,
          source: "allsell",
    category: "watches",
          url,
        });
      }
    }

    return results.length > 0
      ? results
      : [parseSimpleProduct(baseName, html, url)].filter(Boolean);
  } catch (err) {
    console.warn(`[allsell-watches] Failed ${url}: ${err.message}`);
    return [];
  }
}

export async function scrapeAllsellWatches() {
  const allListingProducts = [];

  for (const categoryUrl of CATEGORY_URLS) {
    console.log(`[allsell-watches] Fetching: ${categoryUrl}`);
    const { products: firstPage, totalPages } = await fetchListingPage(categoryUrl, 1);
    allListingProducts.push(...firstPage);
    console.log(`[allsell-watches] Page 1: ${firstPage.length} products, total pages: ${totalPages}`);

    for (let page = 2; page <= totalPages; page++) {
      const { products } = await fetchListingPage(categoryUrl, page);
      console.log(`[allsell-watches] Page ${page}: ${products.length} products`);
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

  console.log(`[allsell-watches] ${unique.length} unique products, fetching details...`);

  const allProducts = [];
  for (let i = 0; i < unique.length; i++) {
    const { name, url } = unique[i];
    console.log(`[allsell-watches] (${i + 1}/${unique.length}) ${name}`);
    const variants = await fetchWatchVariants(name, url);
    allProducts.push(...variants);
    await new Promise((r) => setTimeout(r, 300));
  }

  const seen = new Map();
  for (const p of allProducts) {
    if (!seen.has(p.name)) seen.set(p.name, p);
  }

  const result = [...seen.values()];
  console.log(`[allsell-watches] Total unique products: ${result.length}`);
  return result;
}