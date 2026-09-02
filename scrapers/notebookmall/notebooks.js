import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "rebrowser-puppeteer";
import { parseListingHtml } from "./parseListing.js";
import { parseDetailHtml } from "./parseDetail.js";
import { detectBrand, BRAND_LIST } from "../../core/notebookAttributes.js";

process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORE = "notebookmall.am";
const LISTING_BASE =
  "https://notebookmall.am/product-category/notebooks/plain/";
const LISTING_QUERY =
  "query_type_brand=or&filter_brand=acer,asus,dell,hp,lenovo,msi,samsung";
const CACHE_DIR = path.join(__dirname, "..", "..", "cache", "notebooks");
const COOKIE_PATH = path.join(CACHE_DIR, "cf-cookies.json");

const REQUEST_DELAY_MS = 800;
const MAX_PAGES_SAFETY = 100;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listingUrlForPage(page) {
  return page <= 1
    ? `${LISTING_BASE}?${LISTING_QUERY}`
    : `${LISTING_BASE}page/${page}/?${LISTING_QUERY}`;
}

const CF_CHALLENGE_TITLE_RE =
  /just a moment|checking your browser|attention required|please wait/i;

// Exact detection logic from the working standalone test script — unchanged.
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
    console.log("[notebookmall] no saved cookies found");
    return;
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, "utf8"));
    if (Array.isArray(cookies) && cookies.length > 0) {
      await page.setCookie(...cookies);
      console.log(`[notebookmall] loaded ${cookies.length} saved cookies`);
    }
  } catch (err) {
    console.warn("[notebookmall] failed to load cookies:", err.message);
  }
}

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    console.log(
      `[notebookmall] saved ${cookies.length} cookies to ${COOKIE_PATH}`,
    );
  } catch (err) {
    console.warn("[notebookmall] failed to save cookies:", err.message);
  }
}

// Exact click logic from the working standalone test script — unchanged.
async function tryClickTurnstile(page) {
  // Find the Turnstile frame
  const turnstileFrame = page.frames().find((f) => {
    const url = f.url() || "";
    return url.includes("challenges.cloudflare.com") || url.includes("turnstile");
  });

  if (!turnstileFrame) {
    console.log("[notebookmall] no Turnstile frame found");
    return false;
  }

  console.log("[notebookmall] Turnstile frame found");

  let iframeElement = null;
  try {
    iframeElement = await turnstileFrame.frameElement();
  } catch (e) {
    console.log("[notebookmall] frameElement() failed:", e.message);
    return false;
  }

  if (!iframeElement) {
    console.log("[notebookmall] could not get iframe element");
    return false;
  }

  const box = await iframeElement.boundingBox();
  if (!box) {
    console.log("[notebookmall] iframe has no bounding box");
    return false;
  }

  console.log(
    `[notebookmall] iframe box: x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`,
  );

  // Click roughly where the checkbox usually is
  const clickX = box.x + Math.min(box.width * 0.22, 40);
  const clickY = box.y + box.height * 0.5;

  await page.mouse.click(clickX, clickY, { delay: 80 });
  console.log(`[notebookmall] clicked at (${Math.round(clickX)}, ${Math.round(clickY)})`);
  return true;
}

async function waitOutCloudflareChallenge(page, maxWaitMs = 50000) {
  // Exact loop from the working standalone test script — unchanged.
  const start = Date.now();
  let attempts = 0;
  let cleared = false;

  while (Date.now() - start < maxWaitMs) {
    const challenged = await isChallenge(page);

    if (!challenged) {
      cleared = true;
      console.log("[notebookmall] challenge cleared");
      break;
    }

    if (attempts < 5) {
      attempts++;
      console.log(`[notebookmall] challenge still present — click attempt ${attempts}`);
      await tryClickTurnstile(page);
      await sleep(3000);
    } else {
      console.log("[notebookmall] still on challenge page... waiting");
      await sleep(2000);
    }
  }

  if (cleared) {
    await saveCookies(page); // keep cookies fresh
    return true;
  }

  // Still blocked after the test script's own timeout → ask for manual help
  // as an extra safety net (not part of the original test script).
  console.log("======================================================");
  console.log(" Cloudflare Turnstile is still present.");
  console.log(" Please solve the checkbox MANUALLY in the browser window.");
  console.log(" The script will continue automatically once it disappears.");
  console.log("======================================================");

  // Wait up to 3 minutes for you to solve it
  const manualStart = Date.now();
  while (Date.now() - manualStart < 180000) {
    const stillThere = await isChallenge(page);
    if (!stillThere) {
      console.log("[notebookmall] manual solve detected — saving cookies");
      await saveCookies(page);
      await sleep(1500);
      return true;
    }
    await sleep(1000);
  }

  console.warn("[notebookmall] challenge was not solved in time");
  return false;
}

// Plain axios gets a 403 on this store regardless of headers — it's behind
// a WAF/Cloudflare-style JS challenge, not just a User-Agent check. Puppeteer
// runs the challenge like a real browser and reuses cookies across
// navigations within the same page/session, so we fetch everything through it.
async function fetchHtml(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const ok = await waitOutCloudflareChallenge(page);
  if (!ok) {
    throw new Error("Cloudflare challenge could not be cleared");
  }
  await sleep(600 + Math.random() * 400);
  return page.content();
}

async function fetchAllListingStubs(puppeteerPage) {
  let page = 1;
  let allStubs = [];
  let maxPage = null;

  while (page <= MAX_PAGES_SAFETY) {
    const html = await fetchHtml(puppeteerPage, listingUrlForPage(page));
    const { stubs, maxPage: pageMax } = parseListingHtml(html);

    if (page === 1) {
      maxPage = pageMax;
      console.log(
        `[notebookmall] site reports ${maxPage ?? "unknown"} page(s)`,
      );
    }

    if (stubs.length === 0) {
      if (CF_CHALLENGE_TITLE_RE.test(html)) {
        console.warn(
          `[notebookmall] page ${page} still shows the Cloudflare challenge page — not a real empty page`,
        );
      } else {
        console.log(`[notebookmall] page ${page} empty — stopping pagination`);
      }
      break;
    }

    console.log(`[notebookmall] page ${page} -> ${stubs.length} products`);
    allStubs = allStubs.concat(stubs);

    if (maxPage !== null && page >= maxPage) break;

    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  // de-dupe defensively (e.g. a product pinned/repeated across pages)
  const seen = new Set();
  const deduped = allStubs.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  if (deduped.length !== allStubs.length) {
    console.warn(
      `[notebookmall] removed ${allStubs.length - deduped.length} duplicate product id(s)`,
    );
  }

  return deduped;
}

function resolveBrand(name, brandHint) {
  if (brandHint) {
    const known = BRAND_LIST.find(
      (b) => b.name.toLowerCase() === brandHint.toLowerCase(),
    );
    if (known) return known.name;
    return brandHint; // store gave us an explicit brand not in our known list — keep it rather than drop it
  }
  return detectBrand(name, []); // fallback: substring match against known brands
}

async function enrichStub(puppeteerPage, stub) {
  if (!stub.needs_detail_fetch) {
    return {
      id: stub.id,
      store: STORE,
      name: stub.name,
      brand: resolveBrand(stub.name, stub.brand_hint),
      price: stub.price,
      installment_price: null, // this store does not expose an installment/monthly price
      url: stub.url,
      thumbnail: stub.thumbnail,
      specs: stub.specs,
      scraped_at: new Date().toISOString(),
    };
  }

  try {
    const html = await fetchHtml(puppeteerPage, stub.url);
    const { specs, brandRaw } = parseDetailHtml(html);
    return {
      id: stub.id,
      store: STORE,
      name: stub.name,
      brand: resolveBrand(stub.name, stub.brand_hint || brandRaw),
      price: stub.price,
      installment_price: null,
      url: stub.url,
      thumbnail: stub.thumbnail,
      specs,
      scraped_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(
      `[notebookmall] failed to fetch detail for ${stub.url}: ${err.message}`,
    );
    return {
      id: stub.id,
      store: STORE,
      name: stub.name,
      brand: resolveBrand(stub.name, stub.brand_hint),
      price: stub.price,
      installment_price: null,
      url: stub.url,
      thumbnail: stub.thumbnail,
      specs: stub.specs,
      scraped_at: new Date().toISOString(),
    };
  }
}

const USER_DATA_DIR = path.join(__dirname, "chrome-profile-notebookmall");

export async function scrapeNotebookmallNotebooks() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  // Exact launch config from the working standalone test script — unchanged.
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

  // Same navigator.webdriver patch validated in the standalone test script.
  await puppeteerPage.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  await puppeteerPage.setUserAgent(USER_AGENT);

  // Reuse cookies from a previous cleared challenge if we have them.
  await loadCookies(puppeteerPage);

  let normalizedOut = [];
  try {
    const stubs = await fetchAllListingStubs(puppeteerPage);
    console.log(`[notebookmall] enriching ${stubs.length} products...`);

    for (const [i, stub] of stubs.entries()) {
      console.log(
        `[notebookmall] (${i + 1}/${stubs.length}) ${stub.name}${stub.needs_detail_fetch ? " (fetching detail page)" : ""}`,
      );
      normalizedOut.push(await enrichStub(puppeteerPage, stub));
      if (stub.needs_detail_fetch) await sleep(REQUEST_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const noBrand = normalizedOut.filter((p) => !p.brand).length;
  if (noBrand > 0) {
    console.warn(
      `[notebookmall] ${noBrand} product(s) had no brand detected — check name matching`,
    );
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, "notebookmall.raw.json"),
    JSON.stringify({ normalized: normalizedOut }, null, 2),
  );
  fs.writeFileSync(
    path.join(CACHE_DIR, "notebookmall.json"),
    JSON.stringify(normalizedOut, null, 2),
  );

  console.log(
    `[notebookmall] done — ${normalizedOut.length} products saved to ${CACHE_DIR}`,
  );
  return normalizedOut;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  scrapeNotebookmallNotebooks().catch((err) => {
    console.error("[notebookmall] fatal error:", err);
    process.exit(1);
  });
}