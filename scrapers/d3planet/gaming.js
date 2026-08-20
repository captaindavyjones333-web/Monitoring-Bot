import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";
import { isConsoleProduct } from "../../core/gamingFilter.js";

const BASE_URL = "https://3dplanet.am";
const LIST_URLS = [
  "https://3dplanet.am/hy/store/gaming-consoles?brands[]=10&sort=none", // Sony
  "https://3dplanet.am/hy/store/gaming-consoles?brands[]=48&sort=none", // Nintendo
  "https://3dplanet.am/hy/store/gaming-consoles?brands[]=36&sort=none", // Xbox
  "https://3dplanet.am/hy/store?search=steam+deck", // Steam Deck
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

async function fetchListing(listUrl) {
  const res = await axios.get(listUrl, { headers: HEADERS });
  const $ = cheerio.load(res.data);

  const products = [];
  $("h3").each((_, el) => {
    const name = $(el).text().trim();
    const detailUrl = $(el)
      .closest("div")
      .find("a[href*='/store/product/']")
      .first()
      .attr("href");
    if (name && detailUrl) {
      const fullUrl = detailUrl.startsWith("http")
        ? detailUrl
        : `${BASE_URL}${detailUrl}`;
      products.push({ name, url: fullUrl });
    }
  });
  return products;
}

async function fetchProductPrice(puppeteerPage, baseName, url) {
  try {
    await puppeteerPage.goto(url, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1500));

    const cash_price = await puppeteerPage
      .$eval("#price", (el) => {
        const raw = el.getAttribute("data-price") || el.textContent;
        const cleaned = raw ? raw.replace(/[^\d.]/g, "") : null;
        return cleaned ? parseFloat(cleaned) : null;
      })
      .catch(() => null);

    if (!cash_price) return null;

    let installment_price = null;
    try {
      const modalBtn = await puppeteerPage.$("#openLoanModal");
      if (modalBtn) {
        await modalBtn.click();
        await new Promise((r) => setTimeout(r, 1000));
        installment_price = await puppeteerPage
          .$eval("#loanPrice", (el) => parseFloat(el.value) || null)
          .catch(() => null);
      }
    } catch {
      installment_price = null;
    }

    return {
      name: baseName,
      cash_price,
      installment_price,
      source: "3dplanet",
    category: "gaming",
      url,
    };
  } catch (err) {
    console.warn(`[3d-gaming] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrape3DPlanetGaming() {
  const allListing = [];
  for (const listUrl of LIST_URLS) {
    const products = await fetchListing(listUrl);
    console.log(`[3d-gaming] ${listUrl}: ${products.length} products`);
    allListing.push(...products);
    await new Promise((r) => setTimeout(r, 300));
  }

  const filtered = allListing.filter((p) => isConsoleProduct(p.name));
  console.log(
    `[3d-gaming] ${filtered.length} after console-only filter (from ${allListing.length})`,
  );

  const browser = await puppeteer.launch({
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
  const puppeteerPage = await browser.newPage();
  await puppeteerPage.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  );

  const results = [];
  try {
    for (let i = 0; i < filtered.length; i++) {
      const { name, url } = filtered[i];
      console.log(`[3d-gaming] (${i + 1}/${filtered.length}) ${name}`);
      const product = await fetchProductPrice(puppeteerPage, name, url);
      if (product) results.push(product);
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    await browser.close();
  }

  console.log(`[3d-gaming] Total: ${results.length}`);
  return results;
}
