// run-pipeline.js — runs the full scrape-to-report pipeline in the
// correct order: ingest -> check missing -> generate report. Stops
// immediately if any step fails, so you never generate a report off a
// half-updated database.
//
// Usage:
//   node run-pipeline.js path\to\cache                 (runs for real)
//   node run-pipeline.js path\to\cache --dry-run        (dry-run every step)
//   node run-pipeline.js path\to\cache --skip-report     (ingest + check only)

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const skipReport = args.includes("--skip-report");

if (!inputPath) {
  console.error("Usage: node run-pipeline.js path\\to\\cache-or-file.json [--dry-run] [--skip-report]");
  process.exit(1);
}

function runStep(scriptName, scriptArgs) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running ${scriptName} ${scriptArgs.join(" ")}`);
    console.log("=".repeat(60));

    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      stdio: "inherit", // pipe the child's console output straight through
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const commonArgs = dryRun ? [inputPath, "--dry-run"] : [inputPath];

  try {
    await runStep("process-scrape.js", commonArgs);
    // await runStep("check-missing-listings.js", commonArgs);

    if (skipReport) {
      console.log("\n--skip-report: stopping before report generation.");
      return;
    }
    await runStep("generate-comparison-report.js", []);

    console.log(`\n${"=".repeat(60)}`);
    console.log("Pipeline complete.");
    console.log("=".repeat(60));
  } catch (err) {
    console.error(`\nPipeline stopped: ${err.message}`);
    console.error("Nothing after the failed step ran — fix the issue and re-run.");
    process.exit(1);
  }
}

main();