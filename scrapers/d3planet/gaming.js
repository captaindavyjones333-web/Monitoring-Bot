import axios from "axios";
import * as cheerio from "cheerio";
import { isConsoleProduct } from "../../core/gamingFilter.js";

const BASE_URL = "https://3dplanet.am";
const LIST_URLS = [
  "https://3dplanet.am/hy/store/gaming-consoles?brands[]=10&sort=none", // Sony
  "https://3dplanet.am/hy/store/gaming-consoles?brands[]=48&sort=none", // Nintendo
  "https://3dplanet.am/hy/store/gaming-consoles?brands[]=36&sort=none", // Xbox
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

async function fetchListing(listUrl) {
  const res = await axios.get(listUrl, { headers: HEADERS });
  const $ = cheerio.load(res.data);

  const products = [];
  $("h3").each((_, el) => {
    const name = $(el).text().trim();
    const detailUrl = $(el)
      .closest("div")
      .find("a[href*='/store/product/']")
      .first()
      .attr("href");
    if (name && detailUrl) {
      const fullUrl = detailUrl.startsWith("http") ? detailUrl : `${BASE_URL}${detailUrl}`;
      products.push({ name, url: fullUrl });
    }
  });
  return products;
}

async function fetchProductPrice(baseName, url) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);
    const raw = $("#price").attr("data-price") || $("#price").text();
    const cleaned = raw ? raw.replace(/[^\d.]/g, "") : null;
    const cash_price = cleaned ? parseFloat(cleaned) : null;
    if (!cash_price) return null;

    return { name: baseName, cash_price, installment_price: null, source: "3dplanet" };
  } catch (err) {
    console.warn(`[3d-gaming] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrape3DPlanetGaming() {
  const allListing = [];
  for (const listUrl of LIST_URLS) {
    const products = await fetchListing(listUrl);
    console.log(`[3d-gaming] ${listUrl}: ${products.length} products`);
    allListing.push(...products);
    await new Promise((r) => setTimeout(r, 300));
  }

  const filtered = allListing.filter((p) => isConsoleProduct(p.name));
  console.log(`[3d-gaming] ${filtered.length} after console-only filter (from ${allListing.length})`);

  const results = [];
  for (let i = 0; i < filtered.length; i++) {
    const { name, url } = filtered[i];
    console.log(`[3d-gaming] (${i + 1}/${filtered.length}) ${name}`);
    const product = await fetchProductPrice(name, url);
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[3d-gaming] Total: ${results.length}`);
  return results;
}