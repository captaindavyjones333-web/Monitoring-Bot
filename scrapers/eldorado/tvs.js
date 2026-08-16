import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const BASE_URL = "https://eldorado.am";
const LIST_PATH = "/am/audio-video/tv";
const PRODUCER_PARAM = "597,582";

async function extractProducts(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll("li.product-item-loader");
    const results = [];

    items.forEach((item) => {
      const nameEl = item.querySelector(".product_name");
      const name = nameEl?.textContent?.trim();
      if (!name) return;
      const url = nameEl?.href || null;

      const finalPriceEl = item.querySelector("[data-price-type='finalPrice']");
      const oldPriceEl = item.querySelector("[data-price-type='oldPrice']");

      const finalPrice = finalPriceEl?.getAttribute("data-price-amount");
      const oldPrice = oldPriceEl?.getAttribute("data-price-amount");

      const cash_price = finalPrice
        ? parseInt(finalPrice, 10)
        : oldPrice
          ? parseInt(oldPrice, 10)
          : null;

      if (!cash_price) return;

      results.push({ name, cash_price, installment_price: null, source: "eldorado", url });
    });

    return results;
  });
}

async function waitForChallengeResolution(page, maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const title = await page.title();
    if (!title.includes("Just a moment")) return true;
    console.warn(`[eldorado-tvs] Still on challenge page, waiting (attempt ${attempt + 1}/${maxAttempts})...`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

export async function scrapeEldoradoTvs() {
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
    const seen = new Map();
    let pageNum = 1;
    let consecutiveNoNewProducts = 0;
    const MAX_PAGES = 15;

    while (pageNum <= MAX_PAGES) {
      const url = `${BASE_URL}${LIST_PATH}?ajaxscroll=1&el_producer=${encodeURIComponent(PRODUCER_PARAM)}&p=${pageNum}&_=${Date.now()}`;
      console.log(`[eldorado-tvs] Loading page ${pageNum}...`);

      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      const title = await page.title();
      if (title.includes("Just a moment")) {
        const resolved = await waitForChallengeResolution(page);
        if (!resolved) {
          console.warn(`[eldorado-tvs] Challenge never resolved on page ${pageNum}, stopping`);
          break;
        }
      }

      const pageProducts = await extractProducts(page);

      if (pageProducts.length === 0) {
        console.log(`[eldorado-tvs] Page ${pageNum}: 0 products, stopping`);
        break;
      }

      let newCount = 0;
      for (const p of pageProducts) {
        if (!seen.has(p.name)) {
          seen.set(p.name, p);
          newCount++;
        }
      }

      console.log(`[eldorado-tvs] Page ${pageNum}: ${pageProducts.length} products, ${newCount} new`);

      if (newCount === 0) {
        consecutiveNoNewProducts++;
        if (consecutiveNoNewProducts >= 2) {
          console.log("[eldorado-tvs] Stopping — server is repeating content");
          break;
        }
      } else {
        consecutiveNoNewProducts = 0;
      }

      pageNum++;
      await new Promise((r) => setTimeout(r, 3000));
    }

    const result = [...seen.values()];
    console.log(`[eldorado-tvs] Total: ${result.length}`);
    return result;
  } finally {
    await browser.close();
  }
}