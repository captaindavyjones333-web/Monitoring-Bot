import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://3dplanet.am";

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

function normalizeSim(label) {
  const l = label.toLowerCase();
  if (l.includes("+") || l.includes("nano") || /\d/.test(l.charAt(0))) {
    return "nanosim";
  }
  if (/e[\s-]?sim/i.test(l)) return "esim";
  if (/dual/i.test(l)) return "dualsim";
  return null;
}

function getSimSuffix(label) {
  const l = label.toLowerCase();
  if (l.includes("+") || l.includes("nano") || /\d/.test(l.charAt(0))) {
    return "Nano-Sim";
  }
  if (/e[\s-]?sim/i.test(l)) return "eSim";
  if (/dual/i.test(l)) return "Dual";
  return label;
}

async function getStaticRam(puppeteerPage) {
  try {
    const specItems = await puppeteerPage.$$eval(
      ".flex.items-center.gap-4",
      (els) =>
        els.map((el) => ({
          label:
            el.querySelector(".text-\\[\\#8C8C8C\\]")?.textContent?.trim() ||
            "",
          value: el.querySelector(".font-semibold")?.textContent?.trim() || "",
        })),
    );
    const ramSpec = specItems.find(
      (s) => s.label.includes("Օպերատիվ") || s.label.includes("RAM"),
    );
    return ramSpec?.value || null;
  } catch {
    return null;
  }
}

async function fetchProductVariants(puppeteerPage, baseName, url, logTag) {
  try {
    await puppeteerPage.goto(url, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1500));

    const storageButtons = await puppeteerPage.$$eval(
      "button.storage-btn:not([disabled])",
      (els) =>
        els
          .map((el) => ({
            label: el.textContent.trim(),
            price: parseFloat(el.getAttribute("data-price")) || null,
            loanPrice: parseFloat(el.getAttribute("data-loanprice")) || null,
          }))
          .filter((b) => b.label && b.price),
    );

    if (storageButtons.length === 0) {
      const price = await puppeteerPage
        .$eval(
          "button.storage-btn",
          (el) => parseFloat(el.getAttribute("data-price")) || null,
        )
        .catch(() => null);
      if (price) {
        return [
          {
            name: baseName,
            cash_price: price,
            installment_price: null,
            source: "3dplanet",
          },
        ];
      }
      return [];
    }

    const results = [];

    for (const storage of storageButtons) {
      await puppeteerPage.evaluate((label) => {
        const btns = document.querySelectorAll(
          "button.storage-btn:not([disabled])",
        );
        for (const btn of btns) {
          if (btn.textContent.trim() === label) {
            btn.click();
            break;
          }
        }
      }, storage.label);

      await new Promise((r) => setTimeout(r, 800));

      const modifiers = await puppeteerPage.$$eval(
        "button.modifier-btn:not([disabled])",
        (els) =>
          els
            .filter((el) => !el.getAttribute("data-color"))
            .map((el) => ({
              label: el.textContent.trim(),
              price: parseFloat(el.getAttribute("data-price")) || 0,
              loanPrice: parseFloat(el.getAttribute("data-loanprice")) || 0,
            }))
            .filter((m) => m.label),
      );

      if (modifiers.length === 0) {
        const staticRam = await getStaticRam(puppeteerPage);
        const name = staticRam
          ? `${baseName} ${staticRam}/${storage.label}`
          : `${baseName} ${storage.label}`;
        results.push({
          name,
          cash_price: storage.price,
          installment_price: storage.loanPrice || null,
          source: "3dplanet",
        });
      } else {
        for (const mod of modifiers) {
          const simType = normalizeSim(mod.label);
          const isRam = /^\d+gb$/i.test(mod.label.trim());

          const cash_price = mod.price || storage.price;
          const installment_price = mod.loanPrice || storage.loanPrice || null;

          let name;
          if (isRam) {
            name = `${baseName} ${mod.label.trim()}/${storage.label}`;
          } else if (simType) {
            name = `${baseName} ${storage.label} (${getSimSuffix(mod.label.trim())})`;
          } else {
            name = `${baseName} ${storage.label} ${mod.label.trim()}`;
          }

          results.push({
            name,
            cash_price,
            installment_price,
            source: "3dplanet",
          });
        }
      }
    }

    return results;
  } catch (err) {
    console.warn(`[${logTag}] Failed ${url}: ${err.message}`);
    return [];
  }
}

/**
 * Generic 3dplanet category crawler.
 * @param {string} listUrl - category listing URL
 * @param {string} logTag - e.g. "3d-phones" or "3d-tablets"
 */
export async function crawl3DPlanetCategory(listUrl, logTag) {
  const totalPages = await getTotalPages(listUrl);
  console.log(`[${logTag}] ${totalPages} pages`);

  const listingProducts = [];
  for (let page = 1; page <= totalPages; page++) {
    const products = await fetchListingPage(listUrl, page);
    console.log(`[${logTag}] Page ${page}: ${products.length} products`);
    listingProducts.push(...products);
    await new Promise((r) => setTimeout(r, 300));
  }

  const seenUrls = new Set();
  const unique = [];
  for (const p of listingProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  console.log(`[${logTag}] ${unique.length} unique products, fetching details...`);

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
      console.log(`[${logTag}] (${i + 1}/${unique.length}) ${name}`);
      const variants = await fetchProductVariants(puppeteerPage, name, url, logTag);
      console.log(
        `[${logTag}]   -> ${variants.length} variants: ${variants.map((v) => v.name).join(", ")}`,
      );
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
  console.log(`[${logTag}] Total unique products: ${result.length}`);
  return result;
}