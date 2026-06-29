// scrapers/mobile.js
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

async function fetchVariants(page, listingName, url, listingCashPrice) {
  console.log(`[mc] -> fetching: ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

    const html = await page.content();
    const $ = cheerio.load(html);

    const fullName = $("h1").first().text().trim() || listingName;
    console.log(`[mc] -> name: "${fullName}"`);

    const priceText = $(".price .regular")
      .clone()
      .find("span")
      .remove()
      .end()
      .text()
      .trim();
    console.log(`[mc] -> priceText: "${priceText}"`);
    const detailCashPrice = parsePrice(priceText) || listingCashPrice;
    console.log(`[mc] -> cash: ${detailCashPrice}`);

    const creditLink = $(".credit_calc_link a").first();
    const installment_price = creditLink.length
      ? parseInt(creditLink.attr("data-price"), 10) || null
      : null;
    console.log(`[mc] -> installment: ${installment_price}`);

    // Get variant links
    const variantLinks = new Set();
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (
        href.includes("mobilecentre.am/product") &&
        text &&
        [
          "Dual eSIM",
          "Nano-SIM & eSIM",
          "eSIM",
          "Nano-SIM",
          "128GB",
          "256GB",
          "512GB",
          "1TB",
          "2TB",
        ].includes(text)
      ) {
        variantLinks.add(href);
      }
    });

    console.log(`[mc] -> variants found: ${variantLinks.size}`);

    const results = [
      {
        name: fullName,
        cash_price: detailCashPrice,
        installment_price,
        source: "mobilecentre",
      },
    ];

    if (variantLinks.size === 0) return results;

    const seen = new Set([url]);

    for (const variantUrl of variantLinks) {
      if (seen.has(variantUrl)) continue;
      seen.add(variantUrl);

      try {
        await page.goto(variantUrl, {
          waitUntil: "networkidle2",
          timeout: 15000,
        });
        const vHtml = await page.content();
        const v$ = cheerio.load(vHtml);

        const vName = v$("h1").first().text().trim();
        if (!vName || vName === fullName) continue;

        const vPriceText = v$(".price .regular")
          .clone()
          .find("span")
          .remove()
          .end()
          .text()
          .trim();
        const vCash = parsePrice(vPriceText) || null;
        if (!vCash) continue;

        const vCreditLink = v$(".credit_calc_link a").first();
        const vInstallment = vCreditLink.length
          ? parseInt(vCreditLink.attr("data-price"), 10) || null
          : null;

        console.log(
          `[mc] -> variant: "${vName}" cash:${vCash} installment:${vInstallment}`,
        );
        results.push({
          name: vName,
          cash_price: vCash,
          installment_price: vInstallment,
          source: "mobilecentre",
        });
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.warn(`[mc] Variant failed ${variantUrl}: ${err.message}`);
      }
    }

    return results;
  } catch (err) {
    console.warn(`[mc] Detail page failed ${url}: ${err.message}`);
    return [
      {
        name: listingName,
        cash_price: listingCashPrice,
        installment_price: null,
        source: "mobilecentre",
      },
    ];
  }
}

export async function scrapeMobileCentre() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  );

  try {
    console.log("[mc] Loading listing page...");
    const listingProducts = await getAllProductUrls(page);
    console.log(`[mc] ${listingProducts.length} products found on listing`);

    const allProducts = [];
    const seenUrls = new Set();

    for (let i = 0; i < listingProducts.length; i++) {
      const { name, url, cash_price } = listingProducts[i];
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const variants = await fetchVariants(page, name, url, cash_price);
      console.log(
        `[mc] got ${variants.length} variants, first: "${variants[0]?.name}"`,
      );
      allProducts.push(...variants);

      await new Promise((r) => setTimeout(r, 300));
    }

    const seen = new Map();
    for (const p of allProducts) {
      if (!seen.has(p.name)) seen.set(p.name, p);
    }

    const unique = [...seen.values()];
    console.log(`[mc] Total unique products: ${unique.length}`);
    return unique;
  } finally {
    await browser.close();
  }
}

const products = await scrapeMobileCentre();
saveCache("mobilecentre", products);
markUpdated("mobilecentre");
