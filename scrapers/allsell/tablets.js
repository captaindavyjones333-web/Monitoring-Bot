import { crawlAllsellCategory } from "./crawler.js";

const CATEGORY_URLS = [
  "https://allsell.am/am/computer-equipment/tablets",
];

export async function scrapeAllsellTablets() {
  const results = await crawlAllsellCategory(CATEGORY_URLS, "allsell-tablets");
  return results.map((p) => ({ ...p, category: "tablets" }));
}