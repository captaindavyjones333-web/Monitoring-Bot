import axios from "axios";
import { parseListingHtml } from "./parseListing.js";

const STORE = "notebookcentre";
const LISTING_URL = "https://notebookcentre.am/en/get-products";
const CATEGORY_ID = 147;
const MAX_PAGES_SAFETY = 50;

const client = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent": "MonitoringBot/1.0 (+internal price comparison)",
    Accept: "text/html,application/json",
  },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchListingPage(page) {
  const { data } = await client.get(LISTING_URL, {
    params: {
      category: CATEGORY_ID,
      page,
    },
  });
  return data;
}

export async function scrapeNotebookcentreMonitors() {
  let page = 1;
  let allStubs = [];

  while (page <= MAX_PAGES_SAFETY) {
    try {
      const data = await fetchListingPage(page);
      const stubs = parseListingHtml(data.products || "");

      if (stubs.length === 0) {
        console.log(
          `[notebookcentre-monitors] page ${page} empty — stopping pagination`,
        );
        break;
      }

      console.log(
        `[notebookcentre-monitors] page ${page} -> ${stubs.length} products`,
      );
      allStubs = allStubs.concat(stubs);
      page += 1;
      await sleep(250);
    } catch (err) {
      console.error(
        `[notebookcentre-monitors] failed on page ${page}: ${err.message}`,
      );
      break;
    }
  }

  const results = allStubs
    .filter((s) => s.name && s.price)
    .map((stub) => ({
      name: stub.name,
      cash_price: stub.price,
      installment_price: stub.monthly_price || null,
      source: STORE,
      category: "monitors",
      url: stub.url,
    }));

  console.log(`[notebookcentre-monitors] Total: ${results.length}`);
  return results;
}
