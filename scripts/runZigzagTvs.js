import "../errorHandler.js";
import dotenv from "dotenv";
dotenv.config();

import { scrapeZigzagSpeakers } from "../scrapers/zigzag/speakers.js";

async function main() {
  const startedAt = Date.now();
  try {
    const results = await scrapeZigzagSpeakers();
    console.log(`\n✅ Done — ${results.length} products:`);
    results.forEach((p, i) =>
      console.log(`  ${i + 1}. [${p.cash_price}] ${p.name}`),
    );
  } catch (err) {
    console.error("❌ Failed:", err);
    process.exitCode = 1;
  } finally {
    const s = Math.round((Date.now() - startedAt) / 1000);
    console.log(`\nFinished in ${s}s`);
    process.exit(process.exitCode || 0);
  }
}

main();
