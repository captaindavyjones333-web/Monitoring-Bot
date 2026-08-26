import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchAllBrands } from "./client.js";
import {
  mapAttributes,
  detectBrand,
  BRAND_IDS,
} from "../../core/notebookAttributes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CATEGORY_ENDPOINT = "notebooks";
const STORE = "redstore.am";
const CACHE_DIR = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "cache",
  "notebooks",
);

/**
 * normalize() is called per raw product by fetchAllBrands(). It does NOT
 * know which brand batch the product came from, so brand is re-detected
 * from the product itself (name match / Brand attribute).
 *
 * Returns { raw, normalized } pairs so we can persist both without a
 * second pass over the API.
 */
function normalize(raw) {
  if (!raw?.id || !raw?.name) {
    throw new Error(
      `missing id/name on product: ${JSON.stringify(raw).slice(0, 120)}`,
    );
  }

  const specs = mapAttributes(raw.attributes);
  const brand = detectBrand(raw.name, raw.attributes);
  console.log(raw)
  return {
    raw,
    normalized: {
      id: raw.id,
      store: STORE,
      name: raw.name,
      brand,
      price: Number(raw.cash_price) || null,
      installment_price: Number(raw.installment_price) || null,
      url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
      specs,
      category: "notebooks",
      scraped_at: new Date().toISOString(),
    },
  };
}

export async function scrapeRedstoreNotebooks() {
  const pairs = await fetchAllBrands(CATEGORY_ENDPOINT, BRAND_IDS, normalize, {
    lang: "en",
  });

  const rawOut = pairs.map((p) => p.raw);
  const normalizedOut = pairs.map((p) => p.normalized);

  const noBrand = normalizedOut.filter((p) => !p.brand).length;
  if (noBrand > 0) {
    console.warn(
      `[redstore/notebooks] ${noBrand} product(s) had no brand detected — check name matching`,
    );
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, "redstore.raw.json"),
    JSON.stringify(rawOut, null, 2),
  );
  fs.writeFileSync(
    path.join(CACHE_DIR, "redstore.json"),
    JSON.stringify(normalizedOut, null, 2),
  );

  console.log(
    `[redstore/notebooks] done — ${normalizedOut.length} products saved to ${CACHE_DIR}`,
  );

  return normalizedOut;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  scrapeRedstoreNotebooks().catch((err) => {
    console.error("[redstore/notebooks] fatal error:", err);
    process.exit(1);
  });
}
