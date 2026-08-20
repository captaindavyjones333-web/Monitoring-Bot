import { crawlMobilecentreCategory } from "./crawler.js";

const LIST_URL =
  "https://mobilecentre.am/category/phones/138/0/?search=filters&searchData_brand=%5B%2255842%22%2C%2255413%22%2C%2255414%22%5D";

export async function scrapeMobileCentrePhones() {
  const results = await crawlMobilecentreCategory(LIST_URL, "mc-phones");
  return results.map((p) => ({ ...p, category: "phones" }));
}