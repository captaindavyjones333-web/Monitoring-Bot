import { crawlMobilecentreCategory } from "./crawler.js";

const LIST_URL =
  "https://mobilecentre.am/category/watches/141/0/?search=filters&searchData_brand=%5B%2255842%22%2C%2255413%22%2C%2255414%22%5D";

export async function scrapeMobileCentreWatches() {
  const results = await crawlMobilecentreCategory(LIST_URL, "mc-watches");
  return results.map((p) => ({ ...p, category: "watches" }));
}