import axios from "axios";

const URL = "https://v1.vlv.am/api/category/smartphones-1";

async function fetchAllPages() {
  const all = [];
  let page = 1;

  while (true) {
    const res = await axios.post(
      URL,
      new URLSearchParams({ slug: "smartphones-1", page: String(page) }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    const data = res.data;
    const products = data.products || data.data || [];
    all.push(...products);

    const lastPage = data.lastPage || data.last_page || 1;
    console.log(`[vlv-phones] Page ${page}/${lastPage}: ${products.length} products`);
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

  if (!/\bdual[\s-]?sim\b/i.test(name)) {
    name += " Dual-Sim";
  }

  return {
    name,
    cash_price: Number(raw.pricing?.selling_price) || null,
    installment_price: null, // vlv phones has no installment pricing
    source: "vlv",
  };
}

export async function scrapeVlvPhones() {
  const raw = await fetchAllPages();
  const results = raw.map(normalize).filter((p) => p.name && p.cash_price);
  console.log(`[vlv-phones] Total: ${results.length}`);
  return results;
}