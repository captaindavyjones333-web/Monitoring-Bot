import puppeteer from "rebrowser-puppeteer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(__dirname, "chrome-profile-test");
const TARGET_URL =
  "https://notebookmall.am/product-category/notebooks/plain/?query_type_brand=or&filter_brand=acer,asus,dell,hp,lenovo,msi,samsung";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isChallenge(page) {
  const title = (await page.title().catch(() => "")).toLowerCase();
  const bodyText = await page
    .evaluate(() => (document.body?.innerText || "").toLowerCase())
    .catch(() => "");

  return (
    title.includes("just a moment") ||
    title.includes("attention required") ||
    title.includes("please wait") ||
    bodyText.includes("verify you are human") ||
    bodyText.includes("checking your browser")
  );
}

async function tryClickTurnstile(page) {
  // Find the Turnstile frame
  const turnstileFrame = page.frames().find((f) => {
    const url = f.url() || "";
    return url.includes("challenges.cloudflare.com") || url.includes("turnstile");
  });

  if (!turnstileFrame) {
    console.log("  → No Turnstile frame found");
    return false;
  }

  console.log("  → Turnstile frame found");

  let iframeElement = null;
  try {
    iframeElement = await turnstileFrame.frameElement();
  } catch (e) {
    console.log("  → frameElement() failed:", e.message);
    return false;
  }

  if (!iframeElement) {
    console.log("  → Could not get iframe element");
    return false;
  }

  const box = await iframeElement.boundingBox();
  if (!box) {
    console.log("  → iframe has no bounding box");
    return false;
  }

  console.log(
    `  → iframe box: x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`
  );

  // Click roughly where the checkbox usually is
  const clickX = box.x + Math.min(box.width * 0.22, 40);
  const clickY = box.y + box.height * 0.5;

  await page.mouse.click(clickX, clickY, { delay: 80 });
  console.log(`  → clicked at (${Math.round(clickX)}, ${Math.round(clickY)})`);
  return true;
}

async function run() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  console.log("Launching browser (production mode)...");

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1366,768",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    defaultViewport: { width: 1366, height: 768 },
  });

  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  console.log("Navigating to target...");

  try {
    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("Initial title:", await page.title());
    console.log("Initial URL:", page.url());

    const maxWait = 50000;
    const start = Date.now();
    let attempts = 0;
    let cleared = false;

    while (Date.now() - start < maxWait) {
      const challenged = await isChallenge(page);

      if (!challenged) {
        cleared = true;
        console.log("\n✅ Challenge cleared!");
        console.log("Final title:", await page.title());
        break;
      }

      // Try clicking a few times
      if (attempts < 5) {
        attempts++;
        console.log(`\nChallenge still present — click attempt ${attempts}`);
        await tryClickTurnstile(page);
        await sleep(3000);
      } else {
        console.log("Still on challenge page... waiting");
        await sleep(2000);
      }
    }

    if (!cleared) {
      console.log("\n❌ Still stuck on Cloudflare challenge after timeout");
    }

    const screenshotPath = path.join(
      __dirname,
      cleared ? "success.png" : "challenge-failed.png"
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log("Screenshot saved as", path.basename(screenshotPath));
  } catch (err) {
    console.error("Error:", err.message);
  }

  await browser.close();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});