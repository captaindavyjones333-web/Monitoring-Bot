const XIAOMI_L_CODE_REGEX = /\bL\d{2,3}M[A-Z0-9]-[A-Z0-9]+\b/;
const SAMSUNG_CODE_REGEX = /\b[UQ]E\d{2,3}[A-Z0-9]{4,10}\b/;
const EVVOLI_CODE_REGEX = /\b\d{2}EV\d{3}[A-Z0-9-]*\b/;

// Known mapping from distributor SKU (ELA-codes, used by mobilecentre)
// to Xiaomi's own L-code prefix. Maintained manually — there's no
// algorithmic derivation between the two code schemes. Update when a
// new Xiaomi TV model is confirmed to exist under both naming schemes.
const ELA_TO_L_CODE = {
  ELA5192EU: "L32M8-A2",
  ELA4897GL: "L32M8-A2",
  // ELA5487EU (Xiaomi TV A Pro 75" 2025): no confirmed L-code
  // counterpart found on any other site yet — left unmapped so this
  // listing correctly shows no alert rather than risk a false merge
  // with the 2026 A Pro 75" (L75MB-APME), which is a different model.
};

function stripRegionSuffix(lCode) {
  // "L55MB-APME" -> "L55MB-AP" (drop trailing 2-letter region)
  return lCode.replace(/[A-Z]{2}$/, "");
}

export function extractTvModelCode(name) {
  const upper = name.toUpperCase();

  const lMatch = upper.match(XIAOMI_L_CODE_REGEX);
  if (lMatch) return stripRegionSuffix(lMatch[0]);

  const elaMatch = upper.match(/\bELA\d{4}[A-Z]{2}\b/);
  if (elaMatch && ELA_TO_L_CODE[elaMatch[0]]) return ELA_TO_L_CODE[elaMatch[0]];

  const samsungMatch = upper.match(SAMSUNG_CODE_REGEX);
  if (samsungMatch) return samsungMatch[0].slice(0, 8);

  const evvoliMatch = upper.match(EVVOLI_CODE_REGEX);
  if (evvoliMatch) return evvoliMatch[0].split("-")[0];

  return null;
}
