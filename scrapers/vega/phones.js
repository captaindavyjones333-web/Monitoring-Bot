import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://vega.am";
const LIST_URL =
  "https://vega.am/home-appliances/phones-and-gadgets/smart-phones/?ocf=F1S0V2427V3163";

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
    if (stockStatus === "Առկա չէ") return; // explicitly excluded per instructions
    // "Ճշտել առկայությունը" and "Առկա է" are both kept

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

function extractSpecs($) {
  let ram = null;
  let storage = null;

  $(".short-attribute").each((_, el) => {
    const $attr = $(el);
    const label = $attr.find(".attr-name").text().trim();
    const value = $attr.find(".attr-text").text().trim();

    if (label.includes("Օպերատիվ հիշ")) ram = value;
    if (label.includes("Ներ. հիշող")) storage = value;
  });

  return { ram, storage };
}

async function fetchProductDetail(baseName, url, listingCashPrice) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    const { ram, storage } = extractSpecs($);

    let name = baseName;
    if (ram && storage && !/\d+gb\/\d+gb/i.test(name)) {
      name = `${baseName} ${ram}GB/${storage}GB`;
    }
    // SIM is always Dual SIM per your instructions
    if (!name.toLowerCase().includes("sim")) {
      name = `${name} Dual-Sim`;
    }

    const priceAttr =
      $(".price").first().attr("data-special-value") ||
      $(".price").first().attr("data-price-value");
    const cash_price = priceAttr ? parseInt(priceAttr, 10) : listingCashPrice;

    if (!cash_price) return null;

    return {
      name,
      cash_price,
      installment_price: null, // vega has no installment pricing
      source: "vega",
    };
  } catch (err) {
    console.warn(`[vega-phones] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrapeVegaPhones() {
  const res = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);
  const listingProducts = extractListingProducts($);
  console.log(`[vega-phones] ${listingProducts.length} products found`);

  const results = [];
  for (let i = 0; i < listingProducts.length; i++) {
    const { name, url, cash_price } = listingProducts[i];
    console.log(`[vega-phones] (${i + 1}/${listingProducts.length}) ${name}`);
    const product = await fetchProductDetail(name, url, cash_price);
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[vega-phones] Total: ${results.length}`);
  return results;
}