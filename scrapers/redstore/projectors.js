import { fetchCategory } from "./client.js";

function normalize(raw) {
  const name = typeof raw?.name === "string" ? raw.name : "";

  return {
    name: name.replace(/\s+/g, " ").trim(),
    price: Number(raw?.price) || null,
    cash_price: Number(raw?.cash_price) || null,
    installment_price: Number(raw?.installment_price) || null,
    source: "redstore",
    category: "projectors",
    url: raw?.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreProjectors() {
  return fetchCategory("projectors", normalize);
}
