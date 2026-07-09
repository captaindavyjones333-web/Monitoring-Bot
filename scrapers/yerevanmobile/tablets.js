import { crawlYerevanMobileCategory } from "./crawler.js";

const LIST_URL =
  "https://www.yerevanmobile.am/am/electronics/tablets.html?brands=171%2C11%2C12&product_list_limit=48";

export async function scrapeYerevanMobileTablets() {
  return crawlYerevanMobileCategory(LIST_URL, "ym-tablets");
}