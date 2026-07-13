const CODE_REGEX = /\b(H[DST]\d{2})\b/i;

// Canonical color vocabulary — every raw color phrase across all sites
// maps to one of these. Built directly from your real data.
const COLOR_MAP = {
  "nickel copper": "nickel/copper",
  "nickel/copper": "nickel/copper",
  "prussian blue rich copper": "prussian blue/copper",
  "prussian blue/rich copper": "prussian blue/copper",
  "prussian blue/copper": "prussian blue/copper",
  "prussian blue": "prussian blue",
  "ceramic pink rose gold": "ceramic pink",
  "ceramic pink/rose gold": "ceramic pink",
  "ceramic pink": "ceramic pink",
  "strawberry bronze blush pink": "strawberry bronze",
  "strawberry bronze/blush pink": "strawberry bronze",
  "strawberry bronze": "strawberry bronze",
  "red velvet gold": "red velvet/gold",
  "red velvet/gold": "red velvet/gold",
  "red velvet": "red velvet",
  "velvet red/gold": "red velvet/gold",
  "ceramic apricot topaz": "ceramic apricot/topaz",
  "ceramic apricot/topaz": "ceramic apricot/topaz",
  "apricot topaz": "ceramic apricot/topaz",
  "ceramic patina topaz": "ceramic patina/topaz",
  "ceramic patina/topaz": "ceramic patina/topaz",
  "ceramic patina": "ceramic patina/topaz",
  "vinca blue topaz": "vinca blue/topaz",
  "vinca blue/topaz": "vinca blue/topaz",
  "vinca blue": "vinca blue/topaz",
  "jasper plum": "jasper plum",
  "jusper plum": "jasper plum", // typo seen in your data
  "amber silk": "amber silk",
  "amber silk pink champagne": "amber silk",
  "onyx gold": "onyx gold",
  "kanzan pink": "kanzan pink",
  "sakura cherry": "sakura cherry",
  "nickel": "nickel",
  "rich copper nickel": "nickel/copper",
  "rich copper/nickel": "nickel/copper",
};

function extractColor(name) {
  const lower = name.toLowerCase();

  // Try each known color phrase, longest first, so multi-word colors
  // match before their component single words could cause a wrong
  // partial match.
  const sortedKeys = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) return COLOR_MAP[key];
  }
  return null;
}

export function extractDysonKey(name) {
  const codeMatch = name.match(CODE_REGEX);
  const code = codeMatch ? codeMatch[1].toUpperCase() : null;
  if (!code) return null;

  const color = extractColor(name);
  return color ? `${code}_${color}` : code; // fall back to code-only if color unrecognized
}