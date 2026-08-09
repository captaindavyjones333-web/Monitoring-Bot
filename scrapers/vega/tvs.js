import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://vega.am";
const LIST_URL =
  "https://vega.am/home-appliances/audio-video-and-photo/tv/?ocf=F1S0V124";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

function parsePrice(text) {
  const cleaned = text.replace(/[^\d]/g, "");
  return cleaned ? parseInt(cleaned, 10) : null;
}

function extractListingProducts($) {
  const products = [];

  $(".product-thumb").each((_, el) => {
    const $item = $(el);

    const stockStatus = $item.find(".stock-status").first().text().trim();
    if (stockStatus === "Առկա չէ") return;

    const name = $item.find(".product-name a").first().text().trim();
    if (!name) return;

    const href = $item.find(".product-name a").first().attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const $priceBox = $item.find(".price").first();
    const specialText = $priceBox.find(".price-new").first().text().trim();
    const regularText = $priceBox.find(".price-old").first().text().trim();
    const cash_price = parsePrice(specialText) || parsePrice(regularText);
    if (!cash_price) return;

    products.push({ name, url, cash_price });
  });

  return products;
}

function getTotalPages($) {
  let maxPage = 1;
  $("ul.pagination a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/[?&]page=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
  });
  return maxPage;
}

async function fetchListingPage(page) {
  const url = page === 1 ? LIST_URL : `${LIST_URL}&page=${page}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);
  const products = extractListingProducts($);
  const totalPages = page === 1 ? getTotalPages($) : null;
  return { products, totalPages };
}

export async function scrapeVegaTvs() {
  const { products: firstPage, totalPages } = await fetchListingPage(1);
  console.log(`[vega-tvs] ${firstPage.length} products found, total pages: ${totalPages}`);

  const allListingProducts = [...firstPage];

  for (let page = 2; page <= totalPages; page++) {
    const { products } = await fetchListingPage(page);
    console.log(`[vega-tvs] Page ${page}: ${products.length} products`);
    allListingProducts.push(...products);
    await new Promise((r) => setTimeout(r, 300));
  }

  const results = allListingProducts.map((p) => ({
    name: p.name,
    cash_price: p.cash_price,
    installment_price: null, // vega has no installment pricing
    source: "vega",
  }));

  // Deduplicate by name — keep first occurrence
  const seen = new Map();
  for (const p of results) {
    if (!seen.has(p.name)) seen.set(p.name, p);
  }

  const unique = [...seen.values()];
  console.log(`[vega-tvs] Total: ${unique.length}`);
  return unique;
}