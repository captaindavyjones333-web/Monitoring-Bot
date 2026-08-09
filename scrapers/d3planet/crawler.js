import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";
import { getSimSuffixFromText } from "../../core/simClassifier.js";

const BASE_URL = "https://3dplanet.am";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

async function getTotalPages(listUrl) {
  const res = await axios.get(listUrl, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  let max = 1;
  $("#paginationWrapper a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/[?&]page=(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return max;
}

function buildPageUrl(listUrl, page) {
  if (page === 1) return listUrl;
  const sep = listUrl.includes("?") ? "&" : "?";
  return `${listUrl}${sep}page=${page}`;
}

async function fetchListingPage(listUrl, page) {
  const url = buildPageUrl(listUrl, page);
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);

  const products = [];
  $("h3").each((_, el) => {
    const name = $(el).text().trim();
    const detailUrl = $(el)
      .closest("div")
      .find("a[href*='/store/product/']")
      .first()
      .attr("href");
    if (name && detailUrl) {
      const fullUrl = detailUrl.startsWith("http")
        ? detailUrl
        : `${BASE_URL}${detailUrl}`;
      products.push({ name, url: fullUrl });
    }
  });

  return products;
}

function normalizeSim(label) {
  const l = label.toLowerCase();
  if (l.includes("+") || l.includes("nano") || /\d/.test(l.charAt(0))) {
    return "nanosim";
  }
  if (/e[\s-]?sim/i.test(l)) return "esim";
  if (/dual/i.test(l)) return "dualsim";
  return null;
}

function getSimSuffix(label) {
  const l = label.toLowerCase();
  if (l.includes("+") || l.includes("nano") || /\d/.test(l.charAt(0))) {
    return "Nano-Sim";
  }
  if (/e[\s-]?sim/i.test(l)) return "eSim";
  if (/dual/i.test(l)) return "Dual";
  return label;
}

async function getStaticRam(puppeteerPage) {
  try {
    const specItems = await puppeteerPage.$$eval(
      ".flex.items-center.gap-4",
      (els) =>
        els.map((el) => ({
          label:
            el.querySelector(".text-\\[\\#8C8C8C\\]")?.textContent?.trim() ||
            "",
          value: el.querySelector(".font-semibold")?.textContent?.trim() || "",
        })),
    );
    const ramSpec = specItems.find(
      (s) => s.label.includes("Օպերատիվ") || s.label.includes("RAM"),
    );
    return ramSpec?.value || null;
  } catch {
    return null;
  }
}

async function getStaticSim(puppeteerPage) {
  try {
    const specItems = await puppeteerPage.$$eval(
      ".flex.items-center.gap-4",
      (els) =>
        els.map((el) => ({
          label:
            el.querySelector(".text-\\[\\#8C8C8C\\]")?.textContent?.trim() ||
            "",
          value: el.querySelector(".font-semibold")?.textContent?.trim() || "",
        })),
    );
    const simSpec = specItems.find(
      (s) => s.label.includes("Քարտերի քանակ") || s.label.includes("SIM"),
    );
    return simSpec?.value || null;
  } catch {
    return null;
  }
}

function isDiagonalLabel(label) {
  return /^\d{1,2}(\.\d+)?["”]$/.test(label.trim());
}

async function clickButtonByLabel(puppeteerPage, selector, label) {
  await puppeteerPage.evaluate(
    (selector, label) => {
      const btns = document.querySelectorAll(selector);
      for (const btn of btns) {
        if (btn.textContent.trim() === label) {
          btn.click();
          break;
        }
      }
    },
    selector,
    label,
  );
}

// Reads modifier buttons grouped by their section heading (e.g. "Ընտրել
// Հիշողություն", "Ընտրել Էկրանի անկյունագիծ"), instead of one flat list —
// so diagonal, RAM, and SIM options don't get mixed together.
async function getModifierGroups(puppeteerPage) {
  return puppeteerPage.evaluate(() => {
    const groups = [];
    document.querySelectorAll(".mt-4").forEach((div) => {
      const h2 = div.querySelector("h2");
      if (!h2) return;
      const buttons = Array.from(
        div.querySelectorAll("button.modifier-btn:not([disabled])"),
      )
        .filter((b) => !b.getAttribute("data-color"))
        .map((b) => ({
          label: b.textContent.trim(),
          price: parseFloat(b.getAttribute("data-price")) || 0,
          loanPrice: parseFloat(b.getAttribute("data-loanprice")) || 0,
          selected: b.className.includes("bg-[#204ECF]"),
        }));
      if (buttons.length) {
        groups.push({ heading: h2.textContent.trim(), buttons });
      }
    });
    return groups;
  });
}

async function fetchProductVariants(puppeteerPage, baseName, url, logTag) {
  try {
    await puppeteerPage.goto(url, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1500));

    const storageButtons = await puppeteerPage.$$eval(
      "button.storage-btn:not([disabled])",
      (els) =>
        els
          .map((el) => ({
            label: el.textContent.trim(),
            price: parseFloat(el.getAttribute("data-price")) || null,
            loanPrice: parseFloat(el.getAttribute("data-loanprice")) || null,
          }))
          .filter((b) => b.label && b.price),
    );

    if (storageButtons.length === 0) {
      const price = await puppeteerPage
        .$eval(
          "button.storage-btn",
          (el) => parseFloat(el.getAttribute("data-price")) || null,
        )
        .catch(() => null);
      if (price) {
        let loanPrice = await puppeteerPage
          .$eval(
            "button.storage-btn",
            (el) => parseFloat(el.getAttribute("data-loanprice")) || null,
          )
          .catch(() => null);

        if (!loanPrice) {
          try {
            const modalBtn = await puppeteerPage.$("#openLoanModal");
            if (modalBtn) {
              await modalBtn.click();
              await new Promise((r) => setTimeout(r, 1000));
              loanPrice = await puppeteerPage
                .$eval("#loanPrice", (el) => parseFloat(el.value) || null)
                .catch(() => null);
            }
          } catch {
            loanPrice = null;
          }
        }

        return [
          {
            name: baseName,
            cash_price: price,
            installment_price: loanPrice,
            source: "3dplanet",
          },
        ];
      }
      return [];
    }

    const results = [];

    for (const storage of storageButtons) {
      await clickButtonByLabel(
        puppeteerPage,
        "button.storage-btn:not([disabled])",
        storage.label,
      );
      await new Promise((r) => setTimeout(r, 800));

      const groups = await getModifierGroups(puppeteerPage);
      const diagonalGroup = groups.find((g) =>
        g.heading.includes("անկյունագ"),
      );

      if (diagonalGroup && diagonalGroup.buttons.length > 0) {
        // Diagonal is its own dimension (iPad 11" vs 13"), and picking a
        // storage option resets it back to whatever's default — so we
        // click each diagonal option explicitly and re-read the DOM to
        // confirm it actually stuck before trusting its price.
        for (const diag of diagonalGroup.buttons) {
          await clickButtonByLabel(
            puppeteerPage,
            "button.modifier-btn:not([disabled])",
            diag.label,
          );
          await new Promise((r) => setTimeout(r, 600));

          const confirmedGroups = await getModifierGroups(puppeteerPage);
          const confirmedDiagonal = confirmedGroups
            .find((g) => g.heading.includes("անկյունագ"))
            ?.buttons.find((b) => b.label === diag.label);

          if (!confirmedDiagonal?.selected) {
            console.warn(
              `[${logTag}] "${diag.label}" didn't stay selected for ${baseName} ${storage.label}, skipping`,
            );
            continue;
          }

          const otherButtons = confirmedGroups
            .filter((g) => !g.heading.includes("անկյունագ"))
            .flatMap((g) => g.buttons);

          if (otherButtons.length === 0) {
            results.push({
              name: `${baseName} ${diag.label} ${storage.label}`
                .replace(/\s+/g, " ")
                .trim(),
              cash_price: confirmedDiagonal.price || storage.price,
              installment_price:
                confirmedDiagonal.loanPrice || storage.loanPrice || null,
              source: "3dplanet",
            });
            continue;
          }

          for (const mod of otherButtons) {
            const isRam = /^\d+gb$/i.test(mod.label.trim());
            const simType = normalizeSim(mod.label);

            const cash_price =
              mod.price || confirmedDiagonal.price || storage.price;
            const installment_price =
              mod.loanPrice ||
              confirmedDiagonal.loanPrice ||
              storage.loanPrice ||
              null;

            let name;
            if (isRam) {
              name = `${baseName} ${diag.label} ${mod.label.trim()}/${storage.label}`;
            } else if (simType) {
              name = `${baseName} ${diag.label} ${storage.label} (${getSimSuffix(mod.label.trim())})`;
            } else {
              name = `${baseName} ${diag.label} ${storage.label} ${mod.label.trim()}`;
            }

            results.push({
              name: name.replace(/\s+/g, " ").trim(),
              cash_price,
              installment_price,
              source: "3dplanet",
            });
          }
        }
        continue;
      }

      // No diagonal group on this product — original flat modifier logic.
      const modifiers = groups
        .filter((g) => !g.heading.includes("անկյունագ"))
        .flatMap((g) => g.buttons);

      if (modifiers.length === 0) {
        const staticRam = await getStaticRam(puppeteerPage);
        const staticSim = await getStaticSim(puppeteerPage);
        const simSuffix = getSimSuffixFromText(staticSim);
        const name = staticRam
          ? `${baseName} ${staticRam}/${storage.label}${simSuffix}`
          : `${baseName} ${storage.label}${simSuffix}`;
        results.push({
          name,
          cash_price: storage.price,
          installment_price: storage.loanPrice || null,
          source: "3dplanet",
        });
      } else {
        for (const mod of modifiers) {
          const simType = !isDiagonalLabel(mod.label) && normalizeSim(mod.label);
          const isRam = /^\d+gb$/i.test(mod.label.trim());

          const cash_price = mod.price || storage.price;
          const installment_price = mod.loanPrice || storage.loanPrice || null;

          let name;
          if (isRam) {
            name = `${baseName} ${mod.label.trim()}/${storage.label}`;
          } else if (simType) {
            name = `${baseName} ${storage.label} (${getSimSuffix(mod.label.trim())})`;
          } else {
            name = `${baseName} ${storage.label} ${mod.label.trim()}`;
          }

          results.push({
            name,
            cash_price,
            installment_price,
            source: "3dplanet",
          });
        }
      }
    }

    return results;
  } catch (err) {
    console.warn(`[${logTag}] Failed ${url}: ${err.message}`);
    return [];
  }
}

/**
 * Generic 3dplanet category crawler.
 * @param {string} listUrl - category listing URL
 * @param {string} logTag - e.g. "3d-phones" or "3d-tablets"
 */
export async function crawl3DPlanetCategory(listUrl, logTag) {
  const totalPages = await getTotalPages(listUrl);
  console.log(`[${logTag}] ${totalPages} pages`);

  const listingProducts = [];
  for (let page = 1; page <= totalPages; page++) {
    const products = await fetchListingPage(listUrl, page);
    console.log(`[${logTag}] Page ${page}: ${products.length} products`);
    listingProducts.push(...products);
    await new Promise((r) => setTimeout(r, 300));
  }

  const seenUrls = new Set();
  const unique = [];
  for (const p of listingProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      unique.push(p);
    }
  }

  console.log(
    `[${logTag}] ${unique.length} unique products, fetching details...`,
  );

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
  const puppeteerPage = await browser.newPage();
  await puppeteerPage.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  );

  const allProducts = [];

  try {
    for (let i = 0; i < unique.length; i++) {
      const { name, url } = unique[i];
      console.log(`[${logTag}] (${i + 1}/${unique.length}) ${name}`);
      const variants = await fetchProductVariants(
        puppeteerPage,
        name,
        url,
        logTag,
      );
      console.log(
        `[${logTag}]   -> ${variants.length} variants: ${variants.map((v) => v.name).join(", ")}`,
      );
      allProducts.push(...variants);
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    await browser.close();
  }

  const seen = new Map();
  for (const p of allProducts) {
    if (!seen.has(p.name)) seen.set(p.name, p);
  }

  const result = [...seen.values()];
  console.log(`[${logTag}] Total unique products: ${result.length}`);
  return result;
}
