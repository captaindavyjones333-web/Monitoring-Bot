import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { isConsoleProduct } from "../../core/gamingFilter.js";

puppeteerExtra.use(StealthPlugin());

const LIST_URL = "https://eldorado.am/am/games-and-entertainment/game-consoles?el_producer=762,604";

async function extractProducts(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll("li.product-item-loader");
    const results = [];

    items.forEach((item) => {
      const nameEl = item.querySelector(".product_name");
      const name = nameEl?.textContent?.trim();
      if (!name) return;

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

      results.push({ name, cash_price, installment_price: null, source: "eldorado" });
    });

    return results;
  });
}

async function waitForChallengeResolution(page, maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const title = await page.title();
    if (!title.includes("Just a moment")) return true;
    console.warn(`[eldorado-gaming] Still on challenge page, waiting (attempt ${attempt + 1}/${maxAttempts})...`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

export async function scrapeEldoradoGaming() {
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
    console.log("[eldorado-gaming] Loading page...");
    await page.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });

    const title = await page.title();
    if (title.includes("Just a moment")) {
      const resolved = await waitForChallengeResolution(page);
      if (!resolved) {
        console.warn("[eldorado-gaming] Challenge never resolved, returning empty");
        return [];
      }
    }

    const allProducts = await extractProducts(page);
    const filtered = allProducts.filter((p) => isConsoleProduct(p.name));
    console.log(`[eldorado-gaming] ${filtered.length} after console-only filter (from ${allProducts.length})`);
    return filtered;
  } finally {
    await browser.close();
  }
}