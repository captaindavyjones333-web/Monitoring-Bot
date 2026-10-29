import { crawlAllsellCategory } from "./crawler.js";

const CATEGORY_URLS = [
  "https://allsell.am/am/phones?cat=45", // Apple
  "https://allsell.am/am/phones?cat=48", // Samsung
  "https://allsell.am/am/phones?cat=44", // Xiaomi
  "https://allsell.am/am/phones?cat=51", // Google Pixel
  "https://allsell.am/am/phones?cat=47"
];

export async function scrapeAllsellPhones() {
  const results = await crawlAllsellCategory(CATEGORY_URLS, "allsell-phones");
  return results.map((p) => ({ ...p, category: "phones" }));
}