import "dotenv/config";
import axios from "axios";

const URL = "https://admin.redstore.am/api/v1/export/catalog/beauty-and-care/category";

async function fetchAllPages() {
  const all = [];
  let page = 1;
  const headers = { "X-Export-Key": process.env.REDSTORE_EXPORT_KEY || "" };

  while (true) {
    const res = await axios.get(URL, {
      headers,
      params: {
        view: "all",
        "brand_id[]": 479,
        page,
        "price[min]": 4500,
        "price[max]": 308000,
        "category_id[]": "602,603",
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
    category: "dyson",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreDyson() {
  const raw = await fetchAllPages();
  return raw.map(normalize);
}