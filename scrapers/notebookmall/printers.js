import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "rebrowser-puppeteer";

process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORE = "notebookmall";
const LISTING_BASE = "https://notebookmall.am/product-category/printer/";
const CACHE_DIR = path.join(__dirname, "..", "..", "cache");
const COOKIE_PATH = path.join(CACHE_DIR, "cf-cookies.json");

const REQUEST_DELAY_MS = 800;
const MAX_PAGES_SAFETY = 100;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listingUrlForPage(page) {
  return page <= 1 ? LISTING_BASE : `${LISTING_BASE}page/${page}/`;
}

const CF_CHALLENGE_TITLE_RE =
  /just a moment|checking your browser|attention required|please wait/i;

// --- Cloudflare/Turnstile handling — ported verbatim from notebooks.js ---

async function isChallenge(page) {
  const title = (await page.title().catch(() => "")).toLowerCase();
  const bodyText = await page
    .evaluate(() => (document.body?.innerText || "").toLowerCase())
    .catch(() => "");

  return (
    title.includes("just a moment") ||
    title.includes("attention required") ||
    title.includes("please wait") ||
    bodyText.includes("verify you are human") ||
    bodyText.includes("checking your browser")
  );
}

async function loadCookies(page) {
  if (!fs.existsSync(COOKIE_PATH)) {
    console.log("[notebookmall-printers] no saved cookies found");
    return;
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, "utf8"));
    if (Array.isArray(cookies) && cookies.length > 0) {
      await page.setCookie(...cookies);
      console.log(
        `[notebookmall-printers] loaded ${cookies.length} saved cookies`,
      );
    }
  } catch (err) {
    console.warn(
      "[notebookmall-printers] failed to load cookies:",
      err.message,
    );
  }
}

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    console.log(
      `[notebookmall-printers] saved ${cookies.length} cookies to ${COOKIE_PATH}`,
    );
  } catch (err) {
    console.warn(
      "[notebookmall-printers] failed to save cookies:",
      err.message,
    );
  }
}

async function tryClickTurnstile(page) {
  const turnstileFrame = page.frames().find((f) => {
    const url = f.url() || "";
    return (
      url.includes("challenges.cloudflare.com") || url.includes("turnstile")
    );
  });

  if (!turnstileFrame) {
    console.log("[notebookmall-printers] no Turnstile frame found");
    return false;
  }

  console.log("[notebookmall-printers] Turnstile frame found");

  let iframeElement = null;
  try {
    iframeElement = await turnstileFrame.frameElement();
  } catch (e) {
    console.log("[notebookmall-printers] frameElement() failed:", e.message);
    return false;
  }

  if (!iframeElement) {
    console.log("[notebookmall-printers] could not get iframe element");
    return false;
  }

  const box = await iframeElement.boundingBox();
  if (!box) {
    console.log("[notebookmall-printers] iframe has no bounding box");
    return false;
  }

  console.log(
    `[notebookmall-printers] iframe box: x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`,
  );

  const clickX = box.x + Math.min(box.width * 0.22, 40);
  const clickY = box.y + box.height * 0.5;

  await page.mouse.click(clickX, clickY, { delay: 80 });
  console.log(
    `[notebookmall-printers] clicked at (${Math.round(clickX)}, ${Math.round(clickY)})`,
  );
  return true;
}

async function waitOutCloudflareChallenge(page, maxWaitMs = 50000) {
  const start = Date.now();
  let attempts = 0;
  let cleared = false;

  while (Date.now() - start < maxWaitMs) {
    const challenged = await isChallenge(page);

    if (!challenged) {
      cleared = true;
      console.log("[notebookmall-printers] challenge cleared");
      break;
    }

    if (attempts < 5) {
      attempts++;
      console.log(
        `[notebookmall-printers] challenge still present — click attempt ${attempts}`,
      );
      await tryClickTurnstile(page);
      await sleep(3000);
    } else {
      console.log("[notebookmall-printers] still on challenge page... waiting");
      await sleep(2000);
    }
  }

  if (cleared) {
    await saveCookies(page);
    return true;
  }

  console.log("======================================================");
  console.log(" Cloudflare Turnstile is still present.");
  console.log(" Please solve the checkbox MANUALLY in the browser window.");
  console.log(" The script will continue automatically once it disappears.");
  console.log("======================================================");

  const manualStart = Date.now();
  while (Date.now() - manualStart < 180000) {
    const stillThere = await isChallenge(page);
    if (!stillThere) {
      console.log(
        "[notebookmall-printers] manual solve detected — saving cookies",
      );
      await saveCookies(page);
      await sleep(1500);
      return true;
    }
    await sleep(1000);
  }

  console.warn("[notebookmall-printers] challenge was not solved in time");
  return false;
}

async function fetchHtml(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const ok = await waitOutCloudflareChallenge(page);
  if (!ok) {
    throw new Error("Cloudflare challenge could not be cleared");
  }
  await sleep(600 + Math.random() * 400);
  return page.content();
}

// --- Listing extraction ---------------------------------------------------
//
// notebookmall.am's printer category is WooCommerce underneath (WOOF-style
// sidebar filters, ?add-to-cart=ID buttons, /page/N/ pagination) but the
// theme re-skins the loop markup, so the standard `ul.products li.product` /
// `.woocommerce-loop-product__title` classes don't apply here — confirmed by
// inspecting the live page. Instead this anchors on two things WooCommerce
// guarantees regardless of theme: every product card has an add-to-cart
// link (`?add-to-cart=<id>`) and a link to its own permalink. From the
// add-to-cart link it walks up the DOM until it finds an ancestor that also
// contains a product-permalink link and a `.price` block.
//
// Price is read directly off that `.price` block on the listing card —
// the product detail page is never opened.
async function extractListingProducts(page) {
  return page.evaluate(() => {
    const cartLinks = Array.from(
      document.querySelectorAll('a[href*="add-to-cart="]'),
    );
    const results = [];
    const seenHrefs = new Set();

    const getPriceText = (container) => {
      const priceEl = container.querySelector(".price");
      if (!priceEl) return null;
      // Prefer the sale price (inside <ins>) over the struck-through
      // regular price (inside <del>) when a product is discounted.
      const ins = priceEl.querySelector("ins .amount bdi, ins .amount, ins");
      if (ins?.textContent?.trim()) return ins.textContent;
      const amount = priceEl.querySelector(".amount bdi, .amount, bdi");
      if (amount?.textContent?.trim()) return amount.textContent;
      return priceEl.textContent;
    };

    for (const cartLink of cartLinks) {
      let node = cartLink;
      let titleLink = null;
      let priceText = null;

      for (let i = 0; i < 8 && node?.parentElement; i++) {
        node = node.parentElement;
        if (!titleLink) {
          titleLink = Array.from(node.querySelectorAll("a[href]")).find((a) =>
            /\/product\//i.test(a.getAttribute("href") || ""),
          );
        }
        if (!priceText) {
          priceText = getPriceText(node);
        }
        if (titleLink && priceText) break;
      }

      if (!titleLink) continue;
      const href = titleLink.getAttribute("href");
      if (!href || seenHrefs.has(href)) continue;

      const name = (titleLink.textContent || "").trim();
      if (!name) continue;

      if (!priceText) continue;
      const digitsOnly = priceText.replace(/[^\d]/g, "");
      const cash_price = digitsOnly ? parseInt(digitsOnly, 10) : null;
      if (!cash_price) continue;

      seenHrefs.add(href);
      results.push({ name, href, cash_price });
    }

    return results;
  });
}

// Robust to theme-specific pagination nav classes: just check whether any
// link on the page points at the next page number.
async function hasNextPage(page, nextPageNum) {
  return page.evaluate((next) => {
    return Array.from(document.querySelectorAll('a[href*="/page/"]')).some(
      (a) => (a.getAttribute("href") || "").includes(`/page/${next}/`),
    );
  }, nextPageNum);
}

async function fetchAllListingProducts(puppeteerPage) {
  const seen = new Map();
  let consecutiveNoNew = 0;

  for (let pageNum = 1; pageNum <= MAX_PAGES_SAFETY; pageNum++) {
    const url = listingUrlForPage(pageNum);
    const html = await fetchHtml(puppeteerPage, url);

    if (CF_CHALLENGE_TITLE_RE.test(html)) {
      console.warn(
        `[notebookmall-printers] page ${pageNum} still shows the Cloudflare challenge page — not a real page, stopping`,
      );
      break;
    }

    const products = await extractListingProducts(puppeteerPage);

    if (products.length === 0) {
      console.log(
        `[notebookmall-printers] page ${pageNum} empty — stopping pagination`,
      );
      break;
    }

    let newCount = 0;
    for (const p of products) {
      if (!seen.has(p.href)) {
        seen.set(p.href, p);
        newCount++;
      }
    }

    console.log(
      `[notebookmall-printers] page ${pageNum} -> ${products.length} products, ${newCount} new`,
    );

    const nextExists = await hasNextPage(puppeteerPage, pageNum + 1);

    if (newCount === 0) {
      consecutiveNoNew++;
      if (consecutiveNoNew >= 2) {
        console.log(
          `[notebookmall-printers] stopping — 2 consecutive pages with no new products`,
        );
        break;
      }
    } else {
      consecutiveNoNew = 0;
    }

    if (!nextExists) {
      console.log("[notebookmall-printers] no next-page link found — stopping");
      break;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return [...seen.values()];
}

function resolveUrl(href) {
  if (!href) return null;
  return href.startsWith("http")
    ? href
    : `https://notebookmall.am${href.startsWith("/") ? "" : "/"}${href}`;
}

const USER_DATA_DIR = path.join(
  __dirname,
  "chrome-profile-notebookmall-printers",
);

// Same output shape as the existing dgcomp printers scraper:
// { name, cash_price, installment_price, source, category, url }
export async function scrapeNotebookmallPrinters() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1366,768",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    defaultViewport: { width: 1366, height: 768 },
  });
  const puppeteerPage = await browser.newPage();

  await puppeteerPage.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  await puppeteerPage.setUserAgent(USER_AGENT);
  await loadCookies(puppeteerPage);

  let results = [];
  try {
    const rawProducts = await fetchAllListingProducts(puppeteerPage);

    results = rawProducts.map((p) => ({
      name: p.name,
      cash_price: p.cash_price,
      installment_price: null, // this store does not expose an installment/monthly price on the listing
      source: STORE,
      category: "printers",
      url: resolveUrl(p.href),
    }));

    console.log(`[notebookmall-printers] Total: ${results.length}`);
  } finally {
    await browser.close();
  }

  const output = {
    source: STORE,
    scraped_at: new Date().toISOString(),
    count: results.length,
    products: results,
  };

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, "notebookmall.json"),
    JSON.stringify(output, null, 2),
  );
  console.log(
    `[notebookmall-printers] saved to ${path.join(CACHE_DIR, "notebookmall.json")}`,
  );

  return results;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  scrapeNotebookmallPrinters().catch((err) => {
    console.error("[notebookmall-printers] fatal error:", err);
    process.exit(1);
  });
}
