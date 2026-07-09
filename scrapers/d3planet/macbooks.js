import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://3dplanet.am";
const LIST_URL = "https://3dplanet.am/hy/store/laptops?brands[]=3&sort=none";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

async function getTotalPages() {
  const res = await axios.get(LIST_URL, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  let max = 1;
  $("a[href*='?page=']").each((_, el) => {
    const match = $(el).attr("href")?.match(/page=(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1]));
  });
  return max;
}

function buildPageUrl(page) {
  if (page === 1) return LIST_URL;
  const sep = LIST_URL.includes("?") ? "&" : "?";
  return `${LIST_URL}${sep}page=${page}`;
}

async function fetchListingPage(page) {
  const url = buildPageUrl(page);
  const res = await axios.get(url, { headers: HEADERS });
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
    console.warn(`[3d-macbooks] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrape3DPlanetMacbooks() {
  const totalPages = await getTotalPages();
  console.log(`[3d-macbooks] ${totalPages} pages`);

  const listingProducts = [];
  for (let page = 1; page <= totalPages; page++) {
    const products = await fetchListingPage(page);
    listingProducts.push(...products);
    await new Promise((r) => setTimeout(r, 300));
  }

  const seenUrls = new Set();
  const unique = [];
  for (const p of listingProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  console.log(`[3d-macbooks] ${unique.length} unique products, fetching details...`);

  const results = [];
  for (let i = 0; i < unique.length; i++) {
    const { name, url } = unique[i];
    console.log(`[3d-macbooks] (${i + 1}/${unique.length}) ${name}`);
    const product = await fetchProductPrice(name, url);
    if (product) results.push(product);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[3d-macbooks] Total: ${results.length}`);
  return results;
}