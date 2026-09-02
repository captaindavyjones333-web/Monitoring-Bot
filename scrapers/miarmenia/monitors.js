import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://miarmenia.am";

const CATEGORY_URLS = [
  "https://miarmenia.am/hy/collection/%D5%B4%D5%B8%D5%B6%D5%AB%D5%BF%D5%B8%D6%80%D5%B6%D5%A5%D6%80/53", // Monitors
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

function buildPageUrl(categoryUrl, page) {
  // page 1 has no query param, page 2+ appends ?ProductOptions_page=N
  if (page === 1) return categoryUrl;
  const separator = categoryUrl.includes("?") ? "&" : "?";
  return `${categoryUrl}${separator}ProductOptions_page=${page}`;
}

function extractListingProducts($) {
  const products = [];
  $("li.productItem").each((_, el) => {
    const $card = $(el);
    const name = $card.find(".hidden-content h2").first().text().trim();
    if (!name) return;

    const href = $card.find("a").first().attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const priceText = $card.find(".new-old-price .price b").first().text().trim();
    const cash_price = priceText ? parseInt(priceText.replace(/[^\d]/g, ""), 10) || null : null;
    if (!cash_price) return;

    products.push({ name, url, cash_price });
  });
  return products;
}

async function fetchListingPage(categoryUrl, page) {
  const url = buildPageUrl(categoryUrl, page);
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);
  const products = extractListingProducts($);
  return { products };
}

function toResultProduct({ name, url, cash_price }) {
  return {
    name,
    cash_price,
    installment_price: null,
    source: "miarmenia",
    category: "monitors",
    url,
  };
}

const MAX_PAGES_SAFETY = 50;

export async function scrapeMiarmeniaMonitors() {
  const seen = new Map();

  for (const categoryUrl of CATEGORY_URLS) {
    let consecutiveNoNew = 0;

    for (let page = 1; page <= MAX_PAGES_SAFETY; page++) {
      let products;
      try {
        ({ products } = await fetchListingPage(categoryUrl, page));
      } catch (err) {
        console.error(`[miarmenia-monitors] page ${page} failed: ${err.message}`);
        break;
      }

      if (products.length === 0) {
        console.log(`[miarmenia-monitors] page ${page} empty — stopping pagination`);
        break;
      }

      let newCount = 0;
      for (const p of products) {
        if (!seen.has(p.url)) {
          seen.set(p.url, p);
          newCount++;
        }
      }

      console.log(
        `[miarmenia-monitors] page ${page} -> ${products.length} products, ${newCount} new`,
      );

      if (newCount === 0) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= 2) {
          console.log(
            `[miarmenia-monitors] stopping — 2 consecutive pages with no new products (likely repeating last page)`,
          );
          break;
        }
      } else {
        consecutiveNoNew = 0;
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const unique = [...seen.values()];
  console.log(`[miarmenia-monitors] ${unique.length} unique products`);

  const results = unique.map(toResultProduct);

  console.log(`[miarmenia-monitors] Total: ${results.length}`);
  return results;
}