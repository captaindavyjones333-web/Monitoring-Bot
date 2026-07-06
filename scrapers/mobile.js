import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { saveCache, markUpdated } from "../core/cache_manager.js";

const LIST_URL =
  "https://mobilecentre.am/category/phones/138/0/?search=filters&searchData_brand=%5B%2255842%22%2C%2255413%22%2C%2255414%22%5D";

function parsePrice(text) {
  const match = text.replace(/\s/g, "").match(/([\d,]+)դր/);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10) || null;
}

async function getAllProductUrls(page) {
  await page.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });

  let prevCount = 0;
  let noChangeCount = 0;

  while (noChangeCount < 3) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    await new Promise((r) => setTimeout(r, 3000));

    const count = await page.$$eval(".item-body", (els) => els.length);
    console.log(`[mc] Items loaded: ${count}`);

    if (count === prevCount) {
      noChangeCount++;
    } else {
      noChangeCount = 0;
      prevCount = count;
    }
  }

  const html = await page.content();
  const $ = cheerio.load(html);
  const products = [];

  $(".item-body").each((_, card) => {
    const $card = $(card);
    if ($card.text().includes("Առկա չէ")) return;

    const name = $card.find("h3").text().trim();
    if (!name) return;

    const url =
      $card.closest(".listitem").find("a.prod-item-img").attr("href") ||
      $card.find("a").first().attr("href");
    if (!url) return;

    const regularText = $card
      .find(".price .regular")
      .clone()
      .find("span")
      .remove()
      .end()
      .text()
      .trim();
    const cash_price = parsePrice(regularText);
    if (!cash_price) return;

    products.push({ name, url, cash_price });
  });

  return products;
}

function extractProductId(url) {
  if (!url) return null;
  let m = url.match(/\/(\d+)\/?(?:\?.*)?$/); // slug style: .../33166/
  if (m) return m[1];
  m = url.match(/[?&]pid=(\d+)/); // query style: ?...pid=33166
  return m ? m[1] : null;
}

function extractRam($) {
  let ram = null;
  $(".dlabel").each((_, el) => {
    const label = $(el).text().trim();
    if (label === "Օպերատիվ հիշողություն") {
      ram = $(el).next(".value").text().trim(); // e.g. "8 GB"
    }
  });
  return ram;
}

async function fetchVariants(
  page,
  listingName,
  baseUrl,
  listingCashPrice,
  globalVisited,
) {
  const queue = [baseUrl];
  const queued = new Set([extractProductId(baseUrl)]);

  while (queue.length) {
    const currentUrl = queue.shift();
    const currentId = extractProductId(currentUrl);
    if (!currentId || globalVisited.has(currentId)) continue;

    try {
      await page.goto(currentUrl, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });
      const html = await page.content();
      const $ = cheerio.load(html);

      const fullName = $("h1").first().text().trim() || listingName;
      const ram = extractRam($);
      const nameWithRam =
        ram && !fullName.toLowerCase().includes("gb/")
          ? fullName.replace(/(\d+\s*gb)/i, `${ram}/$1`)
          : fullName;
      const priceText = $(".price .regular")
        .clone()
        .find("span")
        .remove()
        .end()
        .text()
        .trim();
      const cashPrice =
        parsePrice(priceText) ||
        (currentId === extractProductId(baseUrl) ? listingCashPrice : null);
      const creditLink = $(".credit_calc_link a").first();
      const installmentPrice = creditLink.length
        ? parseInt(creditLink.attr("data-price"), 10) || null
        : null;

      if (cashPrice) {
        globalVisited.set(currentId, {
          name: nameWithRam ,
          cash_price: cashPrice,
          installment_price: installmentPrice,
          source: "mobilecentre",
        });
        console.log(`[mc] -> [${currentId}] "${nameWithRam }" cash:${cashPrice}`);
      }

      // discover every reachable variant: storage tags, sim tags, color swatches
      $("a.tag, a.color").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return; // taginactive / unavailable option
        const absUrl = href.startsWith("http")
          ? href
          : new URL(href, currentUrl).toString();
        const linkedId = extractProductId(absUrl);
        if (!linkedId || globalVisited.has(linkedId) || queued.has(linkedId))
          return;
        queued.add(linkedId);
        queue.push(absUrl);
      });

      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.warn(`[mc] Failed ${currentUrl}: ${err.message}`);
    }
  }
}

export async function scrapeMobileCentre() {
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
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  );

  try {
    console.log("[mc] Loading listing page...");
    const listingProducts = await getAllProductUrls(page);
    console.log(`[mc] ${listingProducts.length} products found on listing`);

    const globalVisited = new Map(); // key: numeric product id -> product data

    for (let i = 0; i < listingProducts.length; i++) {
      const { name, url, cash_price } = listingProducts[i];
      const id = extractProductId(url);

      if (id && globalVisited.has(id)) {
        console.log(`[mc] skip (already crawled): "${name}"`);
        continue;
      }

      await fetchVariants(page, name, url, cash_price, globalVisited);
      console.log(`[mc] total collected so far: ${globalVisited.size}`);

      await new Promise((r) => setTimeout(r, 300));
    }

    const unique = [...globalVisited.values()];
    console.log(`[mc] Total unique products: ${unique.length}`);
    return unique;
  } finally {
    await browser.close();
  }
}
