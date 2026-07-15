export const CATEGORY_CONFIG = {
  phones: {
    label: "📱 Հեռախոսներ",
    brands: [
      { label: "iPhone", match: /iphone/i },
      { label: "Samsung", match: /samsung/i },
      { label: "Xiaomi", match: /xiaomi|poco|redmi/i },
    ],
  },
  tablets: {
    label: "📟 Պլանշետներ",
    brands: [
      { label: "iPad", match: /ipad/i },
      { label: "Samsung", match: /samsung/i },
      { label: "Xiaomi", match: /xiaomi|redmi/i },
    ],
  },
  watches: {
    label: "⌚ Ժամացույցներ",
    brands: [
      { label: "Apple", match: /apple/i },
      { label: "Samsung", match: /samsung/i },
      { label: "Xiaomi", match: /xiaomi/i },
    ],
  },
  headphones: {
    label: "🎧 Ականջակալներ",
    brands: [
      { label: "AirPods", match: /airpods/i },
      { label: "Galaxy Buds", match: /buds/i },
      { label: "Marshall", match: /marshall/i },
    ],
  },
  macbooks: {
    label: "💻 Macbook",
    brands: [],
  },
  speakers: {
    label: "🔊 Խոսափողեր",
    brands: [
      { label: "JBL", match: /jbl/i },
      { label: "Marshall", match: /marshall/i },
      { label: "Harman Kardon", match: /harman/i },
    ],
  },
  tvs: {
    label: "📺 Հեռուստացույցներ",
    brands: [
      { label: "Samsung", match: /samsung/i },
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
    ],
  },
};

export function buildCategoryMenu(categoryKey) {
  const config = CATEGORY_CONFIG[categoryKey];
  const buttons = config.brands.map((b, i) => [
    { text: b.label, callback_data: `cat|${categoryKey}|brand|${i}` },
  ]);
  buttons.push([
    { text: "✅ Ստուգել բոլորը", callback_data: `cat|${categoryKey}|all` },
  ]);
  buttons.push([{ text: "🔙 Հետ", callback_data: `cat|back` }]);
  return { reply_markup: { inline_keyboard: buttons } };
}

export function filterMessagesByBrand(messages, categoryKey, brandIndex) {
  const config = CATEGORY_CONFIG[categoryKey];
  const brand = config.brands[brandIndex];
  if (!brand) return messages;
  const filtered = messages.filter((m) => brand.match.test(m));
  return filtered.map((msg, i) => msg.replace(/^\d+\.\s*/, `${i + 1}. `));
}
