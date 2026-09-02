import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "rebrowser-puppeteer";

process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORE = "notebookmall";

// Projectors are split across two separate WooCommerce category listings on
// this store — projectors themselves and projector screens. Both are
// scraped and merged into a single "projectors" category output.
const LISTING_BASES = [
  "https://notebookmall.am/product-category/peripheral/projector/",
  "https://notebookmall.am/product-category/peripheral/projector_screen/",
];

const CACHE_DIR = path.join(__dirname, "..", "..", "cache");
const COOKIE_PATH = path.join(CACHE_DIR, "cf-cookies.json");

const REQUEST_DELAY_MS = 800;
const MAX_PAGES_SAFETY = 100;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listingUrlForPage(listingBase, page) {
  return page <= 1 ? listingBase : `${listingBase}page/${page}/`;
}

const CF_CHALLENGE_TITLE_RE =
  /just a moment|checking your browser|attention required|please wait/i;

// --- Cloudflare/Turnstile handling — ported verbatim from printers.js ---

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
    console.log("[notebookmall-projectors] no saved cookies found");
    return;
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, "utf8"));
    if (Array.isArray(cookies) && cookies.length > 0) {
      await page.setCookie(...cookies);
      console.log(
        `[notebookmall-projectors] loaded ${cookies.length} saved cookies`,
      );
    }
  } catch (err) {
    console.warn(
      "[notebookmall-projectors] failed to load cookies:",
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
      `[notebookmall-projectors] saved ${cookies.length} cookies to ${COOKIE_PATH}`,
    );
  } catch (err) {
    console.warn(
      "[notebookmall-projectors] failed to save cookies:",
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
    console.log("[notebookmall-projectors] no Turnstile frame found");
    return false;
  }

  console.log("[notebookmall-projectors] Turnstile frame found");

  let iframeElement = null;
  try {
    iframeElement = await turnstileFrame.frameElement();
  } catch (e) {
    console.log("[notebookmall-projectors] frameElement() failed:", e.message);
    return false;
  }

  if (!iframeElement) {
    console.log("[notebookmall-projectors] could not get iframe element");
    return false;
  }

  const box = await iframeElement.boundingBox();
  if (!box) {
    console.log("[notebookmall-projectors] iframe has no bounding box");
    return false;
  }

  console.log(
    `[notebookmall-projectors] iframe box: x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`,
  );

  const clickX = box.x + Math.min(box.width * 0.22, 40);
  const clickY = box.y + box.height * 0.5;

  await page.mouse.click(clickX, clickY, { delay: 80 });
  console.log(
    `[notebookmall-projectors] clicked at (${Math.round(clickX)}, ${Math.round(clickY)})`,
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
      console.log("[notebookmall-projectors] challenge cleared");
      break;
    }

    if (attempts < 5) {
      attempts++;
      console.log(
        `[notebookmall-projectors] challenge still present — click attempt ${attempts}`,
      );
      await tryClickTurnstile(page);
      await sleep(3000);
    } else {
      console.log("[notebookmall-projectors] still on challenge page... waiting");
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
        "[notebookmall-projectors] manual solve detected — saving cookies",
      );
      await saveCookies(page);
      await sleep(1500);
      return true;
    }
    await sleep(1000);
  }

  console.warn("[notebookmall-projectors] challenge was not solved in time");
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

// --- Listing extraction — identical strategy to printers.js: anchor on
// add-to-cart links since the theme re-skins WooCommerce loop markup. -----
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

async function hasNextPage(page, nextPageNum) {
  return page.evaluate((next) => {
    return Array.from(document.querySelectorAll('a[href*="/page/"]')).some(
      (a) => (a.getAttribute("href") || "").includes(`/page/${next}/`),
    );
  }, nextPageNum);
}

// Scrapes one listing base (e.g. projector, or projector_screen) fully,
// merging results into the shared `seen` map keyed by href.
async function fetchListingBase(puppeteerPage, listingBase, seen) {
  let consecutiveNoNew = 0;

  for (let pageNum = 1; pageNum <= MAX_PAGES_SAFETY; pageNum++) {
    const url = listingUrlForPage(listingBase, pageNum);
    const html = await fetchHtml(puppeteerPage, url);

    if (CF_CHALLENGE_TITLE_RE.test(html)) {
      console.warn(
        `[notebookmall-projectors] ${listingBase} page ${pageNum} still shows the Cloudflare challenge page — not a real page, stopping`,
      );
      break;
    }

    const products = await extractListingProducts(puppeteerPage);

    if (products.length === 0) {
      console.log(
        `[notebookmall-projectors] ${listingBase} page ${pageNum} empty — stopping pagination`,
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
      `[notebookmall-projectors] ${listingBase} page ${pageNum} -> ${products.length} products, ${newCount} new`,
    );

    const nextExists = await hasNextPage(puppeteerPage, pageNum + 1);

    if (newCount === 0) {
      consecutiveNoNew++;
      if (consecutiveNoNew >= 2) {
        console.log(
          `[notebookmall-projectors] ${listingBase} stopping — 2 consecutive pages with no new products`,
        );
        break;
      }
    } else {
      consecutiveNoNew = 0;
    }

    if (!nextExists) {
      console.log(
        `[notebookmall-projectors] ${listingBase} no next-page link found — stopping`,
      );
      break;
    }

    await sleep(REQUEST_DELAY_MS);
  }
}

async function fetchAllListingProducts(puppeteerPage) {
  const seen = new Map();

  for (const listingBase of LISTING_BASES) {
    await fetchListingBase(puppeteerPage, listingBase, seen);
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
  "chrome-profile-notebookmall-projectors",
);

// Same output shape as printers.js:
// { name, cash_price, installment_price, source, category, url }
export async function scrapeNotebookmallProjectors() {
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
      category: "projectors",
      url: resolveUrl(p.href),
    }));

    console.log(`[notebookmall-projectors] Total: ${results.length}`);
  } finally {
    await browser.close();
  }

  return results;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  scrapeNotebookmallProjectors().catch((err) => {
    console.error("[notebookmall-projectors] fatal error:", err);
    process.exit(1);
  });
}