import { fetchAllBrands } from "./client.js";
import axios from "axios";

const BRAND_IDS = {
  samsung: 295,
  apple: 294,
};

function normalize(raw) {
  return {
    name: raw.name.replace(/\s+/g, " ").trim(),
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
  };
}

async function fetchMarshallHeadphones() {
  const results = [];
  let page = 1;

  while (true) {
    const res = await axios.get(
      "https://admin.redstore.am/api/v1/catalog/Marshall/search",
      { params: { "category_id[]": 634, page, lang: "en" } },
    );
    const { last_page, data } = res.data.data.products;
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