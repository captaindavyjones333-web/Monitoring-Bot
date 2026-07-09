import { crawlYerevanMobileCategory } from "./crawler.js";

const LIST_URL =
  "https://www.yerevanmobile.am/am/electronics/phones.html?brands=171%2C11%2C12%2C38%2C411&product_list_limit=48";

const MANUAL_URLS = [
  {
    name: "Apple iPhone 17",
    url: "https://www.yerevanmobile.am/am/apple-iphone-17.html",
  },
];

export async function scrapeYerevanMobilePhones() {
  return crawlYerevanMobileCategory(LIST_URL, "ym-phones", MANUAL_URLS);
}