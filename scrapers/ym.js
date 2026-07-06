import axios from "axios";
import * as cheerio from "cheerio";
import { saveCache, markUpdated } from "../core/cache_manager.js";

const BASE_URL = "https://www.yerevanmobile.am";
const LIST_URL = `${BASE_URL}/am/electronics/phones.html?brands=171%2C11%2C12%2C38%2C411&product_list_limit=48`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

function getTotalPages($) {
  let maxPage = 1;
  $("ul.pages-items a.page").each((_, el) => {
    const text = $(el).find("span").last().text().trim();
    const n = parseInt(text, 10);
    if (!isNaN(n)) maxPage = Math.max(maxPage, n);
  });
  return maxPage;
}

function extractListingProducts($) {
  const products = [];

  $(".product-item-info").each((_, el) => {
    const $card = $(el);

    const name = (
      $card.find("img.product-image-photo").first().attr("alt") || ""
    )
      .replace(/^Գնել\s+/i, "")
      .trim();
    if (!name) return;

    const href = $card.find("a.product-item-photo").attr("href") || "";
    if (!href) return;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    products.push({ name, url });
  });

  return products;
}
function normalizeSimLabel(label) {
  const l = label.toLowerCase();
  if (l.includes("nano") || l.includes("and/or") || l.includes("1 sim"))
    return "Nano-Sim";
  if (/^e[\s-]?sim$/i.test(l.trim())) return "eSim";
  if (l.includes("dual") || l.includes("2")) return "Dual eSim";
  return label;
}

function extractStaticSimLabel($) {
  let simText = null;
  $("li").each((_, el) => {
    const $li = $(el);
    const label = $li.find(".type_block").first().text().trim();
    if (label === "SIM-Քարտ") {
      simText = $li.find(".result_block").first().text().trim();
    }
  });
  return simText;
}

function getStaticSimSuffix(simText) {
  if (!simText) return "";
  const s = simText.toLowerCase();
  if (s.includes("esim") && s.includes("nano")) return " Nano-Sim"; // nano tray + eSIM capability
  if (s.includes("esim")) return " Dual eSim"; // eSIM + eSIM, no physical tray mentioned
  if (/nano[\s-]?sim\s*\+\s*nano[\s-]?sim/.test(s)) return " Dual-Sim"; // two physical trays, no eSIM
  return "";
}
// --- Detail page parser ---

async function fetchProductVariants(baseName, url) {
  try {
    const res = await axios
      .get(url, {
        headers: HEADERS,
        timeout: 15000,
        signal: AbortSignal.timeout(15000),
      })
      .catch((err) => {
        throw new Error(`YM fetch failed: ${err.message}`);
      });
    const html = res.data;

    const attrStart = html.indexOf('"attributes"');
    const optionStart = html.indexOf('"optionPrices"');
    const priceFormatStart = html.indexOf('"priceFormat"');

    console.log(`[debug] ${baseName}`);
    console.log(
      `  attrStart=${attrStart} optionStart=${optionStart} priceFormatStart=${priceFormatStart}`,
    );

    if (attrStart === -1 || optionStart === -1 || priceFormatStart === -1) {
      console.log("  -> MISSING MARKERS, falling back");
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }

    let optionPrices;
    try {
      const optionChunk = html.slice(optionStart, priceFormatStart);
      const jsonStr = optionChunk
        .replace(/^"optionPrices"\s*:\s*/, "")
        .replace(/,\s*$/, "");
      optionPrices = JSON.parse(jsonStr);
      console.log(
        "  optionPrices keys:",
        Object.keys(optionPrices).slice(0, 3),
      );
    } catch (e) {
      console.log("  -> optionPrices PARSE FAILED:", e.message);
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }

    let attributes;
    try {
      const attrChunk = html.slice(attrStart, optionStart);
      let jsonStr = attrChunk.replace(/^"attributes"\s*:\s*/, "");

      // Find the correct end by counting braces
      let depth = 0;
      let endIndex = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === "{") depth++;
        else if (jsonStr[i] === "}") {
          depth--;
          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
      jsonStr = jsonStr.slice(0, endIndex);
      attributes = JSON.parse(jsonStr);
      console.log("  attributes keys:", Object.keys(attributes));
    } catch (e) {
      console.log("  -> attributes PARSE FAILED:", e.message);
      return [parseSimpleProduct(baseName, html)].filter(Boolean);
    }
    // Extract disabled/empty option IDs from HTML
    const disabledProductIds = new Set();
    const $html = cheerio.load(html);
    $html('.swatch-option[data-option-empty="true"]').each((_, el) => {
      const optionId = $html(el).attr("data-option-id");
      if (optionId) {
        for (const attr of Object.values(attributes)) {
          const option = attr.options?.find((o) => o.id === optionId);
          if (option)
            option.products?.forEach((id) => disabledProductIds.add(id));
        }
      }
    });
    // Find memory attribute
    const memoryAttr = Object.values(attributes).find(
      (a) => a.code === "memory",
    );
    const ramAttr = Object.values(attributes).find((a) => a.code === "gb_ram");
    const simAttr = Object.values(attributes).find(
      (a) => a.code === "sim_qard_quantity",
    );
    const staticSimSuffix = !simAttr
      ? getStaticSimSuffix(extractStaticSimLabel($html))
      : "";

    if (!memoryAttr)
      return [parseSimpleProduct(baseName, html)].filter(Boolean);

    const results = [];

    for (const storageOption of memoryAttr.options) {
      const storageLabel = storageOption.label.replace(/\s+/g, "");

      if (ramAttr) {
        // Has RAM variants — create entry per RAM+storage combination
        for (const ramOption of ramAttr.options) {
          const ramLabel = ramOption.label.replace(/\s+/g, "");
          const productId = storageOption.products.find(
            (id) =>
              ramOption.products.includes(id) && !disabledProductIds.has(id),
          );
          console.log(
            `  RAM ${ramLabel}: match=${productId}, price=${optionPrices[productId]?.finalPrice?.amount}`,
          );
          if (!productId || !optionPrices[productId]) continue;

          const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
          const installment_price =
            optionPrices[productId].creditPrice?.amount ?? null;
          if (!cash_price) continue;

          results.push({
            name: `${baseName} ${ramLabel}/${storageLabel}${staticSimSuffix}`, // <-- add suffix here
            cash_price,
            installment_price,
            source: "yerevanmobile",
          });
        }
      } else {
        // No RAM variants — storage only
        const productId = storageOption.products.find(
          (id) => !disabledProductIds.has(id),
        );
        if (!productId || !optionPrices[productId]) continue;

        const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
        const installment_price =
          optionPrices[productId].creditPrice?.amount ?? null;
        if (!cash_price) continue;

        results.push({
          name: `${baseName} ${storageLabel}${staticSimSuffix}`, // <-- add suffix here
          cash_price,
          installment_price,
          source: "yerevanmobile",
        });
      }
    }
    console.log(
      "  results:",
      results.map((r) => r.name),
    );
    if (simAttr && memoryAttr) {
      // Has both storage and SIM variants
      const results = [];
      const seen = new Set();

      for (const simOption of simAttr.options) {
        const simLabel = normalizeSimLabel(simOption.label);
        for (const storageOption of memoryAttr.options) {
          const storageLabel = storageOption.label.replace(/\s+/g, "");
          const key = `${storageLabel}|${simLabel}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const productId = storageOption.products.find(
            (id) =>
              simOption.products.includes(id) && !disabledProductIds.has(id),
          );
          if (!productId || !optionPrices[productId]) continue;

          const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
          const installment_price =
            optionPrices[productId].creditPrice?.amount ?? null;
          if (!cash_price) continue;

          results.push({
            name: `${baseName} ${storageLabel} (${simLabel})`,
            cash_price,
            installment_price,
            source: "yerevanmobile",
          });
        }
      }
      return results.length > 0
        ? results
        : [parseSimpleProduct(baseName, html)].filter(Boolean);
    }

    return results.length > 0
      ? results
      : [parseSimpleProduct(baseName, html)].filter(Boolean);
  } catch (err) {
    console.warn(`[ym] Warning: ${url}: ${err.message}`);
    return [];
  }
}

function parseSimpleProduct(baseName, html) {
  const $ = cheerio.load(html);
  const cashRaw = $("[data-price-type='finalPrice']")
    .first()
    .attr("data-price-amount");
  const cash_price = cashRaw ? parseInt(cashRaw, 10) : null;
  if (!cash_price) return null;

  const loanRaw = $("button.loan_price").first().attr("data-price");
  const installment_price = loanRaw ? Math.round(parseFloat(loanRaw)) : null;

  return {
    name: baseName,
    cash_price,
    installment_price,
    source: "yerevanmobile",
  };
}

// --- Main scraper ---

export async function scrapeYerevanMobile() {
  const listingProducts = [];
  let page = 1;

  while (true) {
    const pageUrl = page === 1 ? LIST_URL : `${LIST_URL}&p=${page}`;
    const res = await axios.get(pageUrl, { headers: HEADERS });
    const $ = cheerio.load(res.data);

    const pageProducts = extractListingProducts($);
    console.log(`[ym] Page ${page}: ${pageProducts.length} products`);

    if (pageProducts.length === 0) break;

    listingProducts.push(...pageProducts);

    // Check if next page exists via next button
    const hasNextPage =
      $("a.action.next").length > 0 && !$("a.action.next").hasClass("inactive");

    if (!hasNextPage) break;

    page++;
    await new Promise((r) => setTimeout(r, 500));
  }

  // ... rest stays the same
  // Add manually known products not in filtered listing
  const MANUAL_URLS = [
    {
      name: "Apple iPhone 17",
      url: "https://www.yerevanmobile.am/am/apple-iphone-17.html",
    },
  ];

  for (const manual of MANUAL_URLS) {
    if (!listingProducts.find((p) => p.url === manual.url)) {
      listingProducts.push(manual);
      console.log(`[ym] Added manual: ${manual.name}`);
    }
  }
  const allProducts = [];

  for (let i = 0; i < listingProducts.length; i++) {
    const { name, url } = listingProducts[i];
    console.log(`[ym] (${i + 1}/${listingProducts.length}) ${name}`);

    const variants = await fetchProductVariants(name, url);
    allProducts.push(...variants);

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[ym] Total variants: ${allProducts.length}`);
  return allProducts;
}
