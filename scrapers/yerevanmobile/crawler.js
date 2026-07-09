import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.yerevanmobile.am";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hy-AM,hy;q=0.9,en-US;q=0.8,en;q=0.7",
};

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

function extractStaticAttributeValue($, attributeCode, typeBlockLabel) {
  // 1. Single-option attributes still render their swatch container,
  //    even though Magento omits them from the JS "attributes" JSON
  //    (nothing to select between). Read it directly from the DOM.
  const container = $(`.swatch-attribute.${attributeCode}`).first();
  if (container.length) {
    const option = container.find(".swatch-option").first();
    const label = option.attr("data-option-label") || option.text().trim();
    if (label) return label;
  }

  // 2. Fall back to the static specifications list (used for SIM type,
  //    and possibly some products that don't render a swatch at all).
  if (typeBlockLabel) {
    let value = null;
    $("li").each((_, el) => {
      const $li = $(el);
      const label = $li.find(".type_block").first().text().trim();
      if (label === typeBlockLabel) {
        value = $li.find(".result_block").first().text().trim();
      }
    });
    if (value) return value;
  }

  return null;
}

function buildStaticStorageSuffix($) {
  const staticStorage = extractStaticAttributeValue(
    $,
    "memory",
    "Հիշողություն",
  );
  const staticRam = extractStaticAttributeValue($, "gb_ram", "ՕՀ");

  if (!staticStorage) return null;

  const storageLabel = staticStorage.replace(/\s+/g, "");
  const ramLabel = staticRam ? staticRam.replace(/\s+/g, "") : null;

  return ramLabel ? `${ramLabel}/${storageLabel}` : storageLabel;
}

function getStaticSimSuffix(simText) {
  if (!simText) return "";
  const s = simText.toLowerCase();
  if (s.includes("esim") && s.includes("nano")) return " Nano-Sim";
  if (s.includes("esim")) return " Dual eSim";
  if (/nano[\s-]?sim\s*\+\s*nano[\s-]?sim/.test(s)) return " Dual-Sim";
  return "";
}

function parseSimpleProduct(baseName, html, source) {
  const $ = cheerio.load(html);
  const cashRaw = $("[data-price-type='finalPrice']")
    .first()
    .attr("data-price-amount");
  const cash_price = cashRaw ? parseInt(cashRaw, 10) : null;
  if (!cash_price) return null;

  const loanRaw = $("button.loan_price").first().attr("data-price");
  const installment_price = loanRaw ? Math.round(parseFloat(loanRaw)) : null;

  return { name: baseName, cash_price, installment_price, source };
}

async function fetchProductVariants(baseName, url, logTag) {
  try {
    const res = await axios
      .get(url, {
        headers: HEADERS,
        timeout: 15000,
        signal: AbortSignal.timeout(15000),
      })
      .catch((err) => {
        throw new Error(`fetch failed: ${err.message}`);
      });
    const html = res.data;

    const attrStart = html.indexOf('"attributes"');
    const optionStart = html.indexOf('"optionPrices"');
    const priceFormatStart = html.indexOf('"priceFormat"');

    if (attrStart === -1 || optionStart === -1 || priceFormatStart === -1) {
      return [parseSimpleProduct(baseName, html, "yerevanmobile")].filter(
        Boolean,
      );
    }

    let optionPrices;
    try {
      const optionChunk = html.slice(optionStart, priceFormatStart);
      const jsonStr = optionChunk
        .replace(/^"optionPrices"\s*:\s*/, "")
        .replace(/,\s*$/, "");
      optionPrices = JSON.parse(jsonStr);
    } catch (e) {
      return [parseSimpleProduct(baseName, html, "yerevanmobile")].filter(
        Boolean,
      );
    }

    let attributes;
    try {
      const attrChunk = html.slice(attrStart, optionStart);
      let jsonStr = attrChunk.replace(/^"attributes"\s*:\s*/, "");

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
    } catch (e) {
      return [parseSimpleProduct(baseName, html, "yerevanmobile")].filter(
        Boolean,
      );
    }

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

    const memoryAttr = Object.values(attributes).find(
      (a) => a.code === "memory",
    );
    const ramAttr = Object.values(attributes).find((a) => a.code === "gb_ram");
    const simAttr = Object.values(attributes).find(
      (a) => a.code === "sim_qard_quantity",
    );

    if (!memoryAttr) {
      // No selectable storage swatch — try the static spec table instead
      // of giving up, same idea as the SIM static-text fallback below.
      const staticSuffix = buildStaticStorageSuffix($html);
      const staticSimSuffix = !simAttr
        ? getStaticSimSuffix(extractStaticSimLabel($html))
        : "";

      const simple = parseSimpleProduct(baseName, html, "yerevanmobile");
      if (!simple) return [];

      if (staticSuffix) {
        return [
          {
            ...simple,
            name: `${baseName} ${staticSuffix}${staticSimSuffix}`,
          },
        ];
      }

      return [simple];
    }

    const staticSimSuffix = !simAttr
      ? getStaticSimSuffix(extractStaticSimLabel($html))
      : "";

    const results = [];

    for (const storageOption of memoryAttr.options) {
      const storageLabel = storageOption.label.replace(/\s+/g, "");

      if (ramAttr) {
        for (const ramOption of ramAttr.options) {
          const ramLabel = ramOption.label.replace(/\s+/g, "");
          const productId = storageOption.products.find(
            (id) =>
              ramOption.products.includes(id) && !disabledProductIds.has(id),
          );
          if (!productId || !optionPrices[productId]) continue;

          const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
          const installment_price =
            optionPrices[productId].creditPrice?.amount ?? null;
          if (!cash_price) continue;

          results.push({
            name: `${baseName} ${ramLabel}/${storageLabel}${staticSimSuffix}`,
            cash_price,
            installment_price,
            source: "yerevanmobile",
          });
        }
      } else {
        const productId = storageOption.products.find(
          (id) => !disabledProductIds.has(id),
        );
        if (!productId || !optionPrices[productId]) continue;

        const cash_price = optionPrices[productId].finalPrice?.amount ?? null;
        const installment_price =
          optionPrices[productId].creditPrice?.amount ?? null;
        if (!cash_price) continue;

        results.push({
          name: `${baseName} ${storageLabel}${staticSimSuffix}`,
          cash_price,
          installment_price,
          source: "yerevanmobile",
        });
      }
    }

    if (simAttr && memoryAttr) {
      const swatchResults = [];
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

          swatchResults.push({
            name: `${baseName} ${storageLabel} (${simLabel})`,
            cash_price,
            installment_price,
            source: "yerevanmobile",
          });
        }
      }
      return swatchResults.length > 0
        ? swatchResults
        : [parseSimpleProduct(baseName, html, "yerevanmobile")].filter(Boolean);
    }

    return results.length > 0
      ? results
      : [parseSimpleProduct(baseName, html, "yerevanmobile")].filter(Boolean);
  } catch (err) {
    console.warn(`[${logTag}] Warning: ${url}: ${err.message}`);
    return [];
  }
}

/**
 * Generic yerevanmobile category crawler.
 * @param {string} listUrlBase - category listing URL (without &p= page param)
 * @param {string} logTag - short tag for logs, e.g. "ym-phones" or "ym-tablets"
 * @param {Array<{name:string,url:string}>} manualUrls - extra URLs to force-include
 */
export async function crawlYerevanMobileCategory(
  listUrlBase,
  logTag,
  manualUrls = [],
) {
  const listingProducts = [];
  let page = 1;

  while (true) {
    const pageUrl = page === 1 ? listUrlBase : `${listUrlBase}&p=${page}`;
    const res = await axios.get(pageUrl, { headers: HEADERS });
    const $ = cheerio.load(res.data);

    const pageProducts = extractListingProducts($);
    console.log(`[${logTag}] Page ${page}: ${pageProducts.length} products`);

    if (pageProducts.length === 0) break;

    listingProducts.push(...pageProducts);

    const hasNextPage =
      $("a.action.next").length > 0 && !$("a.action.next").hasClass("inactive");

    if (!hasNextPage) break;

    page++;
    await new Promise((r) => setTimeout(r, 500));
  }

  for (const manual of manualUrls) {
    if (!listingProducts.find((p) => p.url === manual.url)) {
      listingProducts.push(manual);
      console.log(`[${logTag}] Added manual: ${manual.name}`);
    }
  }

  const allProducts = [];

  for (let i = 0; i < listingProducts.length; i++) {
    const { name, url } = listingProducts[i];
    console.log(`[${logTag}] (${i + 1}/${listingProducts.length}) ${name}`);

    const variants = await fetchProductVariants(name, url, logTag);
    allProducts.push(...variants);

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[${logTag}] Total variants: ${allProducts.length}`);
  return allProducts;
}
