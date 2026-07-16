import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://vesta.am";
const LIST_URL = "https://vesta.am/odorakichner/household-air-conditioners?tf_ff=83.23";

// Only accept product links that live under this category path. This is what
// separates real listing items from the ".product-thumb" cards rendered by
// unrelated widgets on the same page (e.g. the "Recently added" sidebar,
// which reuses the exact same card markup but can show sofas, coffee tables,
// robot vacuums, etc. — anything site-wide, not just air conditioners).
const CATEGORY_PATH = "/odorakichner/household-air-conditioners";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

function parsePrice(text) {
  const cleaned = text.replace(/[^\d]/g, "");
  return cleaned ? parseInt(cleaned, 10) : null;
}

function extractListingProducts($) {
  const products = [];
  $(".product-thumb").each((_, el) => {
    const $item = $(el);
    const $link = $item.find("h4 a").first();
    const name = $link.text().trim();
    if (!name) return;

    // Guard against the sidebar/widget pollution: skip anything whose link
    // doesn't belong to the air-conditioners category.
    const href = $link.attr("href") || "";
    if (!href.includes(CATEGORY_PATH)) return;

    const priceText = $item.find(".price").first().text().trim();
    const cash_price = parsePrice(priceText);
    if (!cash_price) return;

    const installmentText = $item.find("p").filter((_, p) => $(p).text().includes("Ապառիկ")).first().text();
    const installmentMatch = installmentText.match(/([\d,]+)/);
    const installment_price = installmentMatch ? parseInt(installmentMatch[1].replace(/,/g, ""), 10) : null;

    products.push({
      name,
      cash_price,
      installment_price,
      installation_price: 0, // vesta's standard installation is free
      source: "vesta",
      url: href,
    });
  });
  return products;
}

function getTotalPages($) {
  let maxPage = 1;
  $(".pagination a").each((_, el) => {
    const text = $(el).text().trim();
    const n = parseInt(text, 10);
    if (!isNaN(n)) maxPage = Math.max(maxPage, n);
  });
  return maxPage;
}

async function fetchListingPage(page) {
  const sep = LIST_URL.includes("?") ? "&" : "?";
  const url = page === 1 ? LIST_URL : `${LIST_URL}${sep}page=${page}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);
  const products = extractListingProducts($);
  const totalPages = page === 1 ? getTotalPages($) : null;
  return { products, totalPages };
}

export async function scrapeVestaAirConditioners() {
  const { products: firstPage, totalPages } = await fetchListingPage(1);
  console.log(`[vesta-ac] Page 1: ${firstPage.length} products, total pages: ${totalPages}`);

  const allProducts = [...firstPage];
  for (let page = 2; page <= totalPages; page++) {
    const { products } = await fetchListingPage(page);
    console.log(`[vesta-ac] Page ${page}: ${products.length} products`);
    allProducts.push(...products);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[vesta-ac] Total: ${allProducts.length}`);
  return allProducts;
}
