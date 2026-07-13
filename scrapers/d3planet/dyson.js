import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://3dplanet.am";
const LIST_URL = "https://3dplanet.am/hy/store/hair-dryers?brands[]=41";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

async function fetchListing() {
  const res = await axios.get(LIST_URL, { headers: HEADERS });
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
    console.warn(`[3d-dyson] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrape3DPlanetDyson() {
  const listingProducts = await fetchListing();
  console.log(`[3d-dyson] ${listingProducts.length} products found`);

  const results = [];
  for (let i = 0; i < listingProducts.length; i++) {
    const { name, url } = listingProducts[i];
    console.log(`[3d-dyson] (${i + 1}/${listingProducts.length}) ${name}`);
    const product = await fetchProductPrice(name, url);
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[3d-dyson] Total: ${results.length}`);
  return results;
}