// Match Dyson model codes like HS08, HD15, HT01, allowing optional
// separators (hyphen/space) as stores sometimes write "HS-08" or "HS 08".
const CODE_REGEX = /\b(H(?:[DST])[- ]?\d{2})\b/i;

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
  "patina topaz": "ceramic patina/topaz",
  "patina/topaz": "ceramic patina/topaz",
  "patina": "ceramic patina/topaz",
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
  const rawCode = codeMatch ? codeMatch[1] : null;
  const code = rawCode ? rawCode.toUpperCase().replace(/[- ]/g, "") : null;
  if (!code) return null;

  const color = extractColor(name);
  // Prefer the primary color when stores list multiple colors separated
  // by "/". This avoids splitting the same product just because one
  // listing includes both colors (e.g. "Prussian Blue/Rich Copper").
  const primaryColor = color ? color.split("/")[0] : null;

  // Only treat "complete" and "origin" as distinct variants — other
  // tokens like "ID" or "multi-styler" should not force separate
  // grouping because they are often marketing/format variations.
  let variant = null;
  if (/\bcomplete\b/i.test(name)) variant = "complete";
  else if (/\borigin\b/i.test(name)) variant = "origin";

  const colorPart = primaryColor ? `_${primaryColor}` : "";
  const variantPart = variant ? `_${variant}` : "";

  return `${code}${colorPart}${variantPart}`;
}