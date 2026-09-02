import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const BASE_URL = "https://dgcomp.am";
const LIST_URL =
  "https://dgcomp.am/product-category/%d5%bf%d5%ba%d5%ab%d5%b9%d5%b6%d5%a5%d6%80-%d6%87-%d5%ba%d6%80%d5%b8%d5%a5%d5%af%d5%bf%d5%b8%d6%80%d5%b6%d5%a5%d6%80/%d5%ba%d6%80%d5%b8%d5%a5%d5%af%d5%bf%d5%b8%d6%80/";

async function extractListingProducts(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll("ul.products li.product");
    const results = [];

    items.forEach((item) => {
      const nameEl = item.querySelector(".product-name.product_title a");
      const name = nameEl?.textContent?.trim();
      if (!name) return;

      const href = nameEl.getAttribute("href");
      if (!href) return;

      const priceEl = item.querySelector(".price .amount bdi") ||
        item.querySelector(".price .amount") ||
        item.querySelector(".price");
      const priceText = priceEl?.textContent?.trim();
      const digitsOnly = priceText ? priceText.replace(/[^\d]/g, "") : "";
      const cash_price = digitsOnly ? parseInt(digitsOnly, 10) : null;
      if (!cash_price) return;

      results.push({ name, href, cash_price });
    });

    return results;
  });
}

function buildPageUrl(baseUrl, pageNum) {
  if (pageNum <= 1) return baseUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}page/${pageNum}/`;
}

async function waitForChallengeResolution(page, maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const title = await page.title();
    if (!title.includes("Just a moment")) return true;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

async function gotoWithChallengeHandling(page, url, label) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page
    .waitForSelector(".product-name.product_title a", { timeout: 15000 })
    .catch(() =>
      console.warn(
        `[dgcomp-projectors] ${label}: .product-name.product_title a never appeared`,
      ),
    );

  const title = await page.title();
  if (title.includes("Just a moment")) {
    const resolved = await waitForChallengeResolution(page);
    if (!resolved) {
      console.warn(`[dgcomp-projectors] ${label}: challenge never resolved, skipping`);
      return false;
    }
  }
  return true;
}

async function hasNextPage(page) {
  return page.evaluate(() => {
    return !!document.querySelector("nav.woocommerce-pagination a.next.page-numbers");
  });
}

export async function scrapeDgcompProjectors() {
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
    console.log("[dgcomp-projectors] Loading listing page 1...");
    const ok = await gotoWithChallengeHandling(page, LIST_URL, "page 1");
    if (!ok) return [];

    const page1Products = await extractListingProducts(page);
    console.log(`[dgcomp-projectors] page 1: ${page1Products.length} products`);

    const seen = new Map();
    for (const p of page1Products) seen.set(p.name, p);

    let nextExists = await hasNextPage(page);

    const MAX_PAGES = 30;
    let consecutiveNoNew = 0;

    for (let p = 2; p <= MAX_PAGES && nextExists; p++) {
      const pageUrl = buildPageUrl(LIST_URL, p);
      console.log(`[dgcomp-projectors] Loading page ${p}: ${pageUrl}`);

      const pageOk = await gotoWithChallengeHandling(
        page,
        pageUrl,
        `page ${p}`,
      );
      if (!pageOk) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= 2) {
          console.log(
            `[dgcomp-projectors] page ${p}: challenge failed twice in a row, stopping`,
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
        `[dgcomp-projectors] page ${p}: ${products.length} products, ${newCount} new`,
      );

      if (newCount === 0) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= 2) {
          console.log(
            `[dgcomp-projectors] stopping — 2 consecutive pages with no new products`,
          );
          break;
        }
      } else {
        consecutiveNoNew = 0;
      }

      nextExists = await hasNextPage(page);
      await new Promise((r) => setTimeout(r, 1000));
    }

    const results = [...seen.values()].map((p) => ({
      name: p.name,
      cash_price: p.cash_price,
      installment_price: null,
      source: "dgcomp",
      category: "projectors",
      url: p.href
        ? p.href.startsWith("http")
          ? p.href
          : `${BASE_URL}${p.href.startsWith("/") ? "" : "/"}${p.href}`
        : null,
    }));

    console.log(`[dgcomp-projectors] Total: ${results.length}`);
    return results;
  } finally {
    await browser.close();
  }
}