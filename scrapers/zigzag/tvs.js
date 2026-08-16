import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const BASE_URL = "https://www.zigzag.am";
const LIST_URL = "https://www.zigzag.am/am/tv-audio-video/tvs.html";

async function extractListingProducts(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll("li");
    const results = [];

    items.forEach((item) => {
      const nameEl = item.querySelector(".product_name");
      const name = nameEl?.textContent?.trim();
      if (!name) return;

      const href = nameEl.getAttribute("href");
      if (!href) return;

      const priceEl = item.querySelector("[data-price-type='finalPrice']");
      const priceAmount = priceEl?.getAttribute("data-price-amount");
      const cash_price = priceAmount ? parseInt(priceAmount, 10) : null;
      if (!cash_price) return;

      results.push({ name, href, cash_price });
    });

    return results;
  });
}

// NEW: reads the paging widget and returns the highest page number found
async function getMaxPage(page) {
  return page.evaluate(() => {
    const links = document.querySelectorAll(".paging a");
    let max = 1;
    links.forEach((a) => {
      const text = a.textContent?.trim();
      const num = parseInt(text, 10);
      if (!Number.isNaN(num) && num > max) max = num;
    });
    return max;
  });
}

// NEW: builds a page URL by setting/overwriting the `p` query param,
// preserving any other params (e.g. manufacturer filter)
function buildPageUrl(baseUrl, pageNum) {
  const url = new URL(baseUrl);
  if (pageNum > 1) {
    url.searchParams.set("p", String(pageNum));
  } else {
    url.searchParams.delete("p");
  }
  return url.toString();
}

async function waitForChallengeResolution(page, maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const title = await page.title();
    if (!title.includes("Just a moment")) return true;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

// NEW: navigates to a given URL and handles the Cloudflare-style challenge
async function gotoWithChallengeHandling(page, url, label) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  const title = await page.title();
  if (title.includes("Just a moment")) {
    const resolved = await waitForChallengeResolution(page);
    if (!resolved) {
      console.warn(`[zigzag-tvs] ${label}: challenge never resolved, skipping`);
      return false;
    }
  }
  return true;
}

export async function scrapeZigzagTvs() {
  const browser = await puppeteerExtra.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
    ],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  );

  try {
    console.log("[zigzag-tvs] Loading listing page 1...");
    const ok = await gotoWithChallengeHandling(page, LIST_URL, "page 1");
    if (!ok) return [];

    const maxPage = await getMaxPage(page);
    console.log(`[zigzag-tvs] Detected ${maxPage} page(s)`);

    // scrape page 1 (already loaded)
    let listingProducts = await extractListingProducts(page);
    console.log(`[zigzag-tvs] page 1: ${listingProducts.length} products`);

    // scrape remaining pages
    for (let p = 2; p <= maxPage; p++) {
      const pageUrl = buildPageUrl(page.url(), p);
      console.log(`[zigzag-tvs] Loading page ${p}: ${pageUrl}`);

      const pageOk = await gotoWithChallengeHandling(page, pageUrl, `page ${p}`);
      if (!pageOk) continue; // skip this page but keep going

      const products = await extractListingProducts(page);
      console.log(`[zigzag-tvs] page ${p}: ${products.length} products`);
      listingProducts = listingProducts.concat(products);

      // small politeness delay between pages
      await new Promise((r) => setTimeout(r, 1000));
    }

    const results = listingProducts.map((p) => ({
      name: p.name,
      cash_price: p.cash_price,
      installment_price: null,
      source: "zigzag",
      url: p.href ? (p.href.startsWith("http") ? p.href : `https://www.zigzag.am${p.href}`) : null,
    }));

    console.log(`[zigzag-tvs] Total: ${results.length}`);
    return results;
  } finally {
    await browser.close();
  }
}