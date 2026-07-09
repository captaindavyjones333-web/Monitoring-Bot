import { crawlAllsellCategory } from "./crawler.js";

const CATEGORY_URLS = [
  "https://allsell.am/am/computer-equipment/tablets",
];

export async function scrapeAllsellTablets() {
  return crawlAllsellCategory(CATEGORY_URLS, "allsell-tablets");
}