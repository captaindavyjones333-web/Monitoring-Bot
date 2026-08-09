import { crawlYerevanMobileCategory } from "./crawler.js";

const LIST_URLS = [
  "https://www.yerevanmobile.am/am/electronics/phones.html?brands=171%2C11%2C12%2C38%2C411&product_list_limit=48",
  "https://www.yerevanmobile.am/am/heraxosner.html?cat=122",
  "https://www.yerevanmobile.am/am/catalogsearch/result/index/?q=honor",
];

const MANUAL_URLS = [
  {
    name: "Apple iPhone 17",
    url: "https://www.yerevanmobile.am/am/apple-iphone-17.html",
  },
  {
    name: "Google Pixel 10",
    url: "https://www.yerevanmobile.am/am/google-pixel-10.html"
  }
];

export async function scrapeYerevanMobilePhones() {
  return crawlYerevanMobileCategory(LIST_URLS, "ym-phones", MANUAL_URLS);
}