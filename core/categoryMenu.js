export const CATEGORY_CONFIG = {
  phones: {
    label: "📱 Հեռախոսներ",
    brands: [
      { label: "iPhone", match: /iphone/i },
      { label: "Samsung", match: /samsung/i },
      { label: "Xiaomi", match: /xiaomi|poco|redmi/i },
      { label: "Google", match: /google|pixel/i },
      { label: "OnePlus", match: /oneplus/i },
      { label: "Nothing", match: /nothing/i },
      { label: "Asus", match: /\basus\b|\brog\b/i },
      { label: "Honor", match: /honor/i },
      { label: "ZTE", match: /\bzte\b/i },
    ],
  },
  tablets: {
    label: "📟 Պլանշետներ",
    brands: [
      { label: "iPad", match: /ipad/i },
      { label: "Samsung", match: /samsung/i },
      { label: "Xiaomi", match: /xiaomi|redmi/i },
      { label: "Amazon", match: /amazon|\bfire\s*(hd|hdx)?\s*\d/i },
      { label: "reMarkable", match: /remarkable/i },
    ],
  },
  watches: {
    label: "⌚ Ժամացույցներ",
    brands: [
      { label: "Apple", match: /apple|i\s*watch/i },
      { label: "Samsung", match: /samsung/i },
      { label: "Xiaomi", match: /xiaomi/i },
    ],
  },
  headphones: {
    label: "🎧 Ականջակալներ",
    brands: [
      { label: "AirPods", match: /airpods/i },
      { label: "Galaxy Buds", match: /galaxy\s*buds/i },
      { label: "Marshall", match: /marshall/i },
      { label: "Sony", match: /\bsony\b/i },
      { label: "Xiaomi", match: /\bxiaomi\b/i },
      { label: "OnePlus", match: /oneplus/i },
      { label: "Nothing", match: /nothing/i },
      { label: "Logitech", match: /logitech/i },
      { label: "JBL", match: /\bjbl\b/i },
      { label: "Bose", match: /\bbose\b/i },
      { label: "Belkin", match: /belkin/i },
      { label: "Beats", match: /\bbeats\b/i },
    ],
  },
  macbooks: {
    label: "💻 Macbook",
    brands: [
      { label: "MacBook Neo", match: /macbook\s*neo/i },
      { label: "MacBook Air", match: /macbook\s*air/i },
      { label: "MacBook Pro", match: /macbook\s*pro/i },
    ],
  },
  speakers: {
    label: "🔊 Բարձրախոսներ",
    brands: [
      { label: "JBL", match: /\bjbl\b/i },
      { label: "Marshall", match: /marshall/i },
      { label: "Harman Kardon", match: /harman/i },
      { label: "Bose", match: /\bbose\b/i },
      { label: "Beats", match: /\bbeats\b/i },
      { label: "Sony", match: /\bsony\b/i },
      { label: "Yandex", match: /yandex|станция/i },
      { label: "Xiaomi", match: /\bxiaomi\b/i },
    ],
  },
  tvs: {
    label: "📺 Հեռուստացույցներ",
    brands: [
      { label: "Samsung", match: /samsung/i },
      { label: "Sony", match: /\bsony\b/i },
      { label: "LG", match: /\blg\b/i },
      { label: "Xiaomi", match: /xiaomi/i },
      { label: "Evvoli", match: /evvoli/i },
    ],
  },
  dyson: {
    label: "💇 Dyson",
    brands: [],
  },
  gaming: {
    label: "🎮 Gaming",
    brands: [
      { label: "PlayStation", match: /\bps5\b|playstation/i },
      { label: "Nintendo", match: /nintendo|switch/i },
      { label: "Xbox", match: /xbox/i },
      { label: "Meta", match: /meta\s*quest/i },
      { label: "Logitech", match: /logitech/i },
      { label: "PXN Racing", match: /\bpxn\b/i },
      { label: "Thrustmaster", match: /thrustmaster/i },
      { label: "Hori", match: /\bhori\b/i },
      {
        label: "Այլ",
        match:
          /^(?!.*(ps5|playstation|nintendo|switch|xbox|meta\s*quest|logitech|pxn|thrustmaster|hori)).+/i,
      },
    ],
  },
  airconditioners: {
    label: "❄️ Օդորակիչներ",
    brands: [
      { label: "Hisense", match: /hisense/i },
      { label: "Midea", match: /midea/i },
      { label: "Samsung", match: /samsung/i },
    ],
  },
};

import {
  getPhoneGroupKey,
  getPhoneSubgroupLabel,
  getDysonGroupKey,
  getDysonSubgroupLabel,
} from "./comparator.js";

export function getCategoryMenuText(categoryKey, mode = "cache") {
  const config = CATEGORY_CONFIG[categoryKey];
  const modeLabel = mode === "db" ? "🗄️ DB" : "💾 Cache";
  return `📊 *Comparison Mode:* ${modeLabel}\n${config?.label || categoryKey} — ընտրեք բրենդը կամ ստուգեք բոլորը.`;
}

export function getPhoneSubgroupMenuText(brandIndex, mode = "cache") {
  const brand = CATEGORY_CONFIG.phones?.brands?.[brandIndex];
  const brandLabel = brand?.label || "Phones";
  const modeLabel = mode === "db" ? "🗄️ DB" : "💾 Cache";
  return `📊 *Comparison Mode:* ${modeLabel}\n📱 *${brandLabel}* — ընտրեք խումբը կամ ստուգեք բոլորը.`;
}

export function getDysonSubgroupMenuText(mode = "cache") {
  const modeLabel = mode === "db" ? "🗄️ DB" : "💾 Cache";
  return `📊 *Comparison Mode:* ${modeLabel}\n💇 *Dyson* — ընտրեք սերիան կամ ստուգեք բոլորը.`;
}

export function getMainMenuText(mode = "cache") {
  const modeLabel = mode === "db" ? "🗄️ DB" : "💾 Cache";
  return `📊 *Comparison Mode:* ${modeLabel}\nԸնտրեք կատեգորիան համեմատության համար.`;
}

export function buildComparisonMainMenu(mode = "cache") {
  const isDb = mode === "db";

  // Top mode selector row with explicit [💾 Cache] and [🗄️ DB] buttons indicating active state
  const modeSelectorRow = [
    {
      text: isDb ? "💾 Cache" : "✅ 💾 Cache (Active)",
      callback_data: "mode|set|cache|main",
    },
    {
      text: isDb ? "✅ 🗄️ DB (Active)" : "🗄️ DB",
      callback_data: "mode|set|db|main",
    },
  ];

  const buttons = [modeSelectorRow];

  const catKeys = Object.keys(CATEGORY_CONFIG);
  for (let i = 0; i < catKeys.length; i += 2) {
    const row = [
      {
        text: CATEGORY_CONFIG[catKeys[i]].label,
        callback_data: `cat|open|${mode}|${catKeys[i]}`,
      },
    ];
    if (catKeys[i + 1]) {
      row.push({
        text: CATEGORY_CONFIG[catKeys[i + 1]].label,
        callback_data: `cat|open|${mode}|${catKeys[i + 1]}`,
      });
    }
    buttons.push(row);
  }

  buttons.push([{ text: "🔙 Փակել", callback_data: "cat|close" }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

export function buildCategoryMenu(categoryKey, mode = "cache") {
  const config = CATEGORY_CONFIG[categoryKey];
  const isDb = mode === "db";

  // Mode switcher row within category view
  const modeSelectorRow = [
    {
      text: isDb ? "💾 Cache" : "✅ 💾 Cache (Active)",
      callback_data: `mode|set|cache|${categoryKey}`,
    },
    {
      text: isDb ? "✅ 🗄️ DB (Active)" : "🗄️ DB",
      callback_data: `mode|set|db|${categoryKey}`,
    },
  ];

  const buttons = [modeSelectorRow];

  if (config && Array.isArray(config.brands)) {
    for (const [i, b] of config.brands.entries()) {
      buttons.push([
        {
          text: b.label,
          callback_data: `cat|${mode}|${categoryKey}|brand|${i}`,
        },
      ]);
    }
  }

  buttons.push([
    {
      text: "✅ Ստուգել բոլորը",
      callback_data: `cat|${mode}|${categoryKey}|all`,
    },
  ]);
  buttons.push([{ text: "🔙 Հետ", callback_data: `cat|back|${mode}` }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

export function buildPhoneSubgroupMenu(
  brandIndex,
  availableSubgroups = [],
  mode = "cache",
) {
  const isDb = mode === "db";
  const modeSelectorRow = [
    {
      text: isDb ? "💾 Cache" : "✅ 💾 Cache (Active)",
      callback_data: `mode|set|cache|phones_brand_${brandIndex}`,
    },
    {
      text: isDb ? "✅ 🗄️ DB (Active)" : "🗄️ DB",
      callback_data: `mode|set|db|phones_brand_${brandIndex}`,
    },
  ];

  const buttons = [modeSelectorRow];

  const groupButtons = availableSubgroups.map((sg) => ({
    text: sg.label,
    callback_data: `cat|${mode}|phones|subgroup|${brandIndex}|${sg.groupKey}`,
  }));

  for (let i = 0; i < groupButtons.length; i += 2) {
    if (groupButtons[i + 1]) {
      buttons.push([groupButtons[i], groupButtons[i + 1]]);
    } else {
      buttons.push([groupButtons[i]]);
    }
  }

  buttons.push([
    {
      text: "✅ Ստուգել բոլորը",
      callback_data: `cat|${mode}|phones|suball|${brandIndex}`,
    },
  ]);
  buttons.push([{ text: "🔙 Հետ", callback_data: `cat|open|${mode}|phones` }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

export function buildDysonSubgroupMenu(
  availableSubgroups = [],
  mode = "cache",
) {
  const isDb = mode === "db";
  const modeSelectorRow = [
    {
      text: isDb ? "💾 Cache" : "✅ 💾 Cache (Active)",
      callback_data: `mode|set|cache|dyson`,
    },
    {
      text: isDb ? "✅ 🗄️ DB (Active)" : "🗄️ DB",
      callback_data: `mode|set|db|dyson`,
    },
  ];

  const buttons = [modeSelectorRow];

  const groupButtons = availableSubgroups.map((sg) => ({
    text: sg.label,
    callback_data: `cat|${mode}|dyson|subgroup|${sg.groupKey}`,
  }));

  for (let i = 0; i < groupButtons.length; i += 2) {
    if (groupButtons[i + 1]) {
      buttons.push([groupButtons[i], groupButtons[i + 1]]);
    } else {
      buttons.push([groupButtons[i]]);
    }
  }

  buttons.push([
    { text: "✅ Ստուգել բոլորը", callback_data: `cat|${mode}|dyson|all` },
  ]);
  buttons.push([{ text: "🔙 Հետ", callback_data: `cat|back|${mode}` }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

export function getDysonSubgroups(messages) {
  const seen = new Set();
  const subgroups = [];

  for (const msg of messages) {
    const groupKey = getDysonGroupKey(msg);
    if (!seen.has(groupKey)) {
      seen.add(groupKey);
      subgroups.push({
        groupKey,
        label: getDysonSubgroupLabel(groupKey),
      });
    }
  }

  return subgroups;
}

export function filterDysonMessagesBySubgroup(messages, targetGroupKey) {
  return messages.filter((m) => getDysonGroupKey(m) === targetGroupKey);
}

export function getPhoneSubgroups(messages) {
  const seen = new Set();
  const subgroups = [];

  for (const msg of messages) {
    const groupKey = getPhoneGroupKey(msg);
    if (!seen.has(groupKey)) {
      seen.add(groupKey);
      subgroups.push({
        groupKey,
        label: getPhoneSubgroupLabel(groupKey),
      });
    }
  }

  return subgroups;
}

export function filterPhoneMessagesBySubgroup(messages, targetGroupKey) {
  return messages.filter((m) => getPhoneGroupKey(m) === targetGroupKey);
}

export function filterMessagesByBrand(messages, categoryKey, brandIndex) {
  const config = CATEGORY_CONFIG[categoryKey];
  const brand = config?.brands?.[brandIndex];
  if (!brand) return messages;
  return messages.filter((m) => brand.match.test(m));
}
