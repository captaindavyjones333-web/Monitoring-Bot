import cron from "node-cron";
import { runScraping } from "./scrapeJob.js";
import { runWatchesScraping, runHeadphonesScraping, runSpeakersScraping, runTvsScraping, runMacbooksScraping, runDysonScraping, runGamingScraping } from "./scrapeJob.js";

export function startScheduler(bot, getApprovedUserIds) {
  // 6:00 AM Yerevan time — scrape every category, sequentially to avoid
  // overloading Puppeteer/Cloudflare-challenge sites simultaneously.
  cron.schedule(
    "0 6 * * *",
    async () => {
      console.log("[scheduler] 🌅 6:00 AM full scrape starting...");
      try {
        await runScraping();
        await runWatchesScraping();
        await runHeadphonesScraping();
        await runSpeakersScraping();
        await runTvsScraping();
        await runMacbooksScraping();
        await runDysonScraping();
        await runGamingScraping();
        console.log("[scheduler] ✅ 6:00 AM full scrape complete");
      } catch (err) {
        console.error("[scheduler] ❌ 6:00 AM scrape failed:", err.message);
      }
    },
    { timezone: "Asia/Yerevan" },
  );

  // 9:00 AM Yerevan time — reminder to every approved user.
  cron.schedule(
    "0 9 * * *",
    async () => {
      console.log("[scheduler] 📨 9:00 AM reminder starting...");
      const userIds = getApprovedUserIds();
      for (const userId of userIds) {
        await bot
          .sendMessage(userId, "👋 Բարև, ստուգեք ապրանքների գները այսօր:")
          .catch((err) => console.error(`[scheduler] Failed to message ${userId}: ${err.message}`));
      }
      console.log(`[scheduler] ✅ Reminder sent to ${userIds.length} users`);
    },
    { timezone: "Asia/Yerevan" },
  );
}