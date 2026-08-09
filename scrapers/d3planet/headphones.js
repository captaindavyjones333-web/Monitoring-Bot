import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://3dplanet.am";

const LIST_URLS = [
  "https://3dplanet.am/hy/store/headset?brands[]=3&sort=none", // Apple
  "https://3dplanet.am/hy/store/headset?brands[]=4&sort=none", // Samsung
  "https://3dplanet.am/hy/store/headset?brands[]=13&sort=none", // Marshall
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
    const match = $(el).attr("href")?.match(/page=(\d+)/);
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
      const fullUrl = detailUrl.startsWith("http") ? detailUrl : `${BASE_URL}${detailUrl}`;
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

async function fetchProductPrice(puppeteerPage, baseName, url) {
  try {
    await puppeteerPage.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));

    const price = await getBasePagePrice(puppeteerPage);
    if (!price) return null;

    let installment_price = null;
    try {
      const modalBtn = await puppeteerPage.$("#openLoanModal");
      if (modalBtn) {
        await modalBtn.click();
        await new Promise((r) => setTimeout(r, 1000));
        installment_price = await puppeteerPage.$eval("#loanPrice", (el) => parseFloat(el.value) || null).catch(() => null);
      }
    } catch {
      installment_price = null;
    }

    return {
      name: baseName,
      cash_price: price,
      installment_price,
      source: "3dplanet",
    };
  } catch (err) {
    console.warn(`[3d-headphones] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrape3DPlanetHeadphones() {
  const listingProducts = [];

  for (const listUrl of LIST_URLS) {
    const totalPages = await getTotalPages(listUrl);
    console.log(`[3d-headphones] ${listUrl}: ${totalPages} pages`);
    for (let page = 1; page <= totalPages; page++) {
      const products = await fetchListingPage(listUrl, page);
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

  console.log(`[3d-headphones] ${unique.length} unique products, fetching details...`);

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
    for (let i = 0; i < unique.length; i++) {
      const { name, url } = unique[i];
      console.log(`[3d-headphones] (${i + 1}/${unique.length}) ${name}`);
      const product = await fetchProductPrice(puppeteerPage, name, url);
      if (product) results.push(product);
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    await browser.close();
  }

  console.log(`[3d-headphones] Total: ${results.length}`);
  return results;
}