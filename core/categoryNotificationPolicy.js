import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.resolve(__dirname, "../data/category_notification_state.json");
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const DAILY_CATEGORIES = new Set(["tablets", "headphones", "watches", "macbooks"]);

function yerevanDate(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Yerevan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (error) {
    console.error("[notifications] Could not read category notification state:", error.message);
    return {};
  }
}

export function selectEligibleCategories(categories, state = {}, now = new Date()) {
  const date = yerevanDate(now);
  const nextState = {
    phoneDaily: { ...(state.phoneDaily || {}) },
    dailyByCategory: { ...(state.dailyByCategory || {}) },
    lastSentAt: { ...(state.lastSentAt || {}) },
  };
  const eligible = [];

  for (const category of categories) {
    const key = category.categoryKey;
    if (key === "phones") {
      const sentToday = nextState.phoneDaily.date === date
        ? Number(nextState.phoneDaily.count) || 0
        : 0;
      if (sentToday >= 2) continue;
      nextState.phoneDaily = { date, count: sentToday + 1 };
    } else if (DAILY_CATEGORIES.has(key)) {
      if (nextState.dailyByCategory[key] === date) continue;
      nextState.dailyByCategory[key] = date;
    } else {
      const lastSentAt = Date.parse(nextState.lastSentAt[key]);
      if (Number.isFinite(lastSentAt) && now.getTime() - lastSentAt < TWO_DAYS_MS) {
        continue;
      }
      nextState.lastSentAt[key] = now.toISOString();
    }
    eligible.push(category);
  }

  return { categories: eligible, state: nextState };
}

export function filterCategoriesByNotificationFrequency(categories, now = new Date()) {
  const { categories: eligible, state } = selectEligibleCategories(categories, readState(), now);
  if (eligible.length > 0) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  }
  return eligible;
}