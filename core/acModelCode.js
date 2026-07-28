const BRAND_WORDS = /\b(hisense|midea|samsung|lg)\b/gi;
const MARKETING_WORDS =
  /\b(inverter|wi-?fi|easy\s*smart|max\s*comfort|a\+\+|ai|hi-?cool|super\s*cool|carbon|black|white|silver|grey|gray|withouth?\s*pip|pip|a\/c|ddе)\b/gi;

export function extractACCode(rawName) {
  let s = rawName.toLowerCase();

  s = s.replace(/օդորակիչ|ինվերտորային/gi, "");
  s = s.replace(BRAND_WORDS, "");
  s = s.replace(/\d+\s*btu/gi, "");
  s = s.replace(/<\s*\d+\s*m[²2]/gi, "");
  s = s.replace(/\([a-z]\)/gi, ""); // single-letter color variants: (B) (C) (S)
  s = s.replace(MARKETING_WORDS, "");
  s = s.replace(/-(cn|th|ee|er|x)\b/gi, "");
  s = s.replace(/[^a-z0-9]/gi, ""); // strip all remaining punctuation/spaces

  return s.trim().toUpperCase();
}