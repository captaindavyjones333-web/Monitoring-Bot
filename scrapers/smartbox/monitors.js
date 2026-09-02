import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.smartbox.am";

const CATEGORY_URLS = [
  "https://www.smartbox.am/1/am/shop/index/display/", // Monitors
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

const MAX_PAGES_SAFETY = 50;

// smartbox.am redirects the very first request in a loop until it sees a
// cookie come back (session/anti-bot token set on the 302). Plain axios
// doesn't persist Set-Cookie across redirects, so it just bounces forever
// and hits axios's maxRedirects. A cookie jar fixes it: the jar captures
// the cookie from the first redirect response and axios-cookiejar-support
// attaches it automatically on the next hop, so the chain actually
// resolves instead of looping. The jar is created once per scrape run and
// reused across all page requests below.
const jar = new CookieJar();
const client = wrapper(
  axios.create({
    headers: HEADERS,
    timeout: 15000,
    maxRedirects: 5,
    jar,
    withCredentials: true,
  }),
);

function buildPageUrl(categoryUrl, page) {
  // categoryUrl looks like: https://www.smartbox.am/1/am/shop/index/display/
  // page number is the path segment right after the domain.
  return categoryUrl.replace(/\/\d+\/am\/shop\/index\/display\/?/, `/${page}/am/shop/index/display/`);
}

function extractListingProducts($) {
  const products = [];
  $("#products form.add").each((_, el) => {
    const $card = $(el);
    const name = $card.find(".title a").first().text().trim();
    if (!name) return;

    const href = $card.find(".title a").attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const priceRaw = $card.find("input[name='price']").attr("value");
    const cash_price = priceRaw ? parseInt(priceRaw, 10) : null;
    if (!cash_price) return;

    products.push({ name, url, cash_price });
  });
  return products;
}

async function fetchListingPage(categoryUrl, page) {
  const url = buildPageUrl(categoryUrl, page);
  const res = await client.get(url);
  const $ = cheerio.load(res.data);
  const products = extractListingProducts($);
  return { products };
}

function toResultProduct({ name, url, cash_price }) {
  return {
    name,
    cash_price,
    installment_price: null,
    source: "smartbox",
    category: "monitors",
    url,
  };
}

export async function scrapeSmartboxMonitors() {
  const seen = new Map();

  for (const categoryUrl of CATEGORY_URLS) {
    let consecutiveNoNew = 0;

    for (let page = 1; page <= MAX_PAGES_SAFETY; page++) {
      let products;
      try {
        ({ products } = await fetchListingPage(categoryUrl, page));
      } catch (err) {
        console.error(`[smartbox-monitors] page ${page} failed: ${err.message}`);
        break;
      }

      if (products.length === 0) {
        console.log(`[smartbox-monitors] page ${page} empty — stopping pagination`);
        break;
      }

      let newCount = 0;
      for (const p of products) {
        if (!seen.has(p.url)) {
          seen.set(p.url, p);
          newCount++;
        }
      }

      console.log(
        `[smartbox-monitors] page ${page} -> ${products.length} products, ${newCount} new`,
      );

      if (newCount === 0) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= 2) {
          console.log(
            `[smartbox-monitors] stopping — 2 consecutive pages with no new products (likely repeating last page)`,
          );
          break;
        }
      } else {
        consecutiveNoNew = 0;
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const unique = [...seen.values()];
  console.log(`[smartbox-monitors] ${unique.length} unique products`);

  const results = unique.map(toResultProduct);

  console.log(`[smartbox-monitors] Total: ${results.length}`);
  return results;
}