import axios from "axios";
import * as cheerio from "cheerio";
import { saveCache, markUpdated } from "../core/cache_manager.js";

const BASE_URL = "https://www.yerevanmobile.am";
const LIST_URL = `${BASE_URL}/am/electronics/phones.html?brands=171%2C11%2C12%2C38%2C411&product_list_limit=48`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

function getTotalPages($) {
  let maxPage = 1;
  $("ul.pages-items a.page").each((_, el) => {
    const text = $(el).find("span").last().text().trim();
    const n = parseInt(text, 10);
    if (!isNaN(n)) maxPage = Math.max(maxPage, n);
  });
  return maxPage;
}

function extractListingProducts($) {
  const products = [];

  $(".product-item-info").each((_, el) => {
    const $card = $(el);

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

// --- Detail page parser ---

async function fetchProductVariants(baseName, url) {
  try {
    const res = await axios
      .get(pageUrl, {
        headers: HEADERS,
        timeout: 15000,
        signal: AbortSignal.timeout(15000),
      })
      .catch((err) => {
        throw new Error(`YM fetch failed: ${err.message}`);
      });
    const html = res.data;

    const attrStart = html.indexOf('"attributes"');
    const optionStart = html.indexOf('"optionPrices"');
    const priceFormatStart = html.indexOf('"priceFormat"');

    console.log(`[debug] ${baseName}`);
    console.log(
      `  attrStart=${attrStart} optionStart=${optionStart} priceFormatStart=${priceFormatStart}`,
    );

    if (attrStart === -1 || optionStart === -1 || priceFormatStart === -1) {
      console.log("  -> MISSING MARKERS, falling back");
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }

    let optionPrices;
    try {
      const optionChunk = html.slice(optionStart, priceFormatStart);
      const jsonStr = optionChunk
        .replace(/^"optionPrices"\s*:\s*/, "")
        .replace(/,\s*$/, "");
      optionPrices = JSON.parse(jsonStr);
      console.log(
        "  optionPrices keys:",
        Object.keys(optionPrices).slice(0, 3),
      );
    } catch (e) {
      console.log("  -> optionPrices PARSE FAILED:", e.message);
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }

    let attributes;
    try {
      const attrChunk = html.slice(attrStart, optionStart);
      let jsonStr = attrChunk.replace(/^"attributes"\s*:\s*/, "");

      // Find the correct end by counting braces
      let depth = 0;
      let endIndex = 0;
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
      console.log("  attributes keys:", Object.keys(attributes));
    } catch (e) {
      console.log("  -> attributes PARSE FAILED:", e.message);
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }
    // Extract disabled/empty option IDs from HTML
    const disabledProductIds = new Set();
    const $html = cheerio.load(html);
    $html('.swatch-option[data-option-empty="true"]').each((_, el) => {
      const optionId = $html(el).attr("data-option-id");
      if (optionId) {
        for (const attr of Object.values(attributes)) {
          const option = attr.options?.find((o) => o.id === optionId);
          if (option)
            option.products?.forEach((id) => disabledProductIds.add(id));
        }
      }
    });
    // Find memory attribute
    const memoryAttr = Object.values(attributes).find(
      (a) => a.code === "memory",
    );
    const ramAttr = Object.values(attributes).find((a) => a.code === "gb_ram");
    console.log(
      "  ramAttr:",
      ramAttr ? ramAttr.options.map((o) => o.label) : "NOT FOUND",
    );
    console.log(
      "  memoryAttr:",
      memoryAttr ? memoryAttr.options.map((o) => o.label) : "NOT FOUND",
    );

    if (!memoryAttr)
      return [parseSimpleProduct(baseName, html)].filter(Boolean);

    const results = [];

    for (const storageOption of memoryAttr.options) {
      const storageLabel = storageOption.label.replace(/\s+/g, "");

      if (ramAttr) {
        // Has RAM variants — create entry per RAM+storage combination
        for (const ramOption of ramAttr.options) {
          const ramLabel = ramOption.label.replace(/\s+/g, "");
          const productId = storageOption.products.find(
            (id) =>
              ramOption.products.includes(id) && !disabledProductIds.has(id),
          );
          console.log(
            `  RAM ${ramLabel}: match=${productId}, price=${optionPrices[productId]?.finalPrice?.amount}`,
          );
          if (!productId || !optionPrices[productId]) continue;

          const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
          const installment_price =
            optionPrices[productId].creditPrice?.amount ?? null;
          if (!cash_price) continue;

          results.push({
            name: `${baseName} ${ramLabel}/${storageLabel}`,
            cash_price,
            installment_price,
            source: "yerevanmobile",
          });
        }
      } else {
        // No RAM variants — storage only
        const productId = storageOption.products.find(
          (id) => !disabledProductIds.has(id),
        );
        if (!productId || !optionPrices[productId]) continue;

        const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
        const installment_price =
          optionPrices[productId].creditPrice?.amount ?? null;
        if (!cash_price) continue;

        results.push({
          name: `${baseName} ${storageLabel}`,
          cash_price,
          installment_price,
          source: "yerevanmobile",
        });
      }
    }
    console.log(
      "  results:",
      results.map((r) => r.name),
    );

    return results.length > 0
      ? results
      : [parseSimpleProduct(baseName, html)].filter(Boolean);
  } catch (err) {
    console.warn(`[ym] Warning: ${url}: ${err.message}`);
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

  const loanRaw = $("button.loan_price").first().attr("data-price");
  const installment_price = loanRaw ? Math.round(parseFloat(loanRaw)) : null;

  return {
    name: baseName,
    cash_price,
    installment_price,
    source: "yerevanmobile",
  };
}

// --- Main scraper ---

export async function scrapeYerevanMobile() {
  const listingProducts = [];
  let page = 1;

  while (true) {
    const pageUrl = page === 1 ? LIST_URL : `${LIST_URL}&p=${page}`;
    const res = await axios.get(pageUrl, { headers: HEADERS });
    const $ = cheerio.load(res.data);

    const pageProducts = extractListingProducts($);
    console.log(`[ym] Page ${page}: ${pageProducts.length} products`);

    if (pageProducts.length === 0) break;

    listingProducts.push(...pageProducts);

    // Check if next page exists via next button
    const hasNextPage =
      $("a.action.next").length > 0 && !$("a.action.next").hasClass("inactive");

    if (!hasNextPage) break;

    page++;
    await new Promise((r) => setTimeout(r, 500));
  }

  // ... rest stays the same

  const allProducts = [];

  for (let i = 0; i < listingProducts.length; i++) {
    const { name, url } = listingProducts[i];
    console.log(`[ym] (${i + 1}/${listingProducts.length}) ${name}`);

    const variants = await fetchProductVariants(name, url);
    allProducts.push(...variants);

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[ym] Total variants: ${allProducts.length}`);
  return allProducts;
}
