import cron from "node-cron";
import { runFullScraping } from "./scrapeJob.js";
import {
  runPriceWatchJob,
  sendCategoryNotificationsWithDelay,
} from "./priceWatchJob.js";

export function startScheduler(bot, getApprovedUserIds) {
  // 6:00 AM Yerevan time — scrape every category and run post-scrape pipeline.
  cron.schedule(
    "0 6 * * *",
    async () => {
      console.log("[scheduler] 🌅 6:00 AM full scrape starting...");
      try {
        await runFullScraping();
        console.log("[scheduler] ✅ 6:00 AM full scrape complete");
      } catch (err) {
        console.error("[scheduler] ❌ 6:00 AM scrape failed:", err.message);
      }
    },
    { timezone: "Asia/Yerevan" },
  );

  // ─── Price Watch: 09:30 & 13:30 Yerevan time ────────────────────────────────
  // Scrapes all categories, compares with previous snapshot, sends only changes.

  async function runPriceWatch(label) {
    console.log(`[scheduler] 👁️  ${label} price watch starting...`);
    const userIds = getApprovedUserIds();

    let result;
    try {
      result = await runPriceWatchJob();
    } catch (err) {
      console.error(`[scheduler] ❌ ${label} price watch failed:`, err.message);
      for (const userId of userIds) {
        await bot
          .sendMessage(userId, `❌ Price watch failed: ${err.message}`)
          .catch(() => {});
      }
      return;
    }

    const { categoriesWithChanges, totalChanges } = result || {};

    if (!categoriesWithChanges || categoriesWithChanges.length === 0) {
      console.log(`[scheduler] ✅ ${label} — no price changes detected`);
      for (const userId of userIds) {
        await bot
          .sendMessage(userId, `🕐 ${label} — Գնային փոփոխություններ չկան`)
          .catch(() => {});
      }
      return;
    }

    console.log(
      `[scheduler] 📊 ${label} — ${totalChanges} changes across ${categoriesWithChanges.length} categories with changes`,
    );

    for (const userId of userIds) {
      await bot
        .sendMessage(
          userId,
          `📊 ${label} — ${totalChanges} փոփոխություն (${categoriesWithChanges.length} կատեգորիա)`,
        )
        .catch(() => {});
    }

    await sendCategoryNotificationsWithDelay(
      bot,
      userIds,
      categoriesWithChanges,
      5 * 60 * 1000,
    );

    console.log(`[scheduler] ✅ ${label} price watch complete`);
  }

  // 09:10 AM Yerevan
  cron.schedule("10 9 * * *", () => runPriceWatch("09:10"), {
    timezone: "Asia/Yerevan",
  });

  // 13:30 PM Yerevan
  cron.schedule("30 13 * * *", () => runPriceWatch("13:30"), {
    timezone: "Asia/Yerevan",
  });

  // 15:42 PM Yerevan (for real test)
  cron.schedule("10 16 * * *", () => runPriceWatch("16:10"), {
    timezone: "Asia/Yerevan",
  });
}
