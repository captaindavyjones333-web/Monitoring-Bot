import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const BASE_URL = "https://www.zigzag.am";
const LIST_URL =
  "https://www.zigzag.am/am/phones-and-communication/phones/smartphones.html?manufacturer=32335,35618,9903";

function parsePrice(text) {
  const cleaned = text.replace(/[^\d]/g, "");
  return cleaned ? parseInt(cleaned, 10) : null;
}

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

function extractSpecsFromDetail(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll(".detail_name");
    let ram = null;
    let storage = null;
    let sim = null;

    rows.forEach((el) => {
      const label = el.textContent.trim();
      const value = el.nextElementSibling?.textContent.trim();
      if (label.includes("Օպերատիվ հիշողություն")) ram = value;
      if (label.includes("Ներկառուցված հիշողություն")) storage = value;
      if (label.includes("SIM քարտերի քանակ")) sim = value;
    });

    return { ram, storage, sim };
  });
}

async function waitForChallengeResolution(page, maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const title = await page.title();
    if (!title.includes("Just a moment")) return true;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

export async function scrapeZigzagPhones() {
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
    console.log("[zigzag-phones] Loading listing page...");
    await page.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });

    const title = await page.title();
    if (title.includes("Just a moment")) {
      const resolved = await waitForChallengeResolution(page);
      if (!resolved) {
        console.warn("[zigzag-phones] Challenge never resolved, returning empty");
        return [];
      }
    }

    const listingProducts = await extractListingProducts(page);
    console.log(`[zigzag-phones] ${listingProducts.length} products found`);

    const results = [];
    for (let i = 0; i < listingProducts.length; i++) {
      const { name, href, cash_price } = listingProducts[i];
      const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      console.log(`[zigzag-phones] (${i + 1}/${listingProducts.length}) ${name}`);

      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
        const { ram, storage, sim } = await extractSpecsFromDetail(page);

        let finalName = name;
        if (ram && storage && !/\d+\s*gb\/\d+\s*gb/i.test(finalName)) {
          finalName = `${finalName} ${ram.replace(/\s*gb/i, "")}GB/${storage.replace(/\s*gb/i, "")}GB`;
        }
        if (sim && sim.trim() === "2" && !finalName.toLowerCase().includes("sim")) {
          finalName = `${finalName} Dual-Sim`;
        }

        results.push({
          name: finalName,
          cash_price,
          installment_price: null, // zigzag has no installment pricing
          source: "zigzag",
    category: "phones",
          url,
        });
      } catch (err) {
        console.warn(`[zigzag-phones] Failed detail ${url}: ${err.message}`);
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`[zigzag-phones] Total: ${results.length}`);
    return results;
  } finally {
    await browser.close();
  }
}