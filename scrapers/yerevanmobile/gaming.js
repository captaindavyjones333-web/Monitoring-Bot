import axios from "axios";
import * as cheerio from "cheerio";
import { isConsoleProduct } from "../../core/gamingFilter.js";

const BASE_URL = "https://www.yerevanmobile.am";
const LIST_URLS = [
  `${BASE_URL}/am/gaming-systems/nintendo.html`,
  `${BASE_URL}/am/gaming-systems/sony-playstation.html`,
  `${BASE_URL}/am/gaming-systems/virtual-glasses.html`,
  `${BASE_URL}/am/valve-steam-deck-oled.html`,
  `${BASE_URL}/am/catalogsearch/result/?q=lenovo+legion`,
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
    url,
  };
}

async function fetchProductPrice(baseName, url) {
  try {
    const res = await axios.get(url, {
      headers: HEADERS,
      timeout: 15000,
      signal: AbortSignal.timeout(15000),
    });
    return parseSimpleProduct(baseName, res.data, url);
  } catch (err) {
    console.warn(`[ym-gaming] Warning: ${url}: ${err.message}`);
    return null;
  }
}

export async function scrapeYerevanMobileGaming() {
  const listingProducts = [];

  for (const listUrl of LIST_URLS) {
    let page = 1;

    while (true) {
      const pageUrl =
        page === 1
          ? listUrl
          : `${listUrl}${listUrl.includes("?") ? "&" : "?"}p=${page}`;
      const res = await axios.get(pageUrl, { headers: HEADERS });
      const $ = cheerio.load(res.data);
      const pageProducts = extractListingProducts($);
      console.log(
        `[ym-gaming] ${listUrl} page ${page}: ${pageProducts.length} products`,
      );
      if (pageProducts.length === 0) break;
      listingProducts.push(...pageProducts);

      const hasNextPage =
        $("a.action.next").length > 0 &&
        !$("a.action.next").hasClass("inactive");
      if (!hasNextPage) break;
      page++;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const filtered = listingProducts.filter((p) => isConsoleProduct(p.name));
  console.log(
    `[ym-gaming] ${filtered.length} after console-only filter (from ${listingProducts.length})`,
  );

  const results = [];
  for (let i = 0; i < filtered.length; i++) {
    const { name, url } = filtered[i];
    console.log(`[ym-gaming] (${i + 1}/${filtered.length}) ${name}`);
    const product = await fetchProductPrice(name, url);
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[ym-gaming] Total: ${results.length}`);
  return results;
}
