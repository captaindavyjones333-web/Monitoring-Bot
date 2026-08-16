import { fetchAllBrands } from "./client.js";

// brand_id[]=307,308,309 as one combined param per your URL — passing
// as a single joined value since fetchAllBrands expects one ID per call;
// if the API only accepts them combined (not per-brand), we call once
// with a synthetic key.
const BRAND_IDS = {
  speakers: "307,308,309",
};

function normalize(raw) {
  const name = typeof raw?.name === "string" ? raw.name : "";

  return {
    name: name.replace(/\s+/g, " ").trim(),
    price: Number(raw?.price) || null,
    cash_price: Number(raw?.cash_price) || null,
    installment_price: Number(raw?.installment_price) || null,
    source: "redstore",
    url: raw?.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstoreSpeakers() {
  return fetchAllBrands("speakers", BRAND_IDS, normalize);
}