import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runFullScraping } from "../jobs/scrapeJob.js";
import { runSendJob } from "../jobs/sendJob.js";
import {
  runDbComparison,
  getDbComparisonGrouped,
} from "../migration/generate-comparison-report.js";
import { loadAllCaches } from "../core/cache_manager.js";
import { groupByNormalizedName } from "../core/normalizer.js";
import {
  CATEGORY_CONFIG,
  buildCategoryMenu,
  buildComparisonMainMenu,
  getCategoryMenuText,
  getMainMenuText,
  filterMessagesByBrand,
} from "../core/categoryMenu.js";
import { searchProducts } from "../core/search.js";
import dotenv from "dotenv";

dotenv.config();
const awaitingSearch = new Set();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, "../data/users.json");

const TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ADMIN_ID = process.env.ADMIN_ID;

if (!TOKEN) throw new Error("BOT_TOKEN is missing in .env");
if (!CHAT_ID) throw new Error("CHAT_ID is missing in .env");
if (!ADMIN_ID) throw new Error("ADMIN_ID is missing in .env");

export const bot = new TelegramBot(TOKEN, { polling: true });

const PREFERENCES_FILE = path.resolve(
  __dirname,
  "../data/user_preferences.json",
);

// ─── Users storage & Mode preferences ─────────────────────────────────────────

let memoryPreferences = null;

function loadPreferences() {
  if (memoryPreferences !== null) return memoryPreferences;
  if (!fs.existsSync(PREFERENCES_FILE)) {
    memoryPreferences = {};
    return memoryPreferences;
  }
  try {
    const content = fs.readFileSync(PREFERENCES_FILE, "utf-8").trim();
    if (!content) {
      memoryPreferences = {};
      return memoryPreferences;
    }
    const parsed = JSON.parse(content);
    memoryPreferences = typeof parsed === "object" && parsed !== null ? parsed : {};
    return memoryPreferences;
  } catch {
    memoryPreferences = {};
    return memoryPreferences;
  }
}

function savePreferences(prefs) {
  memoryPreferences = prefs;
  try {
    const dir = path.dirname(PREFERENCES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.error("[bot] ❌ Failed to save user preferences:", err.message);
  }
}

function getUserMode(userId) {
  const uid = String(userId);
  const prefs = loadPreferences();
  const mode = prefs[uid]?.comparisonMode;
  if (mode === "cache" || mode === "db") {
    return mode;
  }
  return "cache";
}

function setUserMode(userId, mode) {
  const uid = String(userId);
  const safeMode = mode === "db" ? "db" : "cache";
  const prefs = loadPreferences();
  if (!prefs[uid]) prefs[uid] = {};
  prefs[uid].comparisonMode = safeMode;
  savePreferences(prefs);
}

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
      [{ text: "📊 Համեմատություն" }, { text: "🔄 Լրիվ սկանավորում" }],
      [{ text: "🔍 Փնտրել" }, { text: "👥 Օգտատերեր" }],
    ],
    resize_keyboard: true,
    persistent: true,
  },
};

const USER_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: "📊 Համեմատություն" }, { text: "🔄 Լրիվ սկանավորում" }],
      [{ text: "🔍 Փնտրել" }],
    ],
    resize_keyboard: true,
    persistent: true,
  },
};

const CATEGORY_LABEL_TO_KEY = Object.fromEntries(
  Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => [cfg.label, key]),
);

// ─── Send alerts ──────────────────────────────────────────────────────────────

export async function sendAlerts(messages, targetChatId = CHAT_ID) {
  for (const msg of messages) {
    try {
      await bot.sendMessage(targetChatId, msg, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[bot] ❌ Failed to send message:", err.message);
    }
  }
  await bot.sendMessage(targetChatId, "—", MAIN_KEYBOARD).catch(() => {});
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

// ─── Callback queries (admin approve/reject/remove + category filters) ───────

bot.on("callback_query", async (query) => {
  const userId = String(query.message.chat.id);
  const data = query.data;

  // Admin-only actions
  if (
    data.startsWith("approve_") ||
    data.startsWith("reject_") ||
    data.startsWith("remove_")
  ) {
    const adminId = String(query.from.id);
    if (!isAdmin(adminId)) return;

    if (data.startsWith("approve_")) {
      const targetId = data.replace("approve_", "");
      const users = loadUsers();
      if (users[targetId]) {
        users[targetId].approved = true;
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
        targetId,
        "✅ Ձեր հայտը հաստատվել է: Կարող եք օգտվել բոտից:",
        USER_KEYBOARD,
      );
      await bot.sendMessage(adminId, `✅ Օգտատեր ${targetId} հաստատված է:`);
    }

    if (data.startsWith("reject_")) {
      const targetId = data.replace("reject_", "");
      const users = loadUsers();
      if (users[targetId]) {
        users[targetId].approved = false;
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
      await bot.sendMessage(targetId, "❌ Ձեր հայտը մերժվել է:");
      await bot.sendMessage(adminId, `❌ Օգտատեր ${targetId} մերժված է:`);
    }

    if (data.startsWith("remove_")) {
      const targetId = data.replace("remove_", "");
      const users = loadUsers();
      if (users[targetId]) {
        users[targetId].approved = false;
        saveUsers(users);
      }
      await bot.answerCallbackQuery(query.id, { text: "🗑️ Հեռացված" });
      await bot.sendMessage(adminId, `🗑️ Օգտատեր ${targetId} հեռացված է:`);
      await bot.sendMessage(targetId, "❌ Ձեր հասանելիությունը հեռացվել է:");
      // Refresh users list
      await showUsersList(adminId);
    }

    return;
  }

  // Category filter actions & mode switching
  await bot.answerCallbackQuery(query.id).catch(() => {});

  if (!isApproved(userId)) {
    await bot.sendMessage(userId, "⛔ Դուք հասանելիություն չունեք:");
    return;
  }

  // Close button
  if (data === "cat|close") {
    await bot.deleteMessage(userId, query.message.message_id).catch(() => {});
    return;
  }

  // Back button
  if (data.startsWith("cat|back")) {
    const [, , backMode] = data.split("|");
    const mode = backMode || getUserMode(userId);
    try {
      await bot.editMessageText(getMainMenuText(mode), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
        ...buildComparisonMainMenu(mode),
      });
    } catch {
      await bot.deleteMessage(userId, query.message.message_id).catch(() => {});
    }
    return;
  }

  // Mode toggle / switch button: mode|set|<targetMode>|<context>
  if (data.startsWith("mode|set|")) {
    const [, , targetMode, context] = data.split("|");
    if (targetMode === "cache" || targetMode === "db") {
      setUserMode(userId, targetMode);

      if (context === "main") {
        await bot.editMessageText(getMainMenuText(targetMode), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: "Markdown",
          ...buildComparisonMainMenu(targetMode),
        }).catch(() => {});
      } else if (CATEGORY_CONFIG[context]) {
        await bot.editMessageText(getCategoryMenuText(context, targetMode), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: "Markdown",
          ...buildCategoryMenu(context, targetMode),
        }).catch(() => {});
      }
    }
    return;
  }

  // Open category brand menu from main comparison menu: cat|open|<mode>|<categoryKey>
  if (data.startsWith("cat|open|")) {
    const [, , mode, categoryKey] = data.split("|");
    if (CATEGORY_CONFIG[categoryKey]) {
      const selectedMode = mode || getUserMode(userId);
      setUserMode(userId, selectedMode);
      await bot.editMessageText(getCategoryMenuText(categoryKey, selectedMode), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
        ...buildCategoryMenu(categoryKey, selectedMode),
      }).catch(() => {});
    }
    return;
  }

  // Comparison execution:
  // Format 1: cat|<mode>|<categoryKey>|brand|<brandIndex>
  // Format 2: cat|<mode>|<categoryKey>|all
  // Format 3 (legacy): cat|<categoryKey>|brand|<brandIndex>
  // Format 4 (legacy): cat|<categoryKey>|all
  let mode = getUserMode(userId);
  let categoryKey = null;
  let action = null;
  let brandIndex = null;

  const parts = data.split("|");
  if (parts[1] === "cache" || parts[1] === "db") {
    mode = parts[1];
    categoryKey = parts[2];
    action = parts[3]; // 'brand' or 'all'
    brandIndex = parts[4] != null && parts[4] !== "" ? Number(parts[4]) : null;
  } else {
    categoryKey = parts[1];
    action = parts[2];
    brandIndex = parts[3] != null && parts[3] !== "" ? Number(parts[3]) : null;
  }

  if (!CATEGORY_CONFIG[categoryKey]) return;

  if (mode) setUserMode(userId, mode);

  await bot.deleteMessage(userId, query.message.message_id).catch(() => {});

  const modeUpper = mode.toUpperCase();
  const catLabel = CATEGORY_CONFIG[categoryKey].label;

  try {
    const result =
      mode === "db"
        ? await getDbComparisonGrouped(categoryKey)
        : await runSendJob(false, false);

    const categoryMessages = result[categoryKey] || [];

    const messages =
      action === "brand" && brandIndex != null
        ? filterMessagesByBrand(
            categoryMessages,
            categoryKey,
            brandIndex,
          )
        : categoryMessages;

    if (messages.length === 0) {
      await bot.sendMessage(
        userId,
        `✅ [${modeUpper}] Գնային անհամապատասխանություններ չկան (${catLabel})`,
        USER_KEYBOARD,
      );
      return;
    }

    await bot.sendMessage(
      userId,
      `🚨 [${modeUpper}] ${messages.length} անհամապատասխանություն հայտնաբերվել է (${catLabel})`,
      USER_KEYBOARD,
    );
    await sendAlerts(messages, userId);
  } catch (err) {
    console.error(`[bot] ❌ ${modeUpper} Category check failed:`, err.message);
    await bot.sendMessage(
      userId,
      `❌ [${modeUpper}] Սխալ: ` + err.message,
      USER_KEYBOARD,
    );
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

  // Search-mode handling: if user is in awaitingSearch, treat next
  // plain text as a query; if they pressed a real keyboard button,
  // cancel search mode and fall through to normal handling.
  if (awaitingSearch.has(userId)) {
    console.log("Cancelling search mode");
    awaitingSearch.delete(userId);

    const isKnownButton =
      text === "🔄 Լրիվ սկանավորում" ||
      text === "🔍 Փնտրել" ||
      text === "👥 Օգտատերեր" ||
      Object.values(CATEGORY_CONFIG).some((c) => c.label === text);

    if (!isKnownButton) {
      const { messages, totalGroups } = searchProducts(text);

      if (messages.length === 0) {
        await bot.sendMessage(userId, "❌ Ոչինչ չի գտնվել", USER_KEYBOARD);
        return;
      }

      const header =
        totalGroups > messages.length
          ? `🔍 Գտնվել է ${totalGroups}, ցուցադրվում է առաջին ${messages.length}-ը`
          : `🔍 Գտնվել է ${messages.length}`;
      await bot.sendMessage(userId, header, USER_KEYBOARD);

      for (const msg of messages) {
        await bot.sendMessage(userId, msg, { parse_mode: "Markdown" });
      }
      return;
    }
    // fall through to normal handling below if they pressed a real button
  }

  // Start search mode when user presses the search button
  if (text === "🔍 Փնտրել") {
    if (!isApproved(userId)) {
      await bot.sendMessage(
        userId,
        "⛔ Դուք հասանելիություն չունեք: Ուղարկեք /start հայտ ներկայացնելու համար:",
      );
      return;
    }
    console.log("Starting search mode");
    awaitingSearch.add(userId);
    await bot.sendMessage(userId, "🔍 Գրեք ապրանքի անվանումը");
    return;
  }

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

  // ─── Main Comparison Menu (Cache / DB selection & Category list) ─────
  if (text === "📊 Համեմատություն" || text === "🧪 DB Comparison") {
    const userMode = text === "🧪 DB Comparison" ? "db" : getUserMode(userId);
    if (text === "🧪 DB Comparison") setUserMode(userId, "db");

    await bot.sendMessage(
      userId,
      getMainMenuText(userMode),
      {
        parse_mode: "Markdown",
        ...buildComparisonMainMenu(userMode),
      },
    );
    return;
  }

  // ─── Full scan: re-scrapes every category, runs post-scrape pipeline, then reports a summary ───────
  if (text === "🔄 Լրիվ սկանավորում") {
    await bot.sendMessage(
      userId,
      "🔄 Սկանավորում եմ բոլոր կայքերը, խնդրում եմ սպասել...",
    );
    try {
      await runFullScraping();

      const result = await runSendJob(false, false);
      const total = Object.values(result).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );

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

      for (const [categoryKey, cfg] of Object.entries(CATEGORY_CONFIG)) {
        const messages = result[categoryKey] || [];
        if (messages.length === 0) continue;
        await bot.sendMessage(userId, `${cfg.label}`, {
          parse_mode: "Markdown",
        });
        await sendAlerts(messages);
      }
    } catch (err) {
      console.error("[bot] ❌ Full scan failed:", err.message);
      await bot.sendMessage(userId, "❌ Սխալ: " + err.message, USER_KEYBOARD);
    }
    return;
  }

  // ─── Generic category button: shows brand-filter menu with user mode ───────
  if (CATEGORY_LABEL_TO_KEY[text]) {
    const categoryKey = CATEGORY_LABEL_TO_KEY[text];
    const userMode = getUserMode(userId);
    await bot.sendMessage(
      userId,
      getCategoryMenuText(categoryKey, userMode),
      {
        parse_mode: "Markdown",
        ...buildCategoryMenu(categoryKey, userMode),
      },
    );
    return;
  }
});

// Show persistent keyboard on startup
bot.sendMessage(CHAT_ID, "🤖 Բոտը միացված է", MAIN_KEYBOARD).catch(() => {});

console.log("[bot] ✅ Telegram bot initialized");
