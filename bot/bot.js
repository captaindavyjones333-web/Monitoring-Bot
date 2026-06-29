// bot/bot.js
import TelegramBot from "node-telegram-bot-api";
import { runScraping } from "../jobs/scrapeJob.js";
import { runSendJob } from "../jobs/sendJob.js";
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!TOKEN) throw new Error("BOT_TOKEN is missing in .env");
if (!CHAT_ID) throw new Error("CHAT_ID is missing in .env");

export const bot = new TelegramBot(TOKEN, { polling: true });

// Show persistent keyboard on startup
bot
  .sendMessage(CHAT_ID, "🤖 Բոտը միացված է", {
    reply_markup: {
      keyboard: [[{ text: "🔍 Ստուգել հիմա" }]],
      resize_keyboard: true,
      persistent: true,
    },
  })
  .catch(() => {});

// Static persistent keyboard — always visible
const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: "🔍 Ստուգել հիմա" }]],
    resize_keyboard: true,
    persistent: true,
  },
};

// ─── Send alerts to Telegram ──────────────────────────────────────────────────

export async function sendAlerts(messages) {
  for (const msg of messages) {
    try {
      await bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[bot] ❌ Failed to send message:", err.message);
    }
  }
}

// ─── /start command ───────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "👋 Բարև! Ես գների մոնիտորինգի բոտն եմ.\n\n" +
      "Ամեն օր ժամը *06:00*-ին ստուգում եմ բոլոր կայքերը,\n" +
      "ժամը *09:00*-ից ուղարկում եմ գնային անհամապատասխանությունները.\n\n" +
      "Սեղմեք կոճակը՝ հիմա ստուգելու համար ⬇️",
    {
      parse_mode: "Markdown",
      ...MAIN_KEYBOARD,
    },
  );
});

// ─── Manual check — static keyboard button ───────────────────────────────────

bot.on("message", async (msg) => {
  if (msg.text !== "🔍 Ստուգել հիմա") return;

  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    "🔄 Սկանավորում եմ բոլոր կայքերը, խնդրում եմ սպասել...",
    MAIN_KEYBOARD,
  );

  try {
    // Scrape fresh data
    await runScraping();

    // Compare and get all alerts
    const alerts = await runSendJob(false, false);

    if (alerts.length === 0) {
      await bot.sendMessage(
        chatId,
        "✅ Գնային անհամապատասխանություններ չկան",
        MAIN_KEYBOARD,
      );
      return;
    }

    await bot.sendMessage(
      chatId,
      `🚨 Հայտնաբերվել է ${alerts.length} անհամապատասխանություն`,
      MAIN_KEYBOARD,
    );
    for (const msg of alerts) {
      await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    }
  } catch (err) {
    console.error("[bot] ❌ Manual check failed:", err.message);
    await bot.sendMessage(
      chatId,
      "❌ Սխալ տեղի ունեցավ: " + err.message,
      MAIN_KEYBOARD,
    );
  }
});

console.log("[bot] ✅ Telegram bot initialized");
