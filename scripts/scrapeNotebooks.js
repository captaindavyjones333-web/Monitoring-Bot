import "../errorHandler.js";
import dotenv from "dotenv";
dotenv.config();

import { runNotebooksScraping } from "../jobs/scrapeJob.js";

async function main() {
  const startedAt = Date.now();

  try {
    await runNotebooksScraping();
  } catch (err) {
    console.error("[scrape-notebooks] ❌ Unexpected failure:", err);
    process.exitCode = 1;
  } finally {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[scrape-notebooks] Finished in ${seconds}s`);
    process.exit(process.exitCode || 0);
  }
}

main();
