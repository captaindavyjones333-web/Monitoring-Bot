import { crawlMobilecentreCategory } from "./crawler.js";

const LIST_URL =
  "https://mobilecentre.am/category/tablets/139/0/?search=filters&searchData_brand=%5B%2255842%22%2C%2255413%22%2C%2255414%22%5D";

export async function scrapeMobileCentreTablets() {
  const results = await crawlMobilecentreCategory(LIST_URL, "mc-tablets");
  return results.map((p) => ({ ...p, category: "tablets" }));
}