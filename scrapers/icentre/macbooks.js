import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://icentre.am";

const CATEGORY_IDS = [1816, 1955, 1817]; // Air, Neo, Pro

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

  $("a.prodLink").each((_, el) => {
    const $link = $(el);
    const name = $link.text().trim();
    if (!name) return;

    const href = $link.attr("href");
    const url = href ? (href.startsWith("http") ? href : `${BASE_URL}/${href.replace(/^\//, "")}`) : null;

    // The outer <tr> containing this product's info block; price sits
    // in the immediately-following sibling <tr>.
    const $outerTr = $link.closest("tr").parent().closest("tr");
    const $priceTr = $outerTr.next("tr");

    let cash_price = null;

    $priceTr.find(".price").each((i, priceEl) => {
      const $price = $(priceEl);
      const precedingText = $price.prev("span.buyLink").text().trim();
      const priceVal = parsePrice($price.text());

      if (precedingText.includes("Գինը")) {
        cash_price = priceVal;
      }
      // Deliberately not capturing "Ապառիկ" — it's a monthly payment
      // figure, not a comparable lump-sum installment price.
    });

    if (!cash_price) return;

    products.push({
      name,
      cash_price,
      installment_price: null,
      source: "icentre",
    category: "macbooks",
      url,
    });
  });

  return products;
}

function getTotalPages($) {
  let maxPage = 1;
  $("a.pN").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/Page=(\d+)/i);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10) + 1);
  });
  return maxPage;
}

async function fetchListingPage(categoryId, page) {
  const url = `${BASE_URL}/Default.aspx?CategoryID=${categoryId}&Page=${page}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);
  const products = extractListingProducts($);
  const totalPages = page === 0 ? getTotalPages($) : null;
  return { products, totalPages };
}

export async function scrapeIcentreMacbooks() {
  const allProducts = [];

  for (const categoryId of CATEGORY_IDS) {
    const { products: firstPage, totalPages } = await fetchListingPage(
      categoryId,
      0,
    );
    console.log(
      `[icentre-macbooks] Category ${categoryId} Page 0: ${firstPage.length} products, total pages: ${totalPages}`,
    );
    allProducts.push(...firstPage);

    for (let page = 1; page < totalPages; page++) {
      const { products } = await fetchListingPage(categoryId, page);
      console.log(
        `[icentre-macbooks] Category ${categoryId} Page ${page}: ${products.length} products`,
      );
      allProducts.push(...products);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`[icentre-macbooks] Total: ${allProducts.length}`);
  return allProducts;
}
