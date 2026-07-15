const COLORS = [
  "midnight",
  "starlight",
  "ultramarine",
  "teal",
  "coral",
  "graphite",
  "alpine",
  "storm",
  "clay",
  "lavender",
  "mint",
  "sage",
  "sierrablue",
  "desert",
  "gold",
  "silver",
  "titanium",
  "natural",
  "blue",
  "black",
  "white",
  "red",
  "green",
  "yellow",
  "purple",
  "pink",
  "navy",
  "orange",
  "gray",
  "grey",
  "space gray",
  "space grey",
  "sierra blue",
  "alpine green",
  "alpine blue",
  "deep purple",
  "deep blue",
  "cosmic orange",
  "cosmic",
  "deep",
  "mocha",
  "brown",
  "beige",
  "cream",
  "violet",
  "bronze",
  "squad",
];

const ARMENIAN_COLORS = {
  սև: "black",
  վարդագույն: "pink",
  կարմիր: "red",
  սպիտակ: "white",
  կապույտ: "blue",
  մանուշակագույն: "purple",
  կանաչ: "green",
};

const MULTIWORD_COLORS = [
  "space gray",
  "space grey",
  "sierra blue",
  "alpine green",
  "alpine blue",
  "deep purple",
  "deep blue",
  "product red",
  "sky blue",
  "desert titanium",
  "black titanium",
  "white titanium",
  "natural titanium",
  "rose gold",
  "starlight silver",
  "deep blue",
  "cosmic orange",
  "moonstone gray",
  "moonstone grey",
];

const CONNECTIVITY = ["4g", "lte", "dual sim", "dual-sim"];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryRegex(phrase, flags = "gi") {
  return new RegExp(`(?<![\\w])${escapeRegex(phrase)}(?![\\w])`, flags);
}

function extractConnectivity(name) {
  const cellularIndicators =
    /\b(5g|4g|lte|gsm|hspa|umts|cdma|nano-?sim|dual-?sim|cellular)\b/i;
  const wifiIndicator = /\bwi[\s-]?fi\b/i;
  if (cellularIndicators.test(name)) return "cellular";
  if (wifiIndicator.test(name)) return "wifi";
  return null;
}

function stripConnectivityWords(name) {
  return name
    .replace(/\bwi[\s-]?fi\b/gi, "")
    .replace(/\+?\s*\bcellular\b/gi, "")
    .replace(/\b(5g|4g|lte|gsm|hspa|umts|cdma)\b/gi, "")
    .replace(/\bnano-?sim\b/gi, "")
    .replace(/\bdual-?sim\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeSpeakerSkus(name) {
  name = name.replace(
    /\bhkos(\d{1,2})[a-z]*\b/gi,
    "harman kardon onyx studio $1",
  );
  name = name.replace(
    /\bhkluna(\d)?[a-z]*\b/gi,
    (m, n) => `harman kardon luna${n ? " " + n : ""}`,
  );
  name = name.replace(
    /\bhksoundstk(\d)[a-z]*\b/gi,
    "harman kardon soundsticks $1",
  );
  name = name.replace(/\bhkgoplaymini[a-z]*\b/gi, "harman kardon go play mini");
  name = name.replace(/\bgo\s*play\s*(\d{1,2})[a-z]{2,6}\b/gi, "goplay$1");
  name = name.replace(/\bpartybox\s*(\d{2,4})[a-z]{2,6}\b/gi, "partybox$1");
  name = name.replace(
    /\bpartybox\s*stage\s*(\d{2,4})[a-z]{2,4}\b/gi,
    "partybox stage$1",
  );
  name = name.replace(
    /\bpartybox\s*club\s*(\d{2,4})\s*[a-z]{2,4}\b/gi,
    "partybox club$1",
  );
  name = name.replace(/\bpb(\d{2,4})[a-z]{2,6}\b/gi, "partybox$1");
  name = name.replace(/\bbar(\d{3,4})[a-z]{2,6}\b/gi, "bar$1");
  return name;
}

export function normalizeName(raw) {
  let name = raw.toLowerCase().trim();

  name = decodeSpeakerSkus(name);

  const connectivity = extractConnectivity(name);

  // 1. Normalize Russian GB: "256 ГБ" -> "256gb"
  name = name.replace(/(\d+)\s*гб/gi, "$1gb");

  // 2. Strip "Apple" brand prefix
  name = name.replace(/^apple\s+/, "");
  name = name.replace(/\bwi[\s-]?fi\s*\+\s*cellular\b/gi, "cellular");

  // 2b. Normalize Plus variants: "Pro+" / "Pro Plus" / "Pro +" → "pro plus"
  name = name.replace(/\bfold\s*(\d{1,2})\b/gi, "fold$1");
  name = name.replace(/\bwatch\s*(\d{1,2})\b/gi, "watch$1");
  name = name.replace(/\bse\s*(\d{1,2})\b/gi, "se$1");
  name = name.replace(/\bbuds\s*(\d{1,2})\b/gi, "buds$1");

  name = name.replace(/\bcharge\s*(\d{1,2})\b/gi, "charge$1");
  name = name.replace(/\bclip\s*(\d{1,2})\b/gi, "clip$1");
  name = name.replace(/\bflip\s*(\d{1,2})\b/gi, "flip$1"); // JBL Flip AND Samsung Z Flip share this rule, both benefit
  name = name.replace(/\bgo\s*(\d{1,2})\b/gi, "go$1");
  name = name.replace(/\bxtreme\s*(\d{1,2})\b/gi, "xtreme$1");
  name = name.replace(/\bpulse\s*(\d{1,2})\b/gi, "pulse$1");
  name = name.replace(/\bpartybox\s*(\d{1,3})\b/gi, "partybox$1");
  name = name.replace(/\bauthentics\s*(\d{1,3})\b/gi, "authentics$1");
  name = name.replace(/\bonyx\s*studio\s*(\d{1,2})\b/gi, "onyx studio $1");
  name = name.replace(/(\d+)(?:st|nd|rd|th)\s+generation\b/gi, "$1");
  name = name.replace(/\bboombox\s*(\d{1,2})\b/gi, "boombox$1");
  name = name.replace(/\btuner\s*(\d{1,2})\b/gi, "tuner$1");
  name = name.replace(/\bgrip\s*(\d{0,2})\b/gi, "grip");
  name = name.replace(/\bsoundsticks\s*(\d{1,2})\b/gi, "soundsticks$1");
  name = name.replace(/\bluna\s*(\d{0,2})\b/gi, (m, n) =>
    n ? `luna${n}` : "luna",
  );
  name = name.replace(/\bcitation\s*(\d{1,4})\b/gi, "citation$1");
  name = name.replace(/\bgo\s*\+?\s*play\s*(\d{0,2})\b/gi, (m, n) =>
    n ? `goplay${n}` : "goplay",
  );
  name = name.replace(/\baura\s*studio\s*(\d{1,2})\b/gi, "aurastudio$1");
  // Strip manufacture year mentions (e.g. "SE 2024", "SE2 2024") — the
  // generation number already conveys this, and different stores are
  // inconsistent about whether they include the year at all.
  name = name.replace(/\bipad\s+11\s+air\b/gi, "ipad air 11");
  name = name.replace(/\bipad\s+13\s+air\b/gi, "ipad air 13");
  name = name.replace(/\bipad\s*mini\s*\(?2024\)?/gi, "ipad mini 7");
  name = name.replace(/\bipad\s*mini\s*\(?2021\)?/gi, "ipad mini 6");
  if (name.includes("ipad") || name.includes("macbook")) {
    name = name.replace(/\b[am]\d{1,2}\s*(chip)?\b/gi, "");
  }
  name = name.replace(/\b(19|20)\d{2}\b/g, "");
  name = name.replace(/\s+/g, " ").trim();

  name = name.replace(/\bpro\s*\+/gi, "pro plus");
  name = name.replace(/note\s*\+/gi, "note plus");
  name = name.replace(/\+(?=\s|$)/g, " plus");

  // 2c. Collapse hybrid "Nano-SIM & eSIM" / "1 SIM + eSIM" phrasing into ONE
  name = name.replace(
    /(?:1\s*sim\s*\+\s*e[\s-]?sim)|(?:nano[\s-]?sim\s*(?:&|\+|and)\s*e[\s-]?sim)/gi,
    "nanosim",
  );

  // 3. Extract SIM type FROM parentheses before stripping them
  //    "(eSim)" -> "esim", "(Nano-Sim)" -> "nanosim"
  name = name.replace(/\(([^)]*)\)/g, (match, inner) => {
    const tokens = [];
    if (/e[\s-]?sim/i.test(inner)) tokens.push("esim");
    if (/nano[\s-]?sim/i.test(inner)) tokens.push("nanosim");
    if (/dual[\s-]?sim/i.test(inner)) tokens.push("dualsim");
    return tokens.length ? " " + tokens.join(" ") + " " : " ";
  });

  // 4. Normalize bare SIM tokens outside parentheses
  name = name.replace(/\be[\s-]?sim\b/gi, "esim");
  name = name.replace(/\bnano[\s-]?sim\b/gi, "nanosim");
  // Normalize tablet connectivity wording so different phrasing across
  // stores collapses to the same token for matching purposes.
  name = name.replace(/\bwi[\s-]?fi\b/gi, "wifi");
  name = name.replace(/\b4g\b/gi, "lte");
  name = name.replace(/\blte\b/gi, "lte");
  name = name.replace(/\b5g\b/gi, "5g");

  // For others keep RAM as part of key since 8GB/256GB ≠ 12GB/256GB
  // 5. RAM stripping — only for Apple, keep RAM for Android
  const isApple =
    name.startsWith("iphone") ||
    name.startsWith("ipad") ||
    name.startsWith("apple");
  if (isApple) {
    name = name.replace(/\b\d+\s*gb\s*[\/+]\s*(\d+\s*gb)\b/gi, "$1");
    name = name.replace(/\b\d+\s*[\/+]\s*(\d+\s*gb)\b/gi, "$1");
  } else {
    // Keep RAM+storage but normalize format: "4GB/64GB" -> "4gb 64gb"
    name = name.replace(/\b(\d+)\s*gb\s*[\/+]\s*(\d+)\s*gb\b/gi, "$1gb $2gb");
    name = name.replace(/\b(\d+)\s*[\/+]\s*(\d+)\s*gb\b/gi, "$1gb $2gb");
  }

  // 6. Normalize storage spacing: "128 gb" -> "128gb"
  name = name.replace(/(\d+)\s*gb/gi, "$1gb");
  name = name.replace(/(\d+)\s*mm\b/gi, "$1mm");

  // 7. Remove multi-word colors first
  for (const color of MULTIWORD_COLORS) {
    name = name.replace(wordBoundaryRegex(color), "");
  }

  // 8. Remove single-word colors
  for (const color of COLORS) {
    name = name.replace(wordBoundaryRegex(color), "");
  }

  name = name.replace(/\bband\b/gi, "");
  name = name.replace(/\s+/g, " ").trim();

  // 9. Remove connectivity suffixes (NOT esim/nanosim)
  for (const conn of CONNECTIVITY) {
    name = name.replace(wordBoundaryRegex(conn), "");
  }

  // 9b. Strip "dual" prefix before esim (e.g. "Dual eSIM" -> "esim")
  name = name.replace(/\bdual\s+(?=esim)/gi, "");

  // 10. Clean punctuation and whitespace
  name = name
    .replace(/[,\-_\/\\&+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  name = name.replace(
    /\b(lte|4g|5g|gsm|hspa|umts|cdma|nanosim|dualsim|cellular)\b/gi,
    "cellular",
  );
  // A cellular tablet always has wifi too — drop the redundant "wifi"
  // token so it doesn't fragment the match key.
  if (/\bcellular\b/.test(name)) {
    name = name
      .replace(/\bwifi\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  name = name.replace(/\b(cellular\s+)+cellular\b/gi, "cellular");

  // Strip vendor SKU/model codes that only some stores include
  // (Samsung "X133", "X230"...; Apple "MXNA3", "MD3Y4"...). Guarded by
  // length + mixed letter/digit check so it never touches real model
  // identifiers like "a11", "s10", or Apple chip names "m3"/"m4"/"m5".
  name = name.replace(/\bsm[\s-]?[a-z0-9]{3,6}\b/gi, "");
  name = name.replace(/\b[xmlr][a-z0-9]{2,6}\b/gi, (tok) => {
    const hasDigit = /\d/.test(tok);
    const hasLetter = /[a-z]/i.test(tok);
    return hasDigit && hasLetter ? "" : tok;
  });
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/\bgps\b/gi, "");
  name = name.replace(/\b(aluminium|titanium|stainless steel)\s+case\b/gi, "");
  name = name.replace(/\bwith\s+.*?\s+sport\s+(band|loop)\b/gi, "");
  name = name.replace(/\bwith\s+(?:[a-z]+\s+)?(ocean|trail|alpine|milanese)\s+(band|loop)\b/gi, "");
  name = name.replace(/\b(ocean|trail|alpine)\s+(band|loop)\b/gi, "");
  name = name.replace(/\bwatch\s+(\d{1,2}mm)\s+series\s*(\d{1,2})\b/gi, "watch series$2 $1");
  name = name.replace(/\boriginal\s+/gi, "");
  name = name.replace(/\bs\/m\b/gi, "");
  name = name.replace(/\bm\/l\b/gi, "");
  name = name.replace(/\bheadphones?\b/gi, "");
  name = name.replace(/ականջակալ/gi, "");
  name = name.replace(/\bin[\s-]?ear\b/gi, "");
  name = name.replace(/\bon[\s-]?ear\b/gi, "");
  name = name.replace(/\bover[\s-]?ear\b/gi, "");
  name = name.replace(/\bwireless\b/gi, "");
  name = name.replace(/\bbt\b/gi, "");
  name = name.replace(/\busb\s*type[\s-]?c\b/gi, "");
  name = name.replace(/\btype[\s-]?c\b/gi, "");
  name = name.replace(/\s+/g, " ").trim();

  // Strip generic "speaker" wording (English + Armenian) and marketing/
  // connectivity descriptors that vary inconsistently across sites.
  name = name.replace(/\bspeakers?\b/gi, "");
  name = name.replace(/բարձրախոս/gi, "");
  name = name.replace(/ակուստիկ\s+համակարգ/gi, "");
  name = name.replace(/\bportable\b/gi, "");
  name = name.replace(/\bwireless\b/gi, "");
  name = name.replace(/\bbluetooth\b/gi, "");
  name = name.replace(/\bbt\b/gi, "");
  name = name.replace(/\bwaterproof\b/gi, "");
  name = name.replace(/\bsplash\s*proof\b/gi, "");
  name = name.replace(/\bsplas\s*proof\b/gi, ""); // allsell's typo variant
  name = name.replace(/\bwith\s+battery\b/gi, "");
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/\bsplashproof\b/gi, "");
  name = name.replace(/\bwith\s+(dual\s+)?mic(rophone)?\b/gi, "");
  name = name.replace(/\bwifi\s*&\s*bluetooth\b/gi, "");
  name = name.replace(/\bspeaker\s*system\b/gi, "");
  name = name.replace(/\blight\s*stick\b/gi, "");
  name = name.replace(/\bmultibeam\b/gi, "");
  name = name.replace(/\bdolby\s*atmos\b/gi, "");
  name = name.replace(/\bsurround\b/gi, "");
  name = name.replace(/\bcompact\s*tv\s*speaker\b/gi, "");
  name = name.replace(/\b\d\.\d\b/g, ""); // strip "5.1" soundbar channel counts

  name = name.replace(/\b[a-z]+\d{1,2}-[a-z]{2,4}\b/gi, (match) => {
    // Only strip if it looks like "word+digit-CODE" (JBL SKU pattern),
    // not a real distinguishing token.
    return match.replace(/-[a-z]{2,4}$/i, "");
  });
  // Collapse every phrasing of Active Noise Cancellation into one
  // canonical token, so "with Active Noise Cancellation", "(Active NC)",
  // and bare "ANC" all produce the same match key.
  name = name.replace(
    /\(?\s*with\s+active\s+noise\s+cancellation\s*\)?/gi,
    " anc ",
  );
  name = name.replace(/\(?\s*active\s*nc\s*\)?/gi, " anc ");
  name = name.replace(/\bactive\s+noise\s+cancellation\b/gi, "anc");
  name = name.replace(/\s+/g, " ").trim();
  // 11. Reorder tokens: storage before sim type
  //     "iphone 17 pro max esim 256gb" -> "iphone 17 pro max 256gb esim"

  name = stripConnectivityWords(name);
  if (connectivity) name = `${name} ${connectivity}`;

  name = reorderTokens(name);
  return name;
}

function stripStorage(key) {
  // Remove storage (e.g. "256gb", "1tb") from anywhere in the key
  return key
    .replace(/\s+\d+(?:gb|tb)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function reorderTokens(name) {
  // Ensure storage always appears before sim tokens for consistent keys
  // e.g. "iphone 17 pro max esim 256gb" -> "iphone 17 pro max 256gb esim"
  const simTokens = [];
  const storageTokens = [];
  const otherTokens = [];

  for (const token of name.split(" ")) {
    if (/^\d+(gb|tb|mm)$/i.test(token)) storageTokens.push(token);
    else if (
      ["esim", "nanosim", "dualsim", "wifi", "lte", "5g", "cellular"].includes(
        token,
      )
    )
      simTokens.push(token);
    else otherTokens.push(token);
  }

  return [...otherTokens, ...storageTokens, ...simTokens].join(" ");
}

function getMatchKey(key) {
  return key
    .replace(/\s+nanosim\b/g, "")
    .replace(/\s+dual\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getBaseKey(key) {
  const hasStorage = /\d+(gb|tb)/i.test(key);
  if (hasStorage) {
    return getMatchKey(key);
  } else {
    return stripStorage(getMatchKey(key));
  }
}

export function groupByNormalizedName(allProducts) {
  const groups = new Map();

  const items = allProducts.map((p) => ({
    product: p,
    key: normalizeName(p.name),
  }));

  const baseToCanonical = new Map();

  for (const { key } of items) {
    const base = getBaseKey(key);
    if (!baseToCanonical.has(base)) {
      baseToCanonical.set(base, key);
    } else {
      const existing = baseToCanonical.get(base);
      if (existing === base && key !== base) {
        baseToCanonical.set(base, key);
      }
    }
  }

  for (const { product, key } of items) {
    const base = getBaseKey(key);
    const canonicalKey = baseToCanonical.get(base) ?? key;

    if (!groups.has(canonicalKey)) {
      groups.set(canonicalKey, { normalized: canonicalKey, sources: {} });
    }

    const group = groups.get(canonicalKey);
    const existing = group.sources[product.source];
    if (existing) {
      const newCash = product.cash_price ?? Infinity;
      const oldCash = existing.cash_price ?? Infinity;
      if (newCash >= oldCash) continue;
    }

    group.sources[product.source] = {
      name: product.name,
      cash_price: product.cash_price ?? null,
      installment_price: product.installment_price ?? null,
    };
  }

  return groups;
}

function getTrailingStorageRun(key) {
  const tokens = key.split(" ");
  const gbtbIdx = tokens
    .map((t, i) => (/^\d+(gb|tb)$/i.test(t) ? i : -1))
    .filter((i) => i >= 0);

  if (gbtbIdx.length === 0) return { label: null, tokens };

  // Take the last contiguous run of gb/tb tokens (covers "12gb 256gb" as
  // one block — RAM immediately followed by storage — or just "256gb"
  // alone for Apple, where RAM isn't tracked at all).
  let start = gbtbIdx[gbtbIdx.length - 1];
  const end = start;
  for (let i = gbtbIdx.length - 2; i >= 0; i--) {
    if (gbtbIdx[i] === start - 1) start = gbtbIdx[i];
    else break;
  }

  const runTokens = tokens.slice(start, end + 1);
  const label = runTokens.map((t) => t.toUpperCase()).join("/");
  const remaining = [...tokens.slice(0, start), ...tokens.slice(end + 1)];
  return { label, tokens: remaining };
}

export function getModelKey(key) {
  // Groups messages by model+SIM type only. RAM+storage together are
  // stripped as one block, since RAM is fixed per model — different
  // storage tiers of the same phone/RAM combo should share one message.
  const { tokens } = getTrailingStorageRun(key);
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

export function getStorageLabel(key) {
  // Returns "12GB/256GB" for Android, "256GB" for Apple, or null.
  return getTrailingStorageRun(key).label;
}
