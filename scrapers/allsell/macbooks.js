import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

const BASE_URL = "https://allsell.am";

const CATEGORY_URLS = [
  "https://allsell.am/am/computer-equipment/notebooks?mgs_brand=16&price=97400-2309000",
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

/* ---------------------------- listing pages ---------------------------- */

function getTotalPages($) {
  let maxPage = 1;
  $("a[href*='p=']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/[?&]p=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
  });
  return maxPage;
}

function extractListingProducts($) {
  const products = [];
  $(".product-item-info").each((_, el) => {
    const $card = $(el);
    const name = $card.find(".product-item-link").first().text().trim();
    if (!name) return;
    const href =
      $card.find("a.product-item-photo").attr("href") ||
      $card.find(".product-item-link").attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    products.push({ name, url });
  });
  return products;
}

async function fetchListingPage(categoryUrl, page) {
  const separator = categoryUrl.includes("?") ? "&" : "?";
  const url = page === 1 ? categoryUrl : `${categoryUrl}${separator}p=${page}`;
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  const products = extractListingProducts($);
  const totalPages = page === 1 ? getTotalPages($) : null;
  return { products, totalPages };
}

/* ---------------------------- simple products ---------------------------- */

// NOTE: this reads from the live, JS-rendered Puppeteer page - NOT static
// axios HTML. For a genuinely simple (no-swatch) product, data-price-amount
// on first load is correct (nothing has clicked/changed it yet), so this is
// safe to use here even though we avoid it post-click for configurables.
async function parseSimpleProductFromPage(baseName, page) {
  return page.evaluate((baseName) => {
    const priceEl = document.querySelector("[data-price-type='finalPrice']");
    const cashRaw = priceEl ? priceEl.getAttribute("data-price-amount") : null;
    const cash_price = cashRaw ? parseInt(cashRaw, 10) : null;
    if (!cash_price) return null;

    const installmentEl = document.querySelector(".credit_price .price");
    const installmentText = installmentEl ? installmentEl.textContent.trim() : null;
    const installment_price = installmentText
      ? parseInt(installmentText.replace(/[^\d]/g, ""), 10) || null
      : null;

    return { name: baseName, cash_price, installment_price, source: "allsell" };
  }, baseName);
}

/* ---------------------- configurable (swatch) products ---------------------- */

// CRITICAL: Magento's swatch containers (`.swatch-attribute`) exist in the
// server-rendered HTML, but the actual `.swatch-option` elements inside them
// are populated client-side by knockout.js AFTER page JS runs. A static
// axios+cheerio fetch sees `.swatch-attribute` with zero children, so
// attribute detection silently comes back empty and the product gets
// misclassified as "simple" (wrong name, wrong/default price). This must
// run against the live Puppeteer DOM, after `networkidle2`, not raw HTML.
async function extractSwatchAttributesFromPage(page) {
  return page.evaluate(() => {
    const attributes = [];
    document.querySelectorAll(".swatch-attribute").forEach((attrEl) => {
      const code = attrEl.getAttribute("data-attribute-code");
      const options = [];
      attrEl.querySelectorAll(".swatch-option").forEach((optEl) => {
        const id = optEl.id;
        const optionId = optEl.getAttribute("data-option-id");
        const label = optEl.getAttribute("data-option-label") || optEl.textContent.trim();
        if (id && optionId) options.push({ id, optionId, label });
      });
      if (options.length > 0) attributes.push({ code, options });
    });
    return attributes;
  });
}

function cartesianProduct(arrays) {
  return arrays.reduce(
    (acc, curr) => acc.flatMap((combo) => curr.map((item) => [...combo, item])),
    [[]]
  );
}

/* ------------------- Magento jsonConfig: ground truth for real combos ------------------- *
 * Magento renders configurable-product swatch data inline as a
 * `<script type="text/x-magento-init">` block. Its "index" map lists every
 * REAL existing option-combination -> product id, and "optionPrices" gives
 * the authoritative price per product id.
 *
 * This matters because clicking through the UI for a combo that ISN'T in
 * `index` doesn't fail visibly - Magento just leaves stale/fallback data in
 * the DOM. Worse, even for VALID combos, the `data-price-amount` attribute
 * on the price element does NOT get updated by the swatch JS after the
 * first click - only the rendered text does. Reading `data-price-amount`
 * post-click (as the old scraper did) silently returns the price of
 * whichever variant loaded by default on page load, not the selected one.
 *
 * Fix: use jsonConfig as the source of truth for (a) which combos actually
 * exist and (b) their price. Puppeteer clicking is only used afterwards to
 * read the rendered title (which DOES update correctly), for the model
 * code that isn't present in jsonConfig.
 * ------------------------------------------------------------------------ */

function extractMagentoInitConfigs(html) {
  const $ = cheerio.load(html);
  const configs = [];
  $('script[type="text/x-magento-init"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      configs.push(JSON.parse(raw));
    } catch {
      // ignore unparsable blocks
    }
  });
  return configs;
}

function findSwatchRendererConfig(magentoInitConfigs) {
  for (const block of magentoInitConfigs) {
    for (const selector of Object.keys(block || {})) {
      const widgets = block[selector];
      if (widgets && widgets["Magento_Swatches/js/swatch-renderer"]) {
        return widgets["Magento_Swatches/js/swatch-renderer"];
      }
      if (widgets && widgets["Magento_ConfigurableProduct/js/configurable"]) {
        return widgets["Magento_ConfigurableProduct/js/configurable"];
      }
    }
  }
  return null;
}

function extractFinalPrice(optionPrices, productId) {
  const entry = optionPrices?.[productId];
  if (!entry) return null;
  const amount = entry.finalPrice?.amount ?? entry.finalPrice ?? null;
  if (amount == null) return null;
  return Math.round(Number(amount));
}

// Cross-references the swatch attributes (color/drive, with their DOM
// element ids) against jsonConfig.index to figure out which cartesian
// combos are real, and what their authoritative price is.
// Returns a Map keyed by "optionId|optionId|..." (in `attributes` order) ->
// { productId, cash_price }
function buildValidCombosMap(jsonConfig, attributes) {
  const validMap = new Map();
  if (!jsonConfig) return validMap;

  const index = jsonConfig.index;
  const optionPrices = jsonConfig.optionPrices;
  const attrDefs = jsonConfig.attributes;
  if (!index || !attrDefs) return validMap;

  // Map our attribute codes (color, drive, ...) -> Magento's numeric attribute id
  const codeToAttrId = {};
  for (const attrId of Object.keys(attrDefs)) {
    const code = attrDefs[attrId]?.code;
    if (code) codeToAttrId[code] = attrId;
  }

  for (const productId of Object.keys(index)) {
    const entry = index[productId]; // { attrId: optionId, ... }
    const parts = [];
    let complete = true;

    for (const attr of attributes) {
      const attrId = codeToAttrId[attr.code];
      const optionId = attrId != null ? entry[attrId] : undefined;
      if (optionId == null) {
        complete = false;
        break;
      }
      parts.push(String(optionId));
    }

    if (!complete) continue; // this index entry doesn't cover all our attributes, skip

    const signature = parts.join("|");
    const cash_price = extractFinalPrice(optionPrices, productId);
    validMap.set(signature, { productId, cash_price });
  }

  return validMap;
}

// `page` is already navigated to `url` by the caller (fetchProductVariants) -
// we reuse it here instead of opening a second page/navigation.
async function scrapeConfigurableProduct(page, baseName, url, attributes, validCombosMap) {
  // Build all cartesian combos, but only keep the ones jsonConfig confirms are real.
  const allCombos = cartesianProduct(attributes.map((a) => a.options));
  const combosToClick = [];

  for (const combo of allCombos) {
    const signature = combo.map((o) => String(o.optionId)).join("|");
    const validEntry = validCombosMap.get(signature);
    if (!validEntry) continue; // not a real combo - skip, don't click it
    combosToClick.push({ combo, ...validEntry });
  }

  if (combosToClick.length === 0) {
    console.warn(
      `[allsell-macbooks] "${baseName}": jsonConfig had no matching valid combos, falling back to all ${allCombos.length} combo(s)`
    );
    for (const combo of allCombos) combosToClick.push({ combo, productId: null, cash_price: null });
  }

  const results = [];

  {
    for (const { combo, productId, cash_price: jsonCashPrice } of combosToClick) {
      try {
        for (const opt of combo) {
          const selector = `[id="${opt.id}"]`;
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.click(selector);
        }

        await page.waitForNetworkIdle({ idleTime: 400, timeout: 5000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 300));

        const data = await page.evaluate(() => {
          const titleEl = document.querySelector("h1.page-title .base");
          const title = titleEl ? titleEl.textContent.trim() : null;

          // Kept only as a fallback / sanity-check - NOT the primary price
          // source, since data-price-amount doesn't update after the first
          // swatch click.
          const priceEl = document.querySelector("[data-price-type='finalPrice']");
          const domPriceText = priceEl ? priceEl.textContent.trim() : null;

          const installmentEl = document.querySelector(".credit_price .price");
          const installmentText = installmentEl ? installmentEl.textContent.trim() : null;

          return { title, domPriceText, installmentText };
        });

        if (!data.title) continue;

        const domCashPrice = data.domPriceText
          ? parseInt(data.domPriceText.replace(/[^\d]/g, ""), 10) || null
          : null;

        // Prefer the authoritative jsonConfig price; only fall back to the
        // DOM-parsed text price if jsonConfig didn't have one.
        const cash_price = jsonCashPrice ?? domCashPrice;

        if (jsonCashPrice != null && domCashPrice != null && jsonCashPrice !== domCashPrice) {
          console.warn(
            `[allsell-macbooks] "${data.title}": jsonConfig price (${jsonCashPrice}) differs from rendered text price (${domCashPrice}) - using jsonConfig`
          );
        }

        const installment_price = data.installmentText
          ? parseInt(data.installmentText.replace(/[^\d]/g, ""), 10) || null
          : null;

        if (!cash_price) {
          console.warn(`[allsell-macbooks] "${data.title}": no price found for combo, dropping`);
          continue;
        }

        results.push({
          name: data.title,
          cash_price,
          installment_price,
          source: "allsell",
          _productId: productId, // internal only, stripped before returning
        });
      } catch (err) {
        console.warn(
          `[allsell-macbooks] Combo failed for "${baseName}" (${combo
            .map((o) => o.label)
            .join(", ")}): ${err.message}`
        );
      }
    }
  }

  // De-dupe by product id when we have it (reliable); fall back to name.
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    const key = r._productId ?? r.name;
    if (!seen.has(key)) {
      seen.add(key);
      // eslint-disable-next-line no-unused-vars
      const { _productId, ...clean } = r;
      unique.push(clean);
    }
  }
  return unique;
}

/* ---------------------------- per-product dispatch ---------------------------- */

async function fetchProductVariants(browser, baseName, url) {
  const page = await browser.newPage();
  await page.setUserAgent(HEADERS["User-Agent"]);
  await page.setExtraHTTPHeaders({ "Accept-Language": HEADERS["Accept-Language"] });

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["image", "font", "media"].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Extract attributes from the LIVE rendered DOM (see note above extractSwatchAttributesFromPage).
    const attributes = await extractSwatchAttributesFromPage(page);

    if (attributes.length === 0) {
      const product = await parseSimpleProductFromPage(baseName, page);
      return product ? [product] : [];
    }

    // jsonConfig is embedded as a literal <script> tag, so the rendered HTML
    // (post-JS) still contains it - grab it from the live page for consistency.
    const renderedHtml = await page.content();
    const magentoInitConfigs = extractMagentoInitConfigs(renderedHtml);
    const swatchConfigBlock = findSwatchRendererConfig(magentoInitConfigs);
    const jsonConfig = swatchConfigBlock?.jsonConfig || swatchConfigBlock || null;

    const validCombosMap = buildValidCombosMap(jsonConfig, attributes);

    const totalCombos = attributes.reduce((acc, a) => acc * a.options.length, 1);
    console.log(
      `[allsell-macbooks] "${baseName}" has ${attributes.length} option(s) (${attributes
        .map((a) => `${a.code}: ${a.options.length}`)
        .join(", ")}) -> ${totalCombos} theoretical combo(s), ${
        validCombosMap.size
      } confirmed real via jsonConfig`
    );

    if (validCombosMap.size === 0) {
      console.warn(
        `[allsell-macbooks] "${baseName}": no jsonConfig found or attribute codes didn't match jsonConfig - check codeToAttrId mapping`
      );
    }

    return await scrapeConfigurableProduct(page, baseName, url, attributes, validCombosMap);
  } catch (err) {
    console.warn(`[allsell-macbooks] Failed ${url}: ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

/* ---------------------------- main entry point ---------------------------- */

export async function scrapeAllsellMacbooks() {
  const allListingProducts = [];

  for (const categoryUrl of CATEGORY_URLS) {
    const { products: firstPage, totalPages } = await fetchListingPage(categoryUrl, 1);
    allListingProducts.push(...firstPage);

    for (let page = 2; page <= totalPages; page++) {
      const { products } = await fetchListingPage(categoryUrl, page);
      allListingProducts.push(...products);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const seenUrls = new Set();
  const unique = [];
  for (const p of allListingProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  console.log(`[allsell-macbooks] ${unique.length} unique products, fetching details...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];
  try {
    for (let i = 0; i < unique.length; i++) {
      const { name, url } = unique[i];
      console.log(`[allsell-macbooks] (${i + 1}/${unique.length}) ${name}`);
      const variants = await fetchProductVariants(browser, name, url);
      results.push(...variants);
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    await browser.close();
  }

  console.log(`[allsell-macbooks] Total: ${results.length}`);
  return results;
}