import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const LIST_URL = "https://eldorado.am/am/climate/air-conditioners?el_producer=8971,747";

function extractProducts() {
  const items = document.querySelectorAll("li.product-item-loader");
  const results = [];

  items.forEach((item) => {
    // IMPORTANT: use the product_name link specifically, not the first <a>
    // in the item — the first <a> is the compare button (href="#").
    const nameEl = item.querySelector(".product_name");
    const name = nameEl?.textContent?.trim();
    const url = nameEl?.href;
    if (!name || !url) return;

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

    results.push({ name, cash_price, installment_price: null, source: "eldorado",
    category: "airconditioners", url });
  });

  return results;
}

async function waitForChallengeResolution(page, maxAttempts = 4, delayMs = 4000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const title = await page.title();
    if (!title.includes("Just a moment")) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function fetchInstallationPrice(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

    // Same Cloudflare interstitial can appear on detail pages too —
    // this was missing before, causing silent nulls.
    const title = await page.title();
    if (title.includes("Just a moment")) {
      const resolved = await waitForChallengeResolution(page);
      if (!resolved) {
        console.warn(`[eldorado-ac] Challenge never resolved for ${url}`);
        return null;
      }
    }

    const installation = await page.evaluate(() => {
      const el = document.querySelector(".price-notice .price-wrapper");
      const amount = el?.getAttribute("data-price-amount");
      return amount ? parseInt(amount, 10) : null;
    });
    return installation;
  } catch (err) {
    console.warn(`[eldorado-ac] Failed to fetch installation price ${url}: ${err.message}`);
    return null;
  }
}

export async function scrapeEldoradoAirConditioners() {
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
    console.log("[eldorado-ac] Loading listing page...");
    await page.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });

    const title = await page.title();
    if (title.includes("Just a moment")) {
      const resolved = await waitForChallengeResolution(page);
      if (!resolved) {
        console.warn("[eldorado-ac] Challenge never resolved, returning empty");
        return [];
      }
    }

    const products = await page.evaluate(extractProducts);
    console.log(`[eldorado-ac] ${products.length} products found, fetching installation prices...`);

    const results = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const installation_price = await fetchInstallationPrice(page, p.url);
      results.push({ ...p, installation_price });
      console.log(`[eldorado-ac] (${i + 1}/${products.length}) ${p.name} | install=${installation_price}`);
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`[eldorado-ac] Total: ${results.length}`);
    return results;
  } finally {
    await browser.close();
  }
}
