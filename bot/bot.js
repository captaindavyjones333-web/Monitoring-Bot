import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  runScraping,
  runWatchesScraping,
  runHeadphonesScraping,
  runMacbooksScraping,
  runSpeakersScraping,
  runTvsScraping,
  runDysonScraping,
} from "../jobs/scrapeJob.js";
import { runSendJob } from "../jobs/sendJob.js";
import { loadAllCaches } from "../core/cache_manager.js";
import { groupByNormalizedName } from "../core/normalizer.js";
// import { buildComparisons, getAlertMessages } from "../core/comparator.js";
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, "../data/users.json");

const TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ADMIN_ID = process.env.ADMIN_ID;

if (!TOKEN) throw new Error("BOT_TOKEN is missing in .env");
if (!CHAT_ID) throw new Error("CHAT_ID is missing in .env");
if (!ADMIN_ID) throw new Error("ADMIN_ID is missing in .env");

export const bot = new TelegramBot(TOKEN, { polling: true });

// ─── Users storage ────────────────────────────────────────────────────────────

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    const content = fs.readFileSync(USERS_FILE, "utf-8").trim();
    if (!content) return {};
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function saveUsers(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function isApproved(userId) {
  const users = loadUsers();
  return (
    String(userId) === String(ADMIN_ID) ||
    users[String(userId)]?.approved === true
  );
}

function isAdmin(userId) {
  return String(userId) === String(ADMIN_ID);
}

// ─── Keyboards ────────────────────────────────────────────────────────────────

const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: "💰 Արագ ստուգում" }, { text: "🔄 Լրիվ սկանավորում" }],
      [{ text: "⌚ Ժամացույցներ" }, { text: "🎧 Ականջակալներ" }],
      [{ text: "👥 Օգտատերեր" }],
      [{ text: "💻 Macbook" }],
      [{ text: "🔊 Բարձրախոսներ" }],
      [{ text: "📺 Հեռուստացույցներ" }],
      [{ text: "🌀 Dyson" }],
    ],
    resize_keyboard: true,
    persistent: true,
  },
};

const USER_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: "💰 Արագ ստուգում" }, { text: "🔄 Լրիվ սկանավորում" }],
      [{ text: "⌚ Ժամացույցներ" }, { text: "🎧 Ականջակալներ" }],
      [{ text: "💻 Macbook" }],
      [{ text: "🔊 Բարձրախոսներ" }],
      [{ text: "📺 Հեռուստացույցներ" }],
      [{ text: "🌀 Dyson" }],
    ],
    resize_keyboard: true,
    persistent: true,
  },
};

// ─── Send alerts ──────────────────────────────────────────────────────────────

export async function sendAlerts(messages) {
  for (const msg of messages) {
    try {
      await bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[bot] ❌ Failed to send message:", err.message);
    }
  }
  // Re-show keyboard after alerts
  await bot.sendMessage(CHAT_ID, "—", MAIN_KEYBOARD).catch(() => {});
}

// ─── Cash prices quick scan ───────────────────────────────────────────────────

async function sendCashData(chatId) {
  const allProducts = loadAllCaches();
  if (allProducts.length === 0) {
    await bot.sendMessage(
      chatId,
      "⚠️ Քեշ չկա: Նախ կատարեք լրիվ սկանավորում:",
      USER_KEYBOARD,
    );
    return;
  }

  const groups = groupByNormalizedName(allProducts);
  const comparisons = buildComparisons(groups);
  const alertMessages = getAlertMessages(comparisons);

  if (alertMessages.length === 0) {
    await bot.sendMessage(
      chatId,
      "✅ Գնային անհամապատասխանություններ չկան",
      USER_KEYBOARD,
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    `💰 ${alertMessages.length} ապրանք`,
    USER_KEYBOARD,
  );
  for (const msg of alertMessages) {
    await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  }
}

// ─── /start ───────────────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const userId = String(msg.chat.id);
  const username = msg.from?.username || msg.from?.first_name || "Unknown";

  if (isAdmin(userId)) {
    await bot.sendMessage(
      userId,
      "👋 Բարև Admin!\n\nԿառավարեք բոտը ստորև կոճակներով:",
      MAIN_KEYBOARD,
    );
    return;
  }

  if (isApproved(userId)) {
    await bot.sendMessage(
      userId,
      "👋 Բարև! Ձեր հասանելիությունը հաստատված է:",
      USER_KEYBOARD,
    );
    return;
  }

  // New user — notify admin
  const users = loadUsers();
  if (!users[userId]) {
    users[userId] = {
      approved: false,
      username,
      requestedAt: new Date().toISOString(),
    };
    saveUsers(users);
  }

  await bot.sendMessage(
    userId,
    "⏳ Ձեր հայտն ուղարկված է: Սպասեք ադմինի հաստատմանը:",
  );

  // Notify admin
  await bot.sendMessage(
    ADMIN_ID,
    `🔔 Նոր հայտ:\nՕգտատեր: @${username}\nID: ${userId}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Հաստատել", callback_data: `approve_${userId}` },
            { text: "❌ Մերժել", callback_data: `reject_${userId}` },
          ],
        ],
      },
    },
  );
});

// ─── Admin approve/reject ─────────────────────────────────────────────────────

bot.on("callback_query", async (query) => {
  const adminId = String(query.from.id);
  if (!isAdmin(adminId)) return;

  const data = query.data;

  if (data.startsWith("approve_")) {
    const userId = data.replace("approve_", "");
    const users = loadUsers();
    if (users[userId]) {
      users[userId].approved = true;
      saveUsers(users);
    }
    await bot.answerCallbackQuery(query.id, { text: "✅ Հաստատված" });
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      },
    );
    await bot.sendMessage(
      userId,
      "✅ Ձեր հայտը հաստատվել է: Կարող եք օգտվել բոտից:",
      USER_KEYBOARD,
    );
    await bot.sendMessage(adminId, `✅ Օգտատեր ${userId} հաստատված է:`);
  }

  if (data.startsWith("reject_")) {
    const userId = data.replace("reject_", "");
    const users = loadUsers();
    if (users[userId]) {
      users[userId].approved = false;
      saveUsers(users);
    }
    await bot.answerCallbackQuery(query.id, { text: "❌ Մերժված" });
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      },
    );
    await bot.sendMessage(userId, "❌ Ձեր հայտը մերժվել է:");
    await bot.sendMessage(adminId, `❌ Օգտատեր ${userId} մերժված է:`);
  }

  if (data.startsWith("remove_")) {
    const userId = data.replace("remove_", "");
    const users = loadUsers();
    if (users[userId]) {
      users[userId].approved = false;
      saveUsers(users);
    }
    await bot.answerCallbackQuery(query.id, { text: "🗑️ Հեռացված" });
    await bot.sendMessage(adminId, `🗑️ Օգտատեր ${userId} հեռացված է:`);
    await bot.sendMessage(userId, "❌ Ձեր հասանելիությունը հեռացվել է:");
    // Refresh users list
    await showUsersList(adminId);
  }
});

// ─── Users list ───────────────────────────────────────────────────────────────

async function showUsersList(chatId) {
  const users = loadUsers();
  const entries = Object.entries(users);

  if (entries.length === 0) {
    await bot.sendMessage(chatId, "👥 Օգտատերեր չկան:", MAIN_KEYBOARD);
    return;
  }

  const approved = entries.filter(([, u]) => u.approved);
  const pending = entries.filter(([, u]) => !u.approved);

  let text = "👥 *Օգտատերեր*\n\n";

  if (approved.length > 0) {
    text += "✅ *Հաստատված:*\n";
    approved.forEach(([id, u]) => {
      text += `• @${u.username} (${id})\n`;
    });
  }

  if (pending.length > 0) {
    text += "\n⏳ *Սպասող:*\n";
    pending.forEach(([id, u]) => {
      text += `• @${u.username} (${id})\n`;
    });
  }

  const keyboard = approved.map(([id, u]) => [
    {
      text: `🗑️ Հեռացնել @${u.username}`,
      callback_data: `remove_${id}`,
    },
  ]);

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard },
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  const userId = String(msg.chat.id);
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  // Admin only
  if (text === "👥 Օգտատերեր") {
    if (!isAdmin(userId)) return;
    await showUsersList(userId);
    return;
  }

  // Check access for scan buttons
  if (!isApproved(userId)) {
    await bot.sendMessage(
      userId,
      "⛔ Դուք հասանելիություն չունեք: Ուղարկեք /start հայտ ներկայացնելու համար:",
    );
    return;
  }

  if (text === "💰 Արագ ստուգում") {
    await bot.sendMessage(userId, "💰 Բեռնում եմ վերջին տվյալները...");
    await sendCashData(userId);
    return;
  }

  if (text === "🔄 Լրիվ սկանավորում") {
    await bot.sendMessage(
      userId,
      "🔄 Սկանավորում եմ բոլոր կայքերը, խնդրում եմ սպասել...",
    );
    try {
      await runScraping();
      const { phones, tablets } = await runSendJob(false, false);
      const total = phones.length + tablets.length;

      if (total === 0) {
        await bot.sendMessage(
          userId,
          "✅ Գնային անհամապատասխանություններ չկան",
          USER_KEYBOARD,
        );
        return;
      }

      await bot.sendMessage(
        userId,
        `🚨 ${total} անհամապատասխանություն հայտնաբերվել է`,
        USER_KEYBOARD,
      );

      if (phones.length > 0) {
        await bot.sendMessage(userId, "📱 *Հեռախոսներ*", {
          parse_mode: "Markdown",
        });
        await sendAlerts(phones);
      }
      if (tablets.length > 0) {
        await bot.sendMessage(userId, "💻 *Պլանշետներ*", {
          parse_mode: "Markdown",
        });
        await sendAlerts(tablets);
      }
    } catch (err) {
      console.error("[bot] ❌ Full scan failed:", err.message);
      await bot.sendMessage(userId, "❌ Սխալ: " + err.message, USER_KEYBOARD);
    }
    return;
  }

  if (text === "⌚ Ժամացույցներ") {
    await bot.sendMessage(
      userId,
      "⌚ Սկանավորում եմ ժամացույցները, խնդրում եմ սպասել...",
    );
    try {
      await runWatchesScraping();
      const { watches } = await runSendJob(false, false);

      if (watches.length === 0) {
        await bot.sendMessage(
          userId,
          "✅ Ժամացույցների գներում անհամապատասխանություններ չկան",
          USER_KEYBOARD,
        );
        return;
      }

      await bot.sendMessage(
        userId,
        `🚨 ${watches.length} անհամապատասխանություն հայտնաբերվել է`,
        USER_KEYBOARD,
      );
      await sendAlerts(watches);
    } catch (err) {
      console.error("[bot] ❌ Watches scan failed:", err.message);
      await bot.sendMessage(userId, "❌ Սխալ: " + err.message, USER_KEYBOARD);
    }
    return;
  }

  if (text === "🎧 Ականջակալներ") {
    await bot.sendMessage(
      userId,
      "🎧 Սկանավորում եմ ականջակալները, խնդրում եմ սպասել...",
    );
    try {
      await runHeadphonesScraping();
      const { headphones } = await runSendJob(false, false);

      if (headphones.length === 0) {
        await bot.sendMessage(
          userId,
          "✅ Ականջակալների գներում անհամապատասխանություններ չկան",
          USER_KEYBOARD,
        );
        return;
      }

      await bot.sendMessage(
        userId,
        `🚨 ${headphones.length} անհամապատասխանություն հայտնաբերվել է`,
        USER_KEYBOARD,
      );
      await sendAlerts(headphones);
    } catch (err) {
      console.error("[bot] ❌ Headphones scan failed:", err.message);
      await bot.sendMessage(userId, "❌ Սխալ: " + err.message, USER_KEYBOARD);
    }
    return;
  }

  if (text === "💻 Macbook") {
    await bot.sendMessage(
      userId,
      "💻 Սկանավորում եմ MacBook-երը, խնդրում եմ սպասել...",
    );
    try {
      await runMacbooksScraping();
      const { macbooks } = await runSendJob(false, false);
      if (macbooks.length === 0) {
        await bot.sendMessage(
          userId,
          "✅ MacBook-երի գներում անհամապատասխանություններ չկան",
          USER_KEYBOARD,
        );
        return;
      }

      await bot.sendMessage(
        userId,
        `🚨 ${macbooks.length} անհամապատասխանություն հայտնաբերվել է`,
        USER_KEYBOARD,
      );
      await sendAlerts(macbooks);
    } catch (err) {
      console.error("[bot] ❌ Macbooks scan failed:", err.message);
      await bot.sendMessage(userId, "❌ Սխալ: " + err.message, USER_KEYBOARD);
    }
    return;
  }

  if (text === "🔊 Բարձրախոսներ") {
    await bot.sendMessage(
      userId,
      "🔊 Սկանավորում եմ բարձրախոսները, խնդրում եմ սպասել...",
    );
    try {
      await runSpeakersScraping();
      const { speakers } = await runSendJob(false, false);

      if (speakers.length === 0) {
        await bot.sendMessage(
          userId,
          "✅ Բարձրախոսների գներում անհամապատասխանություններ չկան",
          USER_KEYBOARD,
        );
        return;
      }

      await bot.sendMessage(
        userId,
        `🚨 ${speakers.length} անհամապատասխանություն հայտնաբերվել է`,
        USER_KEYBOARD,
      );
      await sendAlerts(speakers);
    } catch (err) {
      console.error("[bot] ❌ Speakers scan failed:", err.message);
      await bot.sendMessage(userId, "❌ Սխալ: " + err.message, USER_KEYBOARD);
    }
    return;
  }

  if (text === "📺 Հեռուստացույցներ") {
    await bot.sendMessage(
      userId,
      "📺 Սկանավորում եմ հեռուստացույցները, խնդրում եմ սպասել...",
    );
    try {
      await runTvsScraping();
      const { tvs } = await runSendJob(false, false);

      if (tvs.length === 0) {
        await bot.sendMessage(
          userId,
          "✅ Հեռուստացույցների գներում անհամապատասխանություններ չկան",
          USER_KEYBOARD,
        );
        return;
      }

      await bot.sendMessage(
        userId,
        `🚨 ${tvs.length} անհամապատասխանություն հայտնաբերվել է`,
        USER_KEYBOARD,
      );
      await sendAlerts(tvs);
    } catch (err) {
      console.error("[bot] ❌ TVs scan failed:", err.message);
      await bot.sendMessage(userId, "❌ Սխալ: " + err.message, USER_KEYBOARD);
    }
    return;
  }

  if (text === "🌀 Dyson") {
    await bot.sendMessage(
      userId,
      "🌀 Սկանավորում եմ Dyson-ը, խնդրում եմ սպասել...",
    );
    try {
      await runDysonScraping();
      const { dyson } = await runSendJob(false, false);

      if (dyson.length === 0) {
        await bot.sendMessage(
          userId,
          "✅ Dyson-ի գներում անհամապատասխանություններ չկան",
          USER_KEYBOARD,
        );
        return;
      }

      await bot.sendMessage(
        userId,
        `🚨 ${dyson.length} անհամապատասխանություն հայտնաբերվել է`,
        USER_KEYBOARD,
      );
      await sendAlerts(dyson);
    } catch (err) {
      console.error("[bot] ❌ Dyson scan failed:", err.message);
      await bot.sendMessage(userId, "❌ Սխալ: " + err.message, USER_KEYBOARD);
    }
    return;
  }
});

// Show persistent keyboard on startup
bot.sendMessage(CHAT_ID, "🤖 Բոտը միացված է", MAIN_KEYBOARD).catch(() => {});

console.log("[bot] ✅ Telegram bot initialized");
