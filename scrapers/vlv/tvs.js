import axios from "axios";

const URL = "https://v1.vlv.am/api/category/tv-1";

async function fetchAllPages() {
  const all = [];
  let page = 1;

  while (true) {
    const res = await axios.post(
      URL,
      new URLSearchParams({ slug: "tv-1", page: String(page) }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    const data = res.data;
    const products = data.products || data.data || [];
    all.push(...products);

    const lastPage = data.lastPage || data.last_page || 1;
    console.log(`[vlv-tvs] Page ${page}/${lastPage}: ${products.length} products`);
    if (page >= lastPage) break;
    page++;
  }

  return all;
}

function normalize(raw) {
  const brand = raw.brand?.name || "";
  const rawName = raw.product_name || "";
  let name = rawName.toLowerCase().includes(brand.toLowerCase())
    ? rawName.trim()
    : `${brand} ${rawName}`.trim();

  return {
    name,
    cash_price: Number(raw.pricing?.selling_price) || null,
    installment_price: null,
    source: "vlv",
  };
}

export async function scrapeVlvTvs() {
  const raw = await fetchAllPages();
  const results = raw.map(normalize).filter((p) => p.name && p.cash_price);
  console.log(`[vlv-tvs] Total: ${results.length}`);
  return results;
}