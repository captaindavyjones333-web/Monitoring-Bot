// scrapers/allsell.js
import axios from "axios";
import * as cheerio from "cheerio";
import { saveCache, markUpdated } from "../core/cache_manager.js";

const BASE_URL = "https://allsell.am";

const CATEGORY_URLS = [
  `${BASE_URL}/am/phones?cat=45&price=0-699600`, // Apple
  `${BASE_URL}/am/phones?cat=48&price=0-699600`, // Samsung
  `${BASE_URL}/am/phones?cat=44&price=0-699600`, // Xiaomi
  `${BASE_URL}/am/phones?cat=51&price=0-699600`, // Google Pixel
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

// --- Helpers ---

// Convert Armenian GB label to standard: "256 ԳԲ" → "256GB", "8 ԳԲ" → "8GB"
function normalizeStorageLabel(label) {
  return label
    .replace(/\s*ԳԲ/gi, "GB")
    .replace(/\s*ՏԲ/gi, "TB")
    .replace(/\s+/g, "")
    .trim();
}

// --- Listing pages ---

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
  const url = page === 1 ? categoryUrl : `${categoryUrl}&p=${page}`;
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  const products = extractListingProducts($);
  const totalPages = page === 1 ? getTotalPages($) : null;
  return { products, totalPages };
}

// --- Detail page parser (same Magento structure as YM) ---

async function fetchProductVariants(baseName, url) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const html = res.data;

    const attrStart = html.indexOf('"attributes"');
    const optionStart = html.indexOf('"optionPrices"');
    const priceFormatStart = html.indexOf('"priceFormat"');

    if (attrStart === -1 || optionStart === -1 || priceFormatStart === -1) {
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }

    let optionPrices;
    try {
      const chunk = html.slice(optionStart, priceFormatStart);
      const jsonStr = chunk
        .replace(/^"optionPrices"\s*:\s*/, "")
        .replace(/,\s*$/, "");
      optionPrices = JSON.parse(jsonStr);
    } catch {
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }

    let attributes;
    try {
      const attrChunk = html.slice(attrStart, optionStart);
      let jsonStr = attrChunk.replace(/^"attributes"\s*:\s*/, "");
      let depth = 0,
        endIndex = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === "{") depth++;
        else if (jsonStr[i] === "}") {
          depth--;
          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
      jsonStr = jsonStr.slice(0, endIndex);
      attributes = JSON.parse(jsonStr);
    } catch {
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }

    const storageAttr = Object.values(attributes).find(
      (a) => a.code === "drive",
    );
    const ramAttr = Object.values(attributes).find((a) => a.code === "ram");
    const simAttr = Object.values(attributes).find(
      (a) => a.code === "sim_card" || a.code === "sim" || a.code === "sim_type",
    );

    function normalizeSimLabel(label) {
      const l = label.toLowerCase();
      if (
        l.includes("esim+esim") ||
        l.includes("esim + esim") ||
        l.includes("2 esim")
      )
        return "eSim+eSim";
      if (l.includes("nano") || l.includes("/esim") || l.includes("+ esim"))
        return "Nano-Sim";
      if (/^e[\s-]?sim$/i.test(l.trim())) return "eSim";
      return label;
    }

    if (!storageAttr)
      return [parseSimpleProduct(baseName, html)].filter(Boolean);

    const results = [];
    const isApple =
      baseName.toLowerCase().includes("iphone") ||
      baseName.toLowerCase().startsWith("apple");

    if (isApple && simAttr) {
      const seen = new Set();
      for (const simOption of simAttr.options) {
        const simLabel = normalizeSimLabel(simOption.label);
        for (const storageOption of storageAttr.options) {
          const storageLabel = normalizeStorageLabel(storageOption.label);
          const key = `${storageLabel}|${simLabel}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const productId = storageOption.products.find((id) =>
            simOption.products.includes(id),
          );
          if (!productId || !optionPrices[productId]) continue;
          const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
          const installment_price =
            optionPrices[productId].creditPrice?.amount ?? null;
          if (!cash_price) continue;
          results.push({
            name: `${baseName} ${storageLabel} (${simLabel})`,
            cash_price,
            installment_price,
            source: "allsell",
          });
        }
      }
    } else {
      for (const storageOption of storageAttr.options) {
        const storageLabel = normalizeStorageLabel(storageOption.label);
        if (ramAttr && !isApple) {
          for (const ramOption of ramAttr.options) {
            const ramLabel = normalizeStorageLabel(ramOption.label);
            const productId = storageOption.products.find((id) =>
              ramOption.products.includes(id),
            );
            if (!productId || !optionPrices[productId]) continue;
            const cash_price =
              optionPrices[productId].finalPrice?.amount ?? null;
            const installment_price =
              optionPrices[productId].creditPrice?.amount ?? null;
            if (!cash_price) continue;
            results.push({
              name: `${baseName} ${ramLabel}/${storageLabel}`,
              cash_price,
              installment_price,
              source: "allsell",
            });
          }
        } else {
          const productId = storageOption.products[0];
          if (!productId || !optionPrices[productId]) continue;
          const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
          const installment_price =
            optionPrices[productId].creditPrice?.amount ?? null;
          if (!cash_price) continue;
          results.push({
            name: `${baseName} ${storageLabel}`,
            cash_price,
            installment_price,
            source: "allsell",
          });
        }
      }
    }

    return results.length > 0
      ? results
      : [parseSimpleProduct(baseName, html)].filter(Boolean);
  } catch (err) {
    console.warn(`[allsell] Failed ${url}: ${err.message}`);
    return [];
  }
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

// --- Main scraper ---

export async function scrapeAllsell() {
  const allListingProducts = [];

  for (const categoryUrl of CATEGORY_URLS) {
    console.log(`[allsell] Fetching: ${categoryUrl}`);
    const { products: firstPage, totalPages } = await fetchListingPage(
      categoryUrl,
      1,
    );
    allListingProducts.push(...firstPage);
    console.log(
      `[allsell] Page 1: ${firstPage.length} products, total pages: ${totalPages}`,
    );

    for (let page = 2; page <= totalPages; page++) {
      const { products } = await fetchListingPage(categoryUrl, page);
      console.log(`[allsell] Page ${page}: ${products.length} products`);
      allListingProducts.push(...products);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Deduplicate by URL
  const seenUrls = new Set();
  const unique = [];
  for (const p of allListingProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  console.log(
    `[allsell] ${unique.length} unique products, fetching details...`,
  );

  const allProducts = [];

  for (let i = 0; i < unique.length; i++) {
    const { name: productName, url: productUrl } = unique[i];
    console.log(`[allsell] (${i + 1}/${unique.length}) ${productName}`);

    const variants = await fetchProductVariants(productName, productUrl);
    console.log(
      `[allsell]   -> ${variants.length} variants: ${variants.map((v) => v.name).join(", ")}`,
    );
    allProducts.push(...variants);

    await new Promise((r) => setTimeout(r, 300));
  }

  // Deduplicate by name — keep first occurrence
  const seen = new Map();
  for (const p of allProducts) {
    if (!seen.has(p.name)) seen.set(p.name, p);
  }

  const result = [...seen.values()];
  console.log(`[allsell] Total unique products: ${result.length}`);
  return result;
}
