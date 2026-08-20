import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const BASE_URL = "https://www.zigzag.am";
const LIST_PATH = "/am/catalogsearch/result/index/";

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d]/g, "");
  return cleaned ? parseInt(cleaned, 10) : null;
}

async function extractProducts(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll("li");
    const results = [];

    items.forEach((item) => {
      const nameEl = item.querySelector(".product_name");
      const name = nameEl?.textContent?.trim();
      const href = nameEl?.getAttribute("href");
      if (!name) return;

      const priceEl = item.querySelector("[data-price-type='finalPrice']");
      const priceAmount = priceEl?.getAttribute("data-price-amount");
      if (!priceAmount) return;

      const url = href
        ? href.startsWith("http")
          ? href
          : `https://www.zigzag.am${href}`
        : null;

      results.push({ name, cash_price: parseInt(priceAmount, 10), url });
    });

    return results;
  });
}

async function waitForChallengeResolution(page, maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const title = await page.title();
    if (!title.includes("Just a moment")) return true;
    console.warn(`[zigzag-dyson] Still on challenge page, waiting (attempt ${attempt + 1}/${maxAttempts})...`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

export async function scrapeZigzagDyson() {
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
    const MAX_PAGES = 10;

    while (pageNum <= MAX_PAGES) {
      const url =
        pageNum === 1
          ? `${BASE_URL}${LIST_PATH}?cat=109&q=dyson`
          : `${BASE_URL}${LIST_PATH}?cat=109&p=${pageNum}&q=dyson`;

      console.log(`[zigzag-dyson] Loading page ${pageNum}...`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      const title = await page.title();
      if (title.includes("Just a moment")) {
        const resolved = await waitForChallengeResolution(page);
        if (!resolved) {
          console.warn(`[zigzag-dyson] Challenge never resolved on page ${pageNum}, stopping`);
          break;
        }
      }

      const pageProducts = await extractProducts(page);

      if (pageProducts.length === 0) {
        console.log(`[zigzag-dyson] Page ${pageNum}: 0 products, stopping`);
        break;
      }

      let newCount = 0;
      for (const p of pageProducts) {
        if (!seen.has(p.name)) {
          seen.set(p.name, {
            name: p.name,
            cash_price: p.cash_price,
            installment_price: null, // zigzag doesn't provide installment pricing
            source: "zigzag",
    category: "dyson",
            url: p.url,
          });
          newCount++;
        }
      }

      console.log(`[zigzag-dyson] Page ${pageNum}: ${pageProducts.length} products, ${newCount} new`);

      if (newCount === 0) {
        consecutiveNoNewProducts++;
        if (consecutiveNoNewProducts >= 2) {
          console.log("[zigzag-dyson] Stopping — server is repeating content");
          break;
        }
      } else {
        consecutiveNoNewProducts = 0;
      }

      pageNum++;
      await new Promise((r) => setTimeout(r, 3000));
    }

    const result = [...seen.values()];
    console.log(`[zigzag-dyson] Total: ${result.length}`);
    return result;
  } finally {
    await browser.close();
  }
}