import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { getSimSuffixFromText } from "../../core/simClassifier.js";

function parsePrice(text) {
  const match = text.replace(/\s/g, "").match(/([\d,]+)դր/);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10) || null;
}

function extractProductId(url) {
  if (!url) return null;
  let m = url.match(/\/(\d+)\/?(?:\?.*)?$/);
  if (m) return m[1];
  m = url.match(/[?&]pid=(\d+)/);
  return m ? m[1] : null;
}

function extractRam($) {
  let ram = null;
  $(".dlabel").each((_, el) => {
    const label = $(el).text().trim();
    if (label === "Օպերատիվ հիշողություն") {
      ram = $(el).next(".value").text().trim();
    }
  });
  return ram;
}

function extractSimText($) {
  let simText = null;
  $(".dlabel").each((_, el) => {
    const label = $(el).text().trim();
    if (label === "SIM card" || label === "SIM քարտ") {
      simText = $(el).next(".value").text().trim();
    }
  });
  if (simText) return simText;

  $(".rowname").each((_, el) => {
    const label = $(el).text().trim();
    if (label.includes("SIM քարտի քանակ")) {
      simText = $(el).next().text().trim();
    }
  });
  return simText;
}

function extractChipset($) {
  let chip = null;
  $(".rowname").each((_, el) => {
    const label = $(el).text().trim();
    if (label === "Չիպսեթ") {
      chip = $(el).next().text().trim();
    }
  });
  if (!chip) return null;

  // "Apple M2" -> "M2", also handles "M2 Pro" / "M3 Max" / "M4 Ultra"
  const m = chip.match(/\bM\d+(?:\s*(?:Pro|Max|Ultra))?\b/i);
  return m ? m[0].toUpperCase().replace(/\s+/g, " ") : null;
}

async function getAllProductUrls(page, listUrl, logTag) {
  await page.goto(listUrl, { waitUntil: "networkidle2", timeout: 30000 });

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
    console.log(`[${logTag}] Items loaded: ${count}`);

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

async function fetchVariants(
  page,
  listingName,
  baseUrl,
  listingCashPrice,
  globalVisited,
  logTag,
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

      // Detect Cloudflare/WAF block pages so we never cache them as
      // if they were real products (seen as "Error 1006" pages).
      if (/error\s*100\d/i.test(fullName) || fullName.length < 3) {
        console.warn(
          `[${logTag}] Blocked/error page detected at ${currentUrl}, skipping`,
        );
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const chip = extractChipset($);
      const nameWithChip =
        chip && !fullName.toUpperCase().includes(chip.toUpperCase())
          ? fullName.replace(/(\d+\s*gb)/i, `${chip} $1`)
          : fullName;

      const ram = extractRam($);
      const nameWithRam =
        ram && !nameWithChip.toLowerCase().includes("gb/")
          ? nameWithChip.replace(/(\d+\s*gb)/i, `${ram}/$1`)
          : nameWithChip;

      const simText = extractSimText($);
      const simSuffix = getSimSuffixFromText(simText);
      const nameWithSim =
        simSuffix && !nameWithRam.toLowerCase().includes("sim")
          ? `${nameWithRam}${simSuffix}`
          : nameWithRam;

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
          name: nameWithSim,
          cash_price: cashPrice,
          installment_price: installmentPrice,
          source: "mobilecentre",
          url: currentUrl,
        });
        console.log(
          `[${logTag}] -> [${currentId}] "${nameWithSim}" cash:${cashPrice}`,
        );
      }

      $("a.tag, a.color").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const absUrl = href.startsWith("http")
          ? href
          : new URL(href, currentUrl).toString();
        const linkedId = extractProductId(absUrl);
        if (!linkedId || globalVisited.has(linkedId) || queued.has(linkedId))
          return;
        queued.add(linkedId);
        queue.push(absUrl);
      });

      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      console.warn(`[${logTag}] Failed ${currentUrl}: ${err.message}`);
    }
  }
}

export async function crawlMobilecentreCategory(listUrl, logTag) {
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
    console.log(`[${logTag}] Loading listing page...`);
    const listingProducts = await getAllProductUrls(page, listUrl, logTag);
    console.log(
      `[${logTag}] ${listingProducts.length} products found on listing`,
    );

    const globalVisited = new Map();

    for (let i = 0; i < listingProducts.length; i++) {
      const { name, url, cash_price } = listingProducts[i];
      const id = extractProductId(url);

      if (id && globalVisited.has(id)) {
        console.log(`[${logTag}] skip (already crawled): "${name}"`);
        continue;
      }

      await fetchVariants(page, name, url, cash_price, globalVisited, logTag);
      console.log(`[${logTag}] total collected so far: ${globalVisited.size}`);

      await new Promise((r) => setTimeout(r, 300));
    }

    const unique = [...globalVisited.values()];
    console.log(`[${logTag}] Total unique products: ${unique.length}`);
    return unique;
  } finally {
    await browser.close();
  }
}
