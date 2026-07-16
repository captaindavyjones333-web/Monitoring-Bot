import axios from "axios";

const URL = "https://v1.vlv.am/api/category/air-conditioner";

async function fetchAllPages() {
  const all = [];
  let page = 1;

  while (true) {
    const res = await axios.post(
      URL,
      new URLSearchParams({ slug: "air-conditioner", page: String(page) }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    const data = res.data;
    const products = data.products || data.data || [];
    all.push(...products);

    const lastPage = data.lastPage || data.last_page || 1;
    console.log(`[vlv-ac] Page ${page}/${lastPage}: ${products.length} products`);
    if (page >= lastPage) break;
    page++;
  }

  return all;
}

function normalize(raw) {
  return {
    name: (raw.product_name || "").trim(),
    cash_price: Number(raw.pricing?.selling_price) || null,
    installment_price: null,
    installation_price: Number(raw.pricing?.installing_price) || null,
    source: "vlv",
  };
}

export async function scrapeVlvAirConditioners() {
  const raw = await fetchAllPages();
  const results = raw.map(normalize).filter((p) => p.name && p.cash_price);
  console.log(`[vlv-ac] Total: ${results.length}`);
  return results;
}