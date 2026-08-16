import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

const BASE_LIST_URL = "https://mobilecentre.am/category/equipments/148/0/";

function parsePrice(text) {
  const match = text.replace(/\s/g, "").match(/([\d,]+)դր/);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10) || null;
}

async function getAllProductUrls(page) {
  await page.goto(BASE_LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });

  await page.evaluate(() => {
    const checkbox = document.querySelector("#cat_174");
    if (checkbox) {
      checkbox.checked = true;
      if (typeof updateProdList === "function") {
        updateProdList("cat_174");
      } else {
        checkbox.dispatchEvent(new Event("click", { bubbles: true }));
      }
    }
  });
  await new Promise((r) => setTimeout(r, 2500)); // let the AJAX filter apply

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
    console.log(`[mc-gaming] Items loaded: ${count}`);
    if (count === prevCount) noChangeCount++;
    else {
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

    // The product link lives in the sibling image wrapper, not inside
    // .item-body itself (which only contains wishlist/compare buttons).
    const url = $card
      .closest(".listitem")
      .find("a[href*='/product/']")
      .first()
      .attr("href");
    if (!url) return;

    const regularText = $card.find(".price .regular").text().trim();
    const cash_price = parsePrice(regularText);
    if (!cash_price) return;

    products.push({ name, url, cash_price });
  });

  return products;
}

async function fetchProductDetail(page, listingName, url, listingCashPrice) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    const html = await page.content();
    const $ = cheerio.load(html);

    const fullName = $("h1").first().text().trim() || listingName;

    if (/error\s*100\d/i.test(fullName) || fullName.length < 3) {
      console.warn(`[mc-gaming] Blocked/error page at ${url}, skipping`);
      return null;
    }

    const priceText = $(".price .regular")
      .clone()
      .find("span")
      .remove()
      .end()
      .text()
      .trim();
    const cashPrice = parsePrice(priceText) || listingCashPrice;
    const creditLink = $(".credit_calc_link a").first();
    const installmentPrice = creditLink.length
      ? parseInt(creditLink.attr("data-price"), 10) || null
      : null;

    if (!cashPrice) return null;

    return {
      name: fullName,
      cash_price: cashPrice,
      installment_price: installmentPrice,
      source: "mobilecentre",
      url,
    };
  } catch (err) {
    console.warn(`[mc-gaming] Failed ${url}: ${err.message}`);
    return null;
  }
}

export async function scrapeMobileCentreGaming() {
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
    console.log("[mc-gaming] Loading listing page...");
    const listingProducts = await getAllProductUrls(page);
    console.log(`[mc-gaming] ${listingProducts.length} products found`);

    const results = [];
    for (let i = 0; i < listingProducts.length; i++) {
      const { name, url, cash_price } = listingProducts[i];
      const detail = await fetchProductDetail(page, name, url, cash_price);
      if (detail) results.push(detail);
      console.log(
        `[mc-gaming] (${i + 1}/${listingProducts.length}) ${detail?.name}`,
      );
      await new Promise((r) => setTimeout(r, 600));
    }

    console.log(`[mc-gaming] Total: ${results.length}`);
    return results;
  } finally {
    await browser.close();
  }
}
