import { crawlYerevanMobileCategory } from "./crawler.js";

const LIST_URLS = [
  "https://www.yerevanmobile.am/am/electronics/phones.html",
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