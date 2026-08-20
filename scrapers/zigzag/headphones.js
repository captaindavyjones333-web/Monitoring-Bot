import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const BASE_URL = "https://www.zigzag.am";
const LIST_URL =
  "https://www.zigzag.am/am/accessories/headphones-and-headsets.html";

// Target brands — only keep products matching at least one.
const BRAND_REGEX =
  /\bsony\b|\bxiaomi\b|\boneplus\b|\bnothing\b|\blogitech\b|\bjbl\b|\bdyson\b|\bbose\b|\bbelkin\b|\bbeats\b|airpods|galaxy\s*buds|marshall|soundcore/i;

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

async function getMaxPage(page) {
  return page.evaluate(() => {
    const links = document.querySelectorAll(".paging a");
    let max = 1;
    links.forEach((a) => {
      const num = parseInt(a.textContent?.trim(), 10);
      if (!Number.isNaN(num) && num > max) max = num;
    });
    return max;
  });
}

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
    console.warn(
      `[zigzag-headphones] Still on challenge page (attempt ${attempt + 1}/${maxAttempts})...`,
    );
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

async function gotoWithChallengeHandling(page, url, label) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page
    .waitForSelector(".product_name", { timeout: 15000 })
    .catch(() =>
      console.warn(`[zigzag-tvs] ${label}: .product_name never appeared`),
    );
    
  const title = await page.title();
  if (title.includes("Just a moment")) {
    const resolved = await waitForChallengeResolution(page);
    if (!resolved) {
      console.warn(
        `[zigzag-headphones] ${label}: challenge never resolved, skipping`,
      );
      return false;
    }
  }
  return true;
}

export async function scrapeZigzagHeadphones() {
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
    console.log("[zigzag-headphones] Loading listing page 1...");
    const ok = await gotoWithChallengeHandling(page, LIST_URL, "page 1");
    if (!ok) return [];

    const page1Products = await extractListingProducts(page);
    console.log(`[zigzag-headphones] page 1: ${page1Products.length} products`);

    const seen = new Map();
    for (const p of page1Products) seen.set(p.name, p);

    // Pager only renders a sliding window of page numbers, and once `p`
    // exceeds the real last page the site silently re-serves page 1's
    // content instead of an empty page — so detect the end by "no new
    // products" rather than trusting getMaxPage() or an empty result.
    const MAX_PAGES = 40;
    let consecutiveNoNew = 0;

    for (let p = 2; p <= MAX_PAGES; p++) {
      const pageUrl = buildPageUrl(LIST_URL, p);
      console.log(`[zigzag-headphones] Loading page ${p}: ${pageUrl}`);

      const pageOk = await gotoWithChallengeHandling(
        page,
        pageUrl,
        `page ${p}`,
      );
      if (!pageOk) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= 2) {
          console.log(
            `[zigzag-headphones] page ${p}: challenge failed twice in a row, stopping`,
          );
          break;
        }
        continue;
      }

      const products = await extractListingProducts(page);

      let newCount = 0;
      for (const prod of products) {
        if (!seen.has(prod.name)) {
          seen.set(prod.name, prod);
          newCount++;
        }
      }

      console.log(
        `[zigzag-headphones] page ${p}: ${products.length} products, ${newCount} new`,
      );

      if (newCount === 0) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= 2) {
          console.log(
            `[zigzag-headphones] stopping — 2 consecutive pages with no new products`,
          );
          break;
        }
      } else {
        consecutiveNoNew = 0;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    let listingProducts = [...seen.values()];

    // Filter to only the brands we care about
    const filtered = listingProducts.filter((p) => BRAND_REGEX.test(p.name));
    console.log(
      `[zigzag-headphones] After brand filter: ${filtered.length} / ${listingProducts.length}`,
    );

    const results = filtered.map((p) => ({
      name: p.name,
      cash_price: p.cash_price,
      installment_price: null,
      source: "zigzag",
    category: "headphones",
      url: p.href
        ? p.href.startsWith("http")
          ? p.href
          : `${BASE_URL}${p.href}`
        : null,
    }));

    console.log(`[zigzag-headphones] Total: ${results.length}`);
    return results;
  } finally {
    await browser.close();
  }
}
