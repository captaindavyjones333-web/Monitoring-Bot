import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://ispace.am";
const LIST_URL =
  "https://ispace.am/en/category/mac?filter_stock=1&filter_features[Product+subtype]=aq6akv";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

function parsePrice(text) {
  const cleaned = text.replace(/[^\d]/g, "");
  return cleaned ? parseInt(cleaned, 10) : null;
}

function extractCodeFromSlug(url) {
  const slug = url.split("/").pop() || "";
  const match = slug.match(/([a-z0-9]{5,10})(?:-([a-z]))?$/i);
  if (!match) return null;
  const core = match[1].toUpperCase();
  const suffix = match[2] ? `/${match[2].toUpperCase()}` : "";
  return `${core}${suffix}`;
}

function extractListingProducts($) {
  const products = [];

  $(".carousel-product").each((_, el) => {
    const $card = $(el);

    const nameEl = $card.find(".entity-card_name").first();
    const rawName = nameEl.attr("data-title")?.trim();
    if (!rawName) return;

    const href = nameEl.attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const priceText = $card
      .find(".carousel-product_price-value")
      .first()
      .text()
      .trim();
    const cash_price = parsePrice(priceText);
    if (!cash_price) return;

    const code = extractCodeFromSlug(url);
    const name = code ? `${rawName} ${code}` : rawName;

    products.push({ name, url, cash_price, source: "ispace",
    category: "macbooks" });
  });

  return products;
}

function getTotalPages($) {
  let maxPage = 1;
  $(".pagination_pages a").each((_, el) => {
    const text = $(el).text().trim();
    const n = parseInt(text, 10);
    if (!isNaN(n)) maxPage = Math.max(maxPage, n);
  });
  return maxPage;
}

async function fetchListingPage(page) {
  const separator = LIST_URL.includes("?") ? "&" : "?";
  const url = page === 1 ? LIST_URL : `${LIST_URL}${separator}page=${page}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(res.data);

  // TEMP DEBUG
  console.log(
    `[ispace-debug] page ${page} response length: ${res.data.length}`,
  );
  console.log(
    `[ispace-debug] .carousel-product count: ${$(".carousel-product").length}`,
  );
  console.log(`[ispace-debug] .entity-card count: ${$(".entity-card").length}`);
  console.log(
    `[ispace-debug] .entity-card_name count: ${$(".entity-card_name").length}`,
  );

  const products = extractListingProducts($);
  const totalPages = page === 1 ? getTotalPages($) : null;
  return { products, totalPages };
}

export async function scrapeIspaceMacbooks() {
  const { products: firstPage, totalPages } = await fetchListingPage(1);
  console.log(
    `[ispace-macbooks] Page 1: ${firstPage.length} products, total pages: ${totalPages}`,
  );

  const allProducts = [...firstPage];

  for (let page = 2; page <= totalPages; page++) {
    const { products } = await fetchListingPage(page);
    console.log(`[ispace-macbooks] Page ${page}: ${products.length} products`);
    allProducts.push(...products);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[ispace-macbooks] Total: ${allProducts.length}`);
  return allProducts;
}
