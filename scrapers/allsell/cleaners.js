import { crawlAllsellCategory } from "./crawler.js";

const CATEGORY_URLS = [
  "https://allsell.am/am/home-appliances/vacuum-cleaners",
];

export async function scrapeAllsellCleaners() {
  const results = await crawlAllsellCategory(CATEGORY_URLS, "allsell-cleaners");
  return results.map((p) => ({ ...p, category: "cleaners" }));
}
