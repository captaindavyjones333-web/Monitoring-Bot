// index.js
import http from "http";
import cron from "node-cron";
import { runScraping } from "./jobs/scrapeJob.js";
import { runSendJob, resetPreviousAlerts } from "./jobs/sendJob.js";
import { sendAlerts } from "./bot/bot.js";

// ─── Keep-alive HTTP server for Render free tier ──────────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running");
});
server.listen(process.env.PORT || 3000, () => {
  console.log(
    `[server] 🌐 Keep-alive server on port ${process.env.PORT || 3000}`,
  );
});

// ─── 06:00 AM — Scrape all sites ─────────────────────────────────────────────
cron.schedule(
  "0 6 * * *",
  async () => {
    console.log("[scheduler] ⏰ 06:00 — running scrape job");
    resetPreviousAlerts();
    await runScraping();
  },
  { timezone: "Asia/Yerevan" },
);

// ─── 09:00 AM — Send all alerts ──────────────────────────────────────────────
cron.schedule(
  "0 9 * * *",
  async () => {
    console.log("[scheduler] ⏰ 09:00 — sending all alerts");
    const alerts = await runSendJob(false, false);
    if (alerts.length === 0) {
      console.log("[scheduler] ✅ No alerts today");
      return;
    }
    console.log(`[scheduler] 📤 Sending ${alerts.length} alerts`);
    await sendAlerts(alerts);
  },
  { timezone: "Asia/Yerevan" },
);

// ─── Every hour 10:00–23:00 — Rescrape and send only new alerts ──────────────
cron.schedule(
  "0 10-23 * * *",
  async () => {
    const hour = new Date().toLocaleString("hy-AM", {
      timeZone: "Asia/Yerevan",
      hour: "numeric",
    });
    console.log(`[scheduler] ⏰ ${hour}:00 — hourly rescrape`);

    await runScraping();
    const newAlerts = await runSendJob(false, true);

    if (newAlerts.length === 0) {
      console.log("[scheduler] ✅ No new alerts this hour");
      return;
    }

    console.log(`[scheduler] 📤 Sending ${newAlerts.length} new alerts`);
    await sendAlerts(newAlerts);
  },
  { timezone: "Asia/Yerevan" },
);

console.log("[bot] 🤖 Bot started. Waiting for scheduled jobs...");
console.log("[bot] ⏰ Scrape: 06:00 | First send: 09:00 | Hourly: 10:00-23:00");
