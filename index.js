import "./errorHandler.js";
import http from "http";
import { bot } from "./bot/bot.js";
import { startScheduler } from "./jobs/scheduler.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, "./data/users.json");

function getApprovedUserIds() {
  const adminId = process.env.ADMIN_ID;
  const userIds = new Set();
  if (adminId) userIds.add(adminId);

  if (fs.existsSync(USERS_FILE)) {
    try {
      const content = fs.readFileSync(USERS_FILE, "utf-8").trim();
      if (content) {
        const users = JSON.parse(content);
        for (const [id, u] of Object.entries(users)) {
          if (u?.approved) userIds.add(id);
        }
      }
    } catch {}
  }
  return Array.from(userIds);
}

// ─── Keep-alive HTTP server for Render free tier ──────────────────────────────
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is running");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`[server] 🌐 Listening on port ${PORT}`);
  });

// ─── Start Cron Scheduler ──────────────────────────────────────────────────────
startScheduler(bot, getApprovedUserIds);

console.log("[bot] 🤖 Bot started. Scheduler initialized.");
console.log("[bot] ⏰ Scheduled jobs: 06:00 (Full scrape) | 09:30 & 13:30 (Price Watch Diff)");

