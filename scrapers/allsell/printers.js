import { crawlAllsellCategory } from "./crawler.js";

const CATEGORY_URLS = [
  "https://allsell.am/am/computer-equipment/printers",
];

export async function scrapeAllsellPrinters() {
  const results = await crawlAllsellCategory(CATEGORY_URLS, "allsell-printers");
  return results.map((p) => ({ ...p, category: "printers" }));
}
