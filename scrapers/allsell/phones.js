import { crawlAllsellCategory } from "./crawler.js";

const CATEGORY_URLS = [
  "https://allsell.am/am/phones?cat=45&price=0-699600", // Apple
  "https://allsell.am/am/phones?cat=48&price=0-699600", // Samsung
  "https://allsell.am/am/phones?cat=44&price=0-699600", // Xiaomi
  "https://allsell.am/am/phones?cat=51&price=0-699600", // Google Pixel
];

export async function scrapeAllsellPhones() {
  return crawlAllsellCategory(CATEGORY_URLS, "allsell-phones");
}