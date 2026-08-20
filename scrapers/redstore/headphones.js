import { fetchAllBrands } from "./client.js";
import axios from "axios";

const BRAND_IDS = {
  samsung: 295,
  apple: 294,
  xiaomi: 296,
  sony: 303,
  oneplus: 304,
  jbl: 307,
  beats: 330,
  bose: 331,
  logitech: 358,
  belkin: 427,
  nothing: 478,
  dyson: 479,
};

function normalize(raw) {
  return {
    name: raw.name.replace(/\s+/g, " ").trim(),
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
    category: "headphones",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

async function fetchMarshallHeadphones() {
  const results = [];
  let page = 1;
  const headers = { "X-Export-Key": process.env.REDSTORE_EXPORT_KEY || "" };

  while (true) {
    const res = await axios.get(
      "https://admin.redstore.am/api/v1/export/catalog/Marshall/search",
      {
        headers,
        params: { "category_id[]": 634, page, lang: "en" },
      },
    );
    const productsObj = res.data?.products || res.data?.data?.products;
    const { last_page, data } = productsObj;
    results.push(...data.map(normalize));
    if (page >= last_page) break;
    page++;
  }

  return results;
}

export async function scrapeRedstoreHeadphones() {
  const brandResults = await fetchAllBrands("headphones", BRAND_IDS, normalize);
  const marshallResults = await fetchMarshallHeadphones();
  return [...brandResults, ...marshallResults];
}
