import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://3dplanet.am";

const LIST_URLS = [
  "https://3dplanet.am/hy/store/watches?brands[]=3&sort=none", // Apple
  "https://3dplanet.am/hy/store/watches?brands[]=4&sort=none", // Samsung
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

async function getTotalPages(listUrl) {
  const res = await axios.get(listUrl, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  let max = 1;
  $("a[href*='?page=']").each((_, el) => {
    const match = $(el)
      .attr("href")
      ?.match(/page=(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1]));
  });
  return max;
}

function buildPageUrl(listUrl, page) {
  if (page === 1) return listUrl;
  const sep = listUrl.includes("?") ? "&" : "?";
  return `${listUrl}${sep}page=${page}`;
}

async function fetchListingPage(listUrl, page) {
  const url = buildPageUrl(listUrl, page);
  const res = await axios.get(url, { headers: HEADERS });
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

async function getBasePagePrice(puppeteerPage) {
  try {
    return await puppeteerPage.$eval("#price", (el) => {
      const raw = el.getAttribute("data-price") || el.textContent;
      const cleaned = raw.replace(/[^\d.]/g, "");
      return cleaned ? parseFloat(cleaned) : null;
    });
  } catch {
    return null;
  }
}

async function fetchWatchVariants(puppeteerPage, baseName, url) {
  try {
    await puppeteerPage.goto(url, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1500));

    const basePrice = await getBasePagePrice(puppeteerPage);

    const groups = await puppeteerPage.$$eval(".mt-4", (containers) =>
      containers.map((c) => ({
        heading: c.querySelector("h2")?.textContent?.trim() || "",
        buttons: Array.from(
          c.querySelectorAll("button.modifier-btn:not([disabled])"),
        ).map((btn) => ({
          label: btn.textContent.trim(),
          price: parseFloat(btn.getAttribute("data-price")) || 0,
          loanPrice: parseFloat(btn.getAttribute("data-loanprice")) || 0,
          color: btn.getAttribute("data-color"),
        })),
      })),
    );

    const sizeGroup = groups.find((g) => /չափ|size/i.test(g.heading));
    const colorGroup = groups.find((g) => /գույն|color/i.test(g.heading));

    const sizeOptions = sizeGroup?.buttons.length ? sizeGroup.buttons : [null];
    const colorOptions = colorGroup?.buttons.length
      ? colorGroup.buttons
      : [null];

    if (!sizeGroup && !colorGroup) {
      return basePrice
        ? [
            {
              name: baseName,
              cash_price: basePrice,
              installment_price: null,
              source: "3dplanet",
            },
          ]
        : [];
    }

    const results = [];

    for (const size of sizeOptions) {
      if (size) {
        await puppeteerPage.evaluate((label) => {
          const btns = document.querySelectorAll(
            "button.modifier-btn:not([disabled])",
          );
          for (const btn of btns) {
            if (
              btn.textContent.trim() === label &&
              !btn.getAttribute("data-color")
            ) {
              btn.click();
              break;
            }
          }
        }, size.label);
        await new Promise((r) => setTimeout(r, 800));
      }

      for (const color of colorOptions) {
        // Fall back to the base page price when a modifier's own price
        // is 0 (meaning "no additional cost over base"), same pattern
        // seen on phone storage/modifier buttons.
        const cash_price = color?.price || size?.price || basePrice || null;
        const installment_price = color?.loanPrice || size?.loanPrice || null;
        if (!cash_price) continue;

        const parts = [baseName];
        if (size) parts.push(size.label);
        if (color) parts.push(color.color || color.label);

        results.push({
          name: parts.join(" "),
          cash_price,
          installment_price,
          source: "3dplanet",
        });
      }
    }

    return results;
  } catch (err) {
    console.warn(`[3d-watches] Failed ${url}: ${err.message}`);
    return [];
  }
}

export async function scrape3DPlanetWatches() {
  const listingProducts = [];

  for (const listUrl of LIST_URLS) {
    const totalPages = await getTotalPages(listUrl);
    console.log(`[3d-watches] ${listUrl}: ${totalPages} pages`);
    for (let page = 1; page <= totalPages; page++) {
      const products = await fetchListingPage(listUrl, page);
      console.log(`[3d-watches] Page ${page}: ${products.length} products`);
      listingProducts.push(...products);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const seenUrls = new Set();
  const unique = [];
  for (const p of listingProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  console.log(
    `[3d-watches] ${unique.length} unique products, fetching details...`,
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

  const allProducts = [];
  try {
    for (let i = 0; i < unique.length; i++) {
      const { name, url } = unique[i];
      console.log(`[3d-watches] (${i + 1}/${unique.length}) ${name}`);
      const variants = await fetchWatchVariants(puppeteerPage, name, url);
      allProducts.push(...variants);
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    await browser.close();
  }

  const seen = new Map();
  for (const p of allProducts) {
    if (!seen.has(p.name)) seen.set(p.name, p);
  }

  const result = [...seen.values()];
  console.log(`[3d-watches] Total unique products: ${result.length}`);
  return result;
}
