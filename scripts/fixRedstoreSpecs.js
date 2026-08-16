import fs from 'fs';
import path from 'path';
import { parseScreenInches, parseRefreshRateHz } from '../core/specParsers.js';

const CACHE_PATH = path.join(process.cwd(), 'cache', 'notebooks', 'redstore.json');

function fixProductSpecs(product) {
  if (!product || typeof product !== 'object') return product;
  const specs = product.specs;
  if (!specs || typeof specs !== 'object') return product;

  if ('screen_inches' in specs) {
    specs.screen_inches = parseScreenInches(specs.screen_inches);
  }

  if ('refresh_rate_hz' in specs) {
    specs.refresh_rate_hz = parseRefreshRateHz(specs.refresh_rate_hz);
  }

  return product;
}

function main() {
  if (!fs.existsSync(CACHE_PATH)) {
    console.error(`Missing file: ${CACHE_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(CACHE_PATH, 'utf8');
  const products = JSON.parse(raw);

  if (!Array.isArray(products)) {
    console.error(`Expected an array in ${CACHE_PATH}`);
    process.exit(1);
  }

  let updatedCount = 0;
  for (const product of products) {
    const prevScreen = product?.specs?.screen_inches;
    const prevRefresh = product?.specs?.refresh_rate_hz;

    fixProductSpecs(product);

    if (
      product?.specs &&
      (product.specs.screen_inches !== prevScreen || product.specs.refresh_rate_hz !== prevRefresh)
    ) {
      updatedCount += 1;
    }
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(products, null, 2) + '\n', 'utf8');
  console.log(`Rewrote ${CACHE_PATH} with ${updatedCount} updated products.`);
}

main();
