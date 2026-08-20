import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.yerevanmobile.am";
const LIST_URL = `${BASE_URL}/en/electronics/watches.html`;

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

    // Skip products that show "Զանգահարել" instead of a price/add-to-cart
    const statusText = $card.find(".product_status").first().text().trim();
    if (statusText.includes("Զանգահարել")) return;

    const name = (
      $card.find("img.product-image-photo").first().attr("alt") || ""
    )
      .replace(/^Գնել\s+/i, "")
      .trim();
    if (!name) return;
    const href = $card.find("a.product-item-photo").attr("href") || "";
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    products.push({ name, url });
  });
  return products;
}

function parseSimpleProduct(baseName, html, url = null) {
  const $ = cheerio.load(html);
  const cashRaw = $("[data-price-type='finalPrice']")
    .first()
    .attr("data-price-amount");
  const cash_price = cashRaw ? parseInt(cashRaw, 10) : null;
  if (!cash_price) return null;

  const loanRaw = $("button.loan_price").first().attr("data-price");
  const installment_price = loanRaw ? Math.round(parseFloat(loanRaw)) : null;

  return {
    name: baseName,
    cash_price,
    installment_price,
    source: "yerevanmobile",
    category: "watches",
    url,
  };
}

async function fetchWatchVariants(baseName, url) {
  try {
    const res = await axios.get(url, {
      headers: HEADERS,
      timeout: 15000,
      signal: AbortSignal.timeout(15000),
    });
    const html = res.data;

    const attrStart = html.indexOf('"attributes"');
    const optionStart = html.indexOf('"optionPrices"');
    const priceFormatStart = html.indexOf('"priceFormat"');

    if (attrStart === -1 || optionStart === -1 || priceFormatStart === -1) {
      return [parseSimpleProduct(baseName, html, url)].filter(Boolean);
    }

    let optionPrices;
    try {
      const optionChunk = html.slice(optionStart, priceFormatStart);
      const jsonStr = optionChunk
        .replace(/^"optionPrices"\s*:\s*/, "")
        .replace(/,\s*$/, "");
      optionPrices = JSON.parse(jsonStr);
    } catch (e) {
      return [parseSimpleProduct(baseName, html, url)].filter(Boolean);
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
    } catch (e) {
      return [parseSimpleProduct(baseName, html, url)].filter(Boolean);
    }

    const colorAttr = Object.values(attributes).find((a) => a.code === "color");
    if (!colorAttr) return [parseSimpleProduct(baseName, html, url)].filter(Boolean);

    const results = [];
    for (const colorOption of colorAttr.options) {
      const productId = colorOption.products?.[0];
      if (!productId || !optionPrices[productId]) continue;

      const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
      const installment_price =
        optionPrices[productId].creditPrice?.amount ?? null;
      if (!cash_price) continue;

      results.push({
        name: `${baseName} ${colorOption.label}`,
        cash_price,
        installment_price,
        source: "yerevanmobile",
    category: "watches",
        url,
      });
    }

    return results.length > 0
      ? results
      : [parseSimpleProduct(baseName, html, url)].filter(Boolean);
  } catch (err) {
    console.warn(`[ym-watches] Warning: ${url}: ${err.message}`);
    return [];
  }
}

export async function scrapeYerevanMobileWatches() {
  const listingProducts = [];
  let page = 1;

  while (true) {
    const separator = LIST_URL.includes("?") ? "&" : "?";
    const pageUrl = page === 1 ? LIST_URL : `${LIST_URL}${separator}p=${page}`;
    const res = await axios.get(pageUrl, { headers: HEADERS });
    const $ = cheerio.load(res.data);
    const pageProducts = extractListingProducts($);
    console.log(`[ym-watches] Page ${page}: ${pageProducts.length} products`);
    if (pageProducts.length === 0) break;
    listingProducts.push(...pageProducts);

    const hasNextPage =
      $("a.action.next").length > 0 && !$("a.action.next").hasClass("inactive");
    if (!hasNextPage) break;
    page++;
    await new Promise((r) => setTimeout(r, 500));
  }

  const allProducts = [];
  for (let i = 0; i < listingProducts.length; i++) {
    const { name, url } = listingProducts[i];
    console.log(`[ym-watches] (${i + 1}/${listingProducts.length}) ${name}`);
    const variants = await fetchWatchVariants(name, url);
    allProducts.push(...variants);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[ym-watches] Total variants: ${allProducts.length}`);
  return allProducts;
}
