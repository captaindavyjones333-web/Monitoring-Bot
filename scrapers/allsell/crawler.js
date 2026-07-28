import axios from "axios";
import * as cheerio from "cheerio";
import { getSimSuffixFromText } from "../../core/simClassifier.js";

const BASE_URL = "https://allsell.am";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

function extractSimFromTable($) {
  let simText = null;

  // 1. Primary check: Search td elements with data-th attribute (case-insensitive & supports Armenian)
  $("td[data-th]").each((_, el) => {
    const dataTh = ($(el).attr("data-th") || "").toLowerCase();
    if (dataTh.includes("sim") || dataTh.includes("սիմ")) {
      if (!simText) simText = $(el).text().trim();
    }
  });

  // 2. Fallback check: Search header <th> text case-insensitively
  if (!simText) {
    $("th").each((_, el) => {
      const label = $(el).text().trim().toLowerCase();
      if (label.includes("sim") || label.includes("սիմ")) {
        if (!simText) {
          simText = $(el).closest("tr").find("td").text().trim();
        }
      }
    });
  }

  return simText;
}

function normalizeStorageLabel(label) {
  return label
    .replace(/\s*ԳԲ/gi, "GB")
    .replace(/\s*ՏԲ/gi, "TB")
    .replace(/\s+/g, "")
    .trim();
}

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

function normalizeSimLabel(label) {
  const l = label.toLowerCase();
  if (
    l.includes("esim+esim") ||
    l.includes("esim + esim") ||
    l.includes("2 esim")
  )
    return "eSim"; // dual eSIM is treated the same as single eSIM
  if (l.includes("nano") || l.includes("/esim") || l.includes("+ esim"))
    return "Nano-Sim";
  if (/^e[\s-]?sim$/i.test(l.trim())) return "eSim";
  return label;
}

function parseSimpleProduct(baseName, html, source) {
  const $ = cheerio.load(html);
  const cashRaw = $("[data-price-type='finalPrice']")
    .first()
    .attr("data-price-amount");
  const cash_price = cashRaw ? parseInt(cashRaw, 10) : null;
  if (!cash_price) return null;

  const installmentText = $(".credit_price .price").first().text().trim();
  const installment_price = installmentText
    ? parseInt(installmentText.replace(/[^\d]/g, ""), 10) || null
    : null;
  const simText = extractSimFromTable($);
  const simSuffix = getSimSuffixFromText(simText);
  const finalName =
    simSuffix && !baseName.toLowerCase().includes("sim")
      ? `${baseName}${simSuffix}`
      : baseName;

  return { name: finalName, cash_price, installment_price, source };
}

async function fetchProductVariants(baseName, url, logTag, opts = {}) {
  const { isTablet = false } = opts;
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const html = res.data;
    const $ = cheerio.load(html);

    // Extract SIM from HTML table specification as fallback
    const tableSimText = extractSimFromTable($);
    const tableSimSuffix = getSimSuffixFromText(tableSimText);

    const attrStart = html.indexOf('"attributes"');
    const optionStart = html.indexOf('"optionPrices"');
    const priceFormatStart = html.indexOf('"priceFormat"');

    if (attrStart === -1 || optionStart === -1 || priceFormatStart === -1) {
      return [parseSimpleProduct(baseName, html, "allsell")].filter(Boolean);
    }

    let optionPrices;
    try {
      const chunk = html.slice(optionStart, priceFormatStart);
      const jsonStr = chunk
        .replace(/^"optionPrices"\s*:\s*/, "")
        .replace(/,\s*$/, "");
      optionPrices = JSON.parse(jsonStr);
    } catch {
      return [parseSimpleProduct(baseName, html, "allsell")].filter(Boolean);
    }

    let attributes;
    try {
      const attrChunk = html.slice(attrStart, optionStart);
      let jsonStr = attrChunk.replace(/^"attributes"\s*:\s*/, "");
      let depth = 0,
        endIndex = 0;
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
    } catch {
      return [parseSimpleProduct(baseName, html, "allsell")].filter(Boolean);
    }

    const storageAttr = Object.values(attributes).find(
      (a) => a.code === "drive",
    );
    const ramAttr = Object.values(attributes).find((a) => a.code === "ram");
    const simAttr = Object.values(attributes).find(
      (a) => a.code === "sim_card" || a.code === "sim" || a.code === "sim_type",
    );

    if (!storageAttr)
      return [parseSimpleProduct(baseName, html, "allsell")].filter(Boolean);

    const results = [];
    const isApple =
      baseName.toLowerCase().includes("iphone") ||
      baseName.toLowerCase().includes("ipad") ||
      baseName.toLowerCase().startsWith("apple");

    if (isApple && simAttr) {
      const seen = new Set();
      for (const simOption of simAttr.options) {
        const simLabel = normalizeSimLabel(simOption.label);
        for (const storageOption of storageAttr.options) {
          const storageLabel = normalizeStorageLabel(storageOption.label);
          const key = `${storageLabel}|${simLabel}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const productId = storageOption.products.find((id) =>
            simOption.products.includes(id),
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
            source: "allsell",
          });
        }
      }
    } else {
      for (const storageOption of storageAttr.options) {
        const storageLabel = normalizeStorageLabel(storageOption.label);
        if (ramAttr && !isApple) {
          for (const ramOption of ramAttr.options) {
            const ramLabel = normalizeStorageLabel(ramOption.label);
            const productId = storageOption.products.find((id) =>
              ramOption.products.includes(id),
            );
            if (!productId || !optionPrices[productId]) continue;
            const cash_price =
              optionPrices[productId].finalPrice?.amount ?? null;
            const installment_price =
              optionPrices[productId].creditPrice?.amount ?? null;
            if (!cash_price) continue;

            const nameWithSim =
              tableSimSuffix && !baseName.toLowerCase().includes("sim")
                ? `${baseName} ${ramLabel}/${storageLabel}${tableSimSuffix}`
                : `${baseName} ${ramLabel}/${storageLabel}`;

            results.push({
              name: nameWithSim,
              cash_price,
              installment_price,
              source: "allsell",
            });
          }
        } else {
          const productId = storageOption.products[0];
          if (!productId || !optionPrices[productId]) continue;
          const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
          const installment_price =
            optionPrices[productId].creditPrice?.amount ?? null;
          if (!cash_price) continue;

          const nameWithSim =
            tableSimSuffix && !baseName.toLowerCase().includes("sim")
              ? `${baseName} ${storageLabel}${tableSimSuffix}`
              : `${baseName} ${storageLabel}`;

          results.push({
            name: nameWithSim,
            cash_price,
            installment_price,
            source: "allsell",
          });
        }
      }
    }

    return results.length > 0
      ? results
      : [parseSimpleProduct(baseName, html, "allsell")].filter(Boolean);
  } catch (err) {
    console.warn(`[${logTag}] Failed ${url}: ${err.message}`);
    return [];
  }
}

/**
 * Generic allsell category crawler.
 * @param {string[]} categoryUrls - one URL per brand/filter for this category
 * @param {string} logTag - e.g. "allsell-phones" or "allsell-tablets"
 * @param {object} opts - passed through to fetchProductVariants (e.g. isTablet)
 */
export async function crawlAllsellCategory(categoryUrls, logTag, opts = {}) {
  const allListingProducts = [];

  for (const categoryUrl of categoryUrls) {
    console.log(`[${logTag}] Fetching: ${categoryUrl}`);
    const { products: firstPage, totalPages } = await fetchListingPage(
      categoryUrl,
      1,
    );
    allListingProducts.push(...firstPage);
    console.log(
      `[${logTag}] Page 1: ${firstPage.length} products, total pages: ${totalPages}`,
    );

    for (let page = 2; page <= totalPages; page++) {
      const { products } = await fetchListingPage(categoryUrl, page);
      console.log(`[${logTag}] Page ${page}: ${products.length} products`);
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

  console.log(
    `[${logTag}] ${unique.length} unique products, fetching details...`,
  );

  const allProducts = [];

  for (let i = 0; i < unique.length; i++) {
    const { name: productName, url: productUrl } = unique[i];
    console.log(`[${logTag}] (${i + 1}/${unique.length}) ${productName}`);

    const variants = await fetchProductVariants(
      productName,
      productUrl,
      logTag,
      opts,
    );
    console.log(
      `[${logTag}]   -> ${variants.length} variants: ${variants.map((v) => v.name).join(", ")}`,
    );
    allProducts.push(...variants);

    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(
    `[${logTag}] RAW listing count before dedup: ${allListingProducts.length}`,
  );

  const seen = new Map();
  for (const p of allProducts) {
    if (!seen.has(p.name)) seen.set(p.name, p);
  }

  const result = [...seen.values()];
  console.log(`[${logTag}] Total unique products: ${result.length}`);
  return result;
}
