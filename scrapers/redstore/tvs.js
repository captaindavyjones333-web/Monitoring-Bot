import "dotenv/config";
import axios from "axios";

const BASE_URL = "https://admin.redstore.am/api/v1/export/catalog/tv/category";
const BRAND_IDS = {
  xiaomi: 296,
  samsung: 295,
  evvoli: 327,
};

async function fetchBrandPages(brandId) {
  const results = [];
  let page = 1;
  const headers = { "X-Export-Key": process.env.REDSTORE_EXPORT_KEY || "" };

  while (true) {
    const res = await axios.get(BASE_URL, {
      headers,
      params: {
        view: "all",
        "brand_id[]": brandId,
        page,
        "price[min]": 59000,
        "price[max]": 1659000,
        lang: "hy",
      },
    });

    const productsObj = res.data?.products || res.data?.data?.products;
    const { last_page, data } = productsObj;
    results.push(...data);

    if (page >= last_page) break;
    page++;
  }

  return results;
}

function normalize(raw) {
  return {
    name: raw.name.replace(/\s+/g, " ").trim(),
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreTvs() {
  const results = [];

  for (const [brand, id] of Object.entries(BRAND_IDS)) {
    try {
      const raw = await fetchBrandPages(id);
      results.push(...raw.map(normalize));
      console.log(`[redstore-tvs] ${brand}: ${raw.length} products`);
    } catch (err) {
      console.error(`[redstore-tvs] failed to fetch brand ${brand}: ${err.message}`);
    }
  }

  return results;
}