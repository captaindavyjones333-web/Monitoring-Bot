import axios from "axios";

const URL = "https://v1.vlv.am/api/category/photo";

async function fetchAllPages() {
  const all = [];
  let page = 1;

  while (true) {
    const res = await axios.post(
      URL,
      new URLSearchParams({ slug: "photo", page: String(page) }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    const data = res.data;
    const products = data.products || data.data || [];
    all.push(...products);

    const lastPage = data.lastPage || data.last_page || 1;
    console.log(
      `[vlv-camera] Page ${page}/${lastPage}: ${products.length} products`,
    );
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
    category: "camera",
    url: `https://vlv.am/Product/${Number(raw.seller_id) || ""}`,
  };
}

export async function scrapeVlvCamera() {
  const raw = await fetchAllPages();
  const results = raw.map(normalize).filter((p) => p.name && p.cash_price);
  console.log(`[vlv-camera] Total: ${results.length}`);
  return results;
}

export const scrapeVlvCameras = scrapeVlvCamera;
