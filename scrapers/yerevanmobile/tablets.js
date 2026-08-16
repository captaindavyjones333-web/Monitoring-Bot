import { crawlYerevanMobileCategory } from "./crawler.js";

const LIST_URL =
  "https://www.yerevanmobile.am/am/electronics/tablets.html";

export async function scrapeYerevanMobileTablets() {
  return crawlYerevanMobileCategory(LIST_URL, "ym-tablets", [], {
    includeYear: true,
  });
}
