import "dotenv/config";
import axios from "axios";
import { isConsoleProduct } from "../../core/gamingFilter.js";

const URL = "https://admin.redstore.am/api/v1/export/catalog/game-consoles/category";

const BRAND_IDS = {
  sony: 303,
  brand_509: 509,
  brand_510: 510,
  brand_490: 490,
  brand_306: 306,
  brand_310: 310,
  brand_299: 299,
  brand_358: 358,
  brand_516: 516,
  brand_517: 517,
  brand_531: 531,
};

async function fetchBrandPages(brandId) {
  const all = [];
  let page = 1;
  const headers = { "X-Export-Key": process.env.REDSTORE_EXPORT_KEY || "" };

  while (true) {
    const res = await axios.get(URL, {
      headers,
      params: {
        view: "all",
        "brand_id[]": brandId,
        page,
        "price[min]": 6900,
        "price[max]": 599000,
        "category_id[]": 452,
        lang: "hy",
      },
    });
    const productsObj = res.data?.products || res.data?.data?.products;
    const { last_page, data } = productsObj;
    all.push(...data);
    if (page >= last_page) break;
    page++;
  }

  return all;
}

function normalize(raw) {
  return {
    name: raw.name.replace(/\s+/g, " ").trim(),
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
    category: "gaming",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreGaming() {
  const results = [];

  for (const [brand, id] of Object.entries(BRAND_IDS)) {
    try {
      const raw = await fetchBrandPages(id);
      results.push(...raw.map(normalize));
      console.log(`[redstore-gaming] ${brand} (id=${id}): ${raw.length} raw products`);
      if (raw.length > 0) {
        console.log(`[redstore-gaming]   sample: "${raw[0].name}"`);
      }
    } catch (err) {
      console.error(`[redstore-gaming] failed brand ${brand}: ${err.message}`);
    }
  }

  const filtered = results.filter((p) => isConsoleProduct(p.name));
  console.log(`[redstore-gaming] ${filtered.length} after console-only filter (from ${results.length})`);
  return filtered;
}