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
  "blush",
  "brass",
  "navy",
  "orange",
  "gray",
  "grey",
  "space gray",
  "space grey",
  "space black",
  "sierra blue",
  "alpine green",
  "alpine blue",
  "deep purple",
  "deep blue",
  "cosmic orange",
  "cosmic",
  "deep",
  "dark",
  "mocha",
  "brown",
  "beige",
  "cream",
  "violet",
  "bronze",
  "squad",
  "porcelain",
  "obsidian",
  "hazel",
  "snow",
  "chalk",
  "charcoal",
  "fog",
  "lemongrass",
  "indigo",
  "jade",
  "moonstone",
  "bay",
  "aloe",
  "peony",
  "wintergreen",
  "rose",
  "shadow",
  "jetblack",
  "onyx",
  "cobalt",
  "marble",
  "amber",
  "peach",
  "lime",
  "lilac",
  "emerald",
  "phantom",
  "crafted",
  "icy",
  "celadon",
  "eternal",
  "rebel",
  "ebony",
  "starry",
  "forest",
  "marrs",
  "cyan",
  "velvet",
  "meteor",
  "lunar",
  "sunrise",
  "ocean",
  "titan",
  "aloe",
  "jet",
  "frost",
  "glacier",
  "mist",
  "palm",
  "lake",
  "olive",
  "verde",
  "lavander",
  "denim",
  "icyblue",
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
  "space black",
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
  "sorta seafoam",
  "sorta sunny",
  "oh so orange",
  "clearly white",
  "just black",
  "kinda blue",
  "really blue",
  "silver shadow",
  "blue shadow",
  "white shadow",
  "black shadow",
  "violet shadow",
  "peach pink",
  "soft pink",
  "onyx black",
  "cobalt violet",
  "marble gray",
  "marble grey",
  "amber yellow",
  "titanium jetblack",
  "titanium icyblue",
  "crafted black",
  "icy blue",
  "phantom black",
  "phantom silver",
  "phantom green",
  "phantom violet",
  "celadon marble",
  "marrs green",
  "jade cyan",
  "ocean cyan",
  "starry purple",
  "eternal green",
  "rebel gray",
  "rebel grey",
  "lunar grey",
  "lunar gray",
  "sunrise gold",
  "velvet black",
  "velvet grey",
  "velvet gray",
  "midnight black",
  "forest green",
  "light blue",
  "light green",
  "desert gold",
  "arctic down",
  "titan black",
  "titan silver",
  "interstellar black",
  "galactic silver",
  "tropical rain",
  "jet black",
  "light violet",
  "light gray",
  "light grey",
  "titanium color", 
  "glacier blue",
];

const CONNECTIVITY = ["4g", "lte", "dual sim", "dual-sim"];

const SPEAKER_BRAND_REGEX =
  /\b(partybox|clip|charge|flip|go|xtreme|pulse|boombox|tuner|authentics|goplay|aurastudio|onyxstudio|soundsticks|luna|citation|emberton|acton|stanmore|middleton|stockwell|willen|woburn|tufton|kilburn)\d*\b/i;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryRegex(phrase, flags = "gi") {
  return new RegExp(`(?<![\\w])${escapeRegex(phrase)}(?![\\w])`, flags);
}

function isIpadName(name) {
  return /\bipad\b/i.test(name);
}

function getIpadConnectivityToken(name) {
  if (
    /\b(cellular|lte|4g|5g|gsm|hspa|umts|cdma|nanosim|dualsim)\b/i.test(name)
  ) {
    return "cellular";
  }
  if (/\bwifi\b/i.test(name)) {
    return "wifi";
  }
  return null;
}

function getIpadYearToken(name) {
  const match = name.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

function getIpadBaseKey(key) {
  return key
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\s+(wifi|cellular|lte|4g|5g|nanosim|dual)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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
  // Strip "Club" sub-brand from PartyBox — stores are inconsistent about it.
  // "PartyBox Club 120UK" → "partybox120", "PartyBox Club 120" → "partybox120"
  name = name.replace(
    /\bpartybox\s*club\s*(\d{2,4})[a-z0-9]*\b/gi,
    "partybox$1",
  );
  name = name.replace(/\bpartybox\s*(\d{2,4})[a-z]{2,6}\b/gi, "partybox$1");
  name = name.replace(/\bpb(\d{2,4})[a-z]{2,6}\b/gi, "partybox$1");
  name = name.replace(/\bbar(\d{3,4})[a-z]{2,6}\b/gi, "bar$1");
  // Strip JBL / Harman SKU suffixes: "FLIP7-SQD" → "FLIP7", "GOPLAY3-GY" → "GOPLAY3"
  name = name.replace(
    /\b(flip|clip|charge|go|xtreme|pulse|boombox|tuner|partybox|goplay)(\d{1,3})-[a-z]{2,5}\b/gi,
    "$1$2",
  );
  // Strip redundant "AUTH200-BLK" style SKU/color codes entirely — the
  // canonical "Authentics 200" name and color word already appear
  // elsewhere in the title, so this code is pure duplicate noise.
  name = name.replace(/\bauth\d{2,4}-[a-z]{2,5}\b/gi, "");
  // Decode JBL's internal "Stage" SKU naming for PartyBox: "PARTYBOX
  // STAGE320EP" is the same retail product as "PartyBox 320".
  name = name.replace(/\bpartybox\s*stage\s*(\d{2,4})[a-z]*\b/gi, "partybox$1");
  return name;
}

export function normalizeName(raw) {
  let name = raw.toLowerCase().trim();

  // Hardcoded eSIM case: Xiaomi Redmi Pad 2 8GB/256GB (2025) is eSIM-only.
  // All other Redmi Pad 2 listings include an explicit SIM indicator (Nano-Sim
  // / 4G) so this pattern only fires when none is present.
  if (
    /\bredmi\s+pad\s+2\b/i.test(name) &&
    /8gb.*?256gb/i.test(name) &&
    /\(2025\)/.test(name) &&
    !/nano[\s-]?sim|e[\s-]?sim|4g|5g|lte|cellular/i.test(name)
  ) {
    name = name
      .replace(/\(2025\)/, "")
      .replace(/\s+/g, " ")
      .trim();
    name = name + " (eSIM)";
  }

  name = decodeSpeakerSkus(name);

  if (/\bpartybox\s*ultimate\b/i.test(name)) {
    name = name
      .replace(/\bwi[\s-]?fi\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  let connectivity = extractConnectivity(name);

  const isSpeakerBrand = SPEAKER_BRAND_REGEX.test(name);

  if (/\bgalaxy\s*s26\b/.test(name) || isSpeakerBrand) {
    connectivity = null;
  }

  // 1. Normalize Russian GB: "256 ГБ" -> "256gb"
  name = name.replace(/(\d+)\s*гб/gi, "$1gb");

  // 1b. Strip Armenian "Սmарт հeռախoս" / "Սмарθ հeռaxos" store prefix (Vega)
  name = name.replace(/^սмарт\s+հeռaxos\s+/i, "");
  name = name.replace(/^[\u0531-\u058f][\u0531-\u058f\s]*(?=[a-z])/i, "");

  // 2. Strip "Apple" brand prefix
  name = name.replace(/^apple\s+/, "");
  name = name.replace(/\bwi[\s-]?fi\s*\+\s*cellular\b/gi, "cellular");

  // 2a. Normalize compacted model numbers: "magic8" -> "magic 8", "magic7" -> "magic 7"
  name = name.replace(/\b(magic)(\d+)\b/gi, "$1 $2");

  // 2b. Normalize Plus variants: "Pro+" / "Pro Plus" / "Pro +" → "pro plus"
  name = name.replace(/\bfold\s*(\d{1,2})\b/gi, "fold$1");
  name = name.replace(/\bwatch\s*(\d{1,2})\b/gi, "watch$1");
  name = name.replace(/\bfit\s*(\d{1,2})\b/gi, "fit$1");
  name = name.replace(/\bse\s*(\d{1,2})\b/gi, "se$1");
  name = name.replace(/\bbuds\s*(\d{1,2})\b/gi, "buds$1");

  name = name.replace(/\bcharge\s*(\d{1,2})\b/gi, "charge$1");
  name = name.replace(/\bclip\s*(\d{1,2})\b/gi, "clip$1");
  name = name.replace(/\bflip\s*(\d{1,2})\b/gi, "flip$1"); // JBL Flip AND Samsung Z Flip share this rule, both benefit
  name = name.replace(/\bgo\s*(\d{1,2})\b/gi, "go$1");
  name = name.replace(/\bxtreme\s*(\d{1,2})\b/gi, "xtreme$1");
  name = name.replace(/\bpulse\s*(\d{1,2})\b/gi, "pulse$1");
  name = name.replace(/\bpartybox\s*club\s*(\d{1,3})\b/gi, "partybox$1");
  name = name.replace(/\bpartybox\s*(\d{1,3})\b/gi, "partybox$1");
  name = name.replace(/\bparty\s*box\b/gi, "partybox");
  name = name.replace(/\bpartybox\s*encore\s*essential\b/gi, "partybox encore");
  name = name.replace(/\bauthentics\s*(\d{1,3})\b/gi, "authentics$1");
  // Protect "onyx studio" from being stripped as a color by compacting early
  name = name.replace(/\bonyx\s*studio\s*(\d{1,2})\b/gi, "onyxstudio$1");
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
  // Normalize Marshall model word-order variations (e.g. "Marshall II Willen" -> "Marshall Willen II")
  name = name.replace(
    /\bmarshall\s+(i{1,3}|iv|v)\s+(willen|emberton|acton|stanmore|middleton|stockwell|woburn|tufton|kilburn)\b/gi,
    "marshall $2 $1",
  );
  const ROMAN_TO_DIGIT = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };
  name = name.replace(
    /\b(willen|emberton|acton|stanmore|middleton|stockwell|woburn|tufton|kilburn)\s+(i{1,3}|iv|v)\b/gi,
    (m, model, numeral) => `${model} ${ROMAN_TO_DIGIT[numeral.toLowerCase()]}`,
  );
  // Strip manufacture year mentions (e.g. "SE 2024", "SE2 2024") — the
  // generation number already conveys this, and different stores are
  // inconsistent about whether they include the year at all.
  // Normalize iPad size descriptors: "11.0"" or "(11.0")" → "11", "13.0" → "13", "11inch" → "11", etc.
  name = name.replace(/\(\s*(\d{2})(?:\.0)?[""″]?\s*\)/gi, "$1");
  name = name.replace(/\b(\d{2})(?:\.0)?[""″"](?=\s|$)/gi, "$1");
  name = name.replace(/\b(\d{2})\s*inch\b/gi, "$1");

  name = name.replace(/\bipad\s+11\s+air\b/gi, "ipad air 11");
  name = name.replace(/\bipad\s+13\s+air\b/gi, "ipad air 13");
  name = name.replace(/\bipad\s*mini\s*\(?2024\)?/gi, "ipad mini 7");
  name = name.replace(/\bipad\s*mini\s*\(?2021\)?/gi, "ipad mini 6");
  if (name.includes("ipad") || name.includes("macbook")) {
    // Before stripping the chip token, derive the release year from it so
    // products that carry only a chip label (no explicit year) still resolve
    // to the correct year-group.  The mapping is intentionally model-aware
    // because the same chip generation shipped in different calendar years
    // across different iPad lines (e.g. M2 = 2022 for Pro, 2024 for Air).
    if (name.includes("ipad") && !/\b(19|20)\d{2}\b/.test(name)) {
      const chipMatch = name.match(/\bm(\d{1,2})\b/i);
      if (chipMatch) {
        const gen = parseInt(chipMatch[1], 10);
        let year = null;
        if (name.includes("ipad pro")) {
          // iPad Pro chip → year: M1=2021, M2=2022, M4=2024, M5=2025
          const proMap = { 1: "2021", 2: "2022", 4: "2024", 5: "2025" };
          year = proMap[gen] ?? null;
        } else if (name.includes("ipad air")) {
          // iPad Air chip → year: M1=2022, M2=2024, M3=2025
          const airMap = { 1: "2022", 2: "2024", 3: "2025" };
          year = airMap[gen] ?? null;
        } else if (name.includes("ipad mini")) {
          // iPad mini chip → year: A15=2021 handled elsewhere, no M-chip minis yet
          year = null;
        }
        if (year) name = name + " " + year;
      }
    }
    name = name.replace(/\b[am]\d{1,2}\s*(chip)?\b/gi, "");
  }
  if (!isIpadName(name)) {
    name = name.replace(/\b(19|20)\d{2}\b/g, "");
  }
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
    if (/active\s*nc|active\s+noise\s+cancellation/i.test(inner))
      tokens.push("anc");
    const yearMatch = inner.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) tokens.push(yearMatch[0]);
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
  name = name.replace(/\bbundle\b/gi, "");
  name = name.replace(/\bwith\s+cover\b/gi, "cover");
  name = name.replace(/\s+/g, " ").trim();

  name = name.replace(/\bgps\b/gi, "");
  name = name.replace(/\bgear\b/gi, "");
  name = name.replace(/\b(aluminium|titanium|stainless steel)\s+case\b/gi, "");
  name = name.replace(/\bcase\b/gi, "");
  name = name.replace(/\bwith\s+.*?(band|loop)\b/gi, "");
  name = name.replace(
    /\b(?:[a-z]+\s+)?(sport|ocean|trail|alpine|milanese)\s+(band|loop)\b/gi,
    "",
  );
  name = name.replace(/\bs\/m\b/gi, "");
  name = name.replace(/\bm\/l\b/gi, "");

  for (const color of MULTIWORD_COLORS) {
    name = name.replace(wordBoundaryRegex(color), " ");
  }
  for (const color of COLORS) {
    // Don't strip "onyx" when it's part of "onyxstudio" (already compacted)
    if (color === "onyx" && /\bonyxstudio\d/i.test(name)) continue;
    name = name.replace(wordBoundaryRegex(color), " ");
  }

  for (const color of Object.keys(ARMENIAN_COLORS)) {
    name = name.replace(wordBoundaryRegex(color), " ");
  }

  name = name.replace(/\bband\b(?!\s*\d)/gi, "");
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/\bband\s*(\d{1,2})\b/gi, "band$1");

  // 9. Remove connectivity suffixes (NOT esim/nanosim)
  for (const conn of CONNECTIVITY) {
    name = name.replace(wordBoundaryRegex(conn), "");
  }

  // 9b. Strip "dual" prefix before esim (e.g. "Dual eSIM" -> "esim")
  name = name.replace(/\bdual\s+(?=esim)/gi, "");

  // 9c. Strip vendor model codes BEFORE punctuation normalization
  //     so hyphens inside codes (ABR-LX1) are still intact.
  name = name.replace(/\b[a-z]{2,4}-[a-z]{1,3}\d{1,2}\b/gi, ""); // ABR-LX1 style
  name = name.replace(/\b[a-z]{2,4}\d{4,6}\b/gi, ""); // CPH2653 / RMX3461 style
  name = name.replace(/\b\d{7,}[a-z0-9]{0,4}\b/gi, ""); // Numeric product IDs (5011110325)
  name = name.replace(/\b\d{4}[a-z]{2,4}\b/gi, ""); // 5109BQCR style
  name = name.replace(/\s+/g, " ").trim();

  // 10. Clean punctuation and whitespace
  name = name
    .replace(/[,\-_\/\\&+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  name = name.replace(
    /\b(lte|gsm|hspa|umts|cdma|nanosim|dualsim|cellular)\b/gi,
    "cellular",
  );
  // A cellular tablet/phone always has wifi too — drop redundant "wifi",
  // "5g", and "lte" tokens so they don't fragment the match key.
  // e.g. "5g cellular" and "cellular" must produce the same key.
  if (/\bcellular\b/.test(name)) {
    name = name
      .replace(/\bwifi\b/g, "")
      .replace(/\b5g\b/g, "")
      .replace(/\blte\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  name = name.replace(/\b(cellular\s+)+cellular\b/gi, "cellular");

  // Strip vendor SKU/model codes that only some stores include
  // (Samsung "X133", "X230"...; Apple "MXNA3", "MD3Y4"...). Guarded by
  // length + mixed letter/digit check so it never touches real model
  // identifiers like "a11", "s10", or Apple chip names "m3"/"m4"/"m5".
  name = name.replace(/\b(cf|cn)\b/gi, "");
  name = name.replace(/\bsm[\s-]?[a-z0-9]{3,6}\b/gi, "");
  name = name.replace(/\bbhr\d{4,5}[a-z0-9]*\b/gi, "");
  // Strip Honor / OnePlus model codes: ABR-LX1, CPH2653, RMX3461, etc.
  // Handle hyphenated codes like ABR-LX1 (dash breaks word boundaries)
  name = name.replace(/\b[a-z]{2,4}-[a-z]{1,3}\d{1,2}\b/gi, ""); // ABR-LX1 style
  name = name.replace(/\b[a-z]{2,4}\d{4,6}\b/gi, ""); // CPH2653 style
  // Strip numeric-only barcodes / product IDs (5109BQCR, 5011110325)
  name = name.replace(/\b\d{7,}[a-z]{0,4}\b/gi, "");
  name = name.replace(/\b\d{4}[a-z]{2,4}\b/gi, ""); // 5109BQCR style
  // Deduplicate repeated storage tokens (e.g. "8gb 256gb 8gb 256gb" -> "8gb 256gb")
  name = name
    .replace(/((?:\d+(?:gb|tb)\s+)+)\1+/gi, (m, g1) => g1.trimEnd() + " ")
    .trim();
  name = name.replace(/\b(\d+gb)\s+(\d+gb)\s+\1\s+\2\b/gi, "$1 $2");
  name = name.replace(/\b[a-z][a-z0-9]{3,9}\b/gi, (tok) => {
    const hasDigit = /\d/.test(tok);
    const hasLetter = /[a-z]/i.test(tok);
    if (!hasDigit || !hasLetter) return tok;
    if (
      /^(iphone|ipad|macbook|galaxy|band|watch|fit|buds|airpods|redmi|poco|pixel|dyson|fold|flip|se|tab|magic|zenfone|nord|cmf)\d+/i.test(
        tok,
      )
    )
      return tok;
    // Whitelist speaker model tokens so they survive this filter
    if (
      /^(clip|charge|xtreme|pulse|boombox|tuner|authentics|partybox|goplay|aurastudio|onyxstudio|soundsticks|luna|citation|grip|bar)\d+/i.test(
        tok,
      )
    )
      return tok;
    if (
      /^(m1|m2|m3|m4|m5|a15|a16|a17|a18|a19|s24|s25|s26|a14|a15|a16|a17|a34|a35|a36|a37|a54|a55|a56|a57|4g|5g)$/i.test(
        tok,
      )
    )
      return tok;
    return "";
  });
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(
    /\bwatch\s+(\d{1,2}mm)\s+series\s*(\d{1,2})\b/gi,
    "watch series$2 $1",
  );
  if (/\bwatch\s+ultra\b/i.test(name)) {
    name = name.replace(/\b\d{2}mm\b/gi, "");
  }
  name = name.replace(/\boriginal\s+/gi, "");
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
  name = name.replace(/\bwifi\s+bluetooth\b/gi, "");
  name = name.replace(/\bbluetooth\b/gi, "");
  name = name.replace(/\bbt\b/gi, "");
  name = name.replace(/\bwaterproof\b/gi, "");
  name = name.replace(/\bsplash\s*proof\b/gi, "");
  name = name.replace(/\bsplas\s*proof\b/gi, ""); // allsell's typo variant
  name = name.replace(/\bwith\s+battery\b/gi, "");
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/\bsplashproof\b/gi, "");
  name = name.replace(/\bwith\s+(dual\s+)?mic(rophone)?\b/gi, "");
  name = name.replace(/\bmic(rophone)?\b/gi, ""); // standalone "Mic" / "Microphone"
  name = name.replace(/\bspeaker\s*system\b/gi, "");
  name = name.replace(/\blight\s*stick\b/gi, "");
  name = name.replace(/\bmultibeam\b/gi, "");
  name = name.replace(/\bdolby\s*atmos\b/gi, "");
  name = name.replace(/\bsurround\b/gi, "");
  name = name.replace(/\bcompact\b/gi, ""); // marketing word, not model-specific
  name = name.replace(/\bcompact\s*tv\s*speaker\b/gi, "");
  name = name.replace(/\b\d\.\d\b/g, ""); // strip "5.1" soundbar channel counts
  name = name.replace(/\bbk\b/gi, ""); // abbreviation for "Black"

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

  if (!isSpeakerBrand) {
    name = stripConnectivityWords(name);
  }
  if (connectivity) name = `${name} ${connectivity}`;

  const isAirpodsCaseOnly =
    /\bairpods\b/i.test(name) &&
    /\bcase\b/i.test(name) &&
    !/\bwith\b.*\bcase\b/i.test(name);
  if (isAirpodsCaseOnly) name += " caseonly";

  // Deduplicate repeated word tokens (e.g. "flip7 flip7" -> "flip7", "goplay3 goplay3" -> "goplay3")
  const uniqueTokens = [];
  for (const token of name.split(" ")) {
    if (token && !uniqueTokens.includes(token)) {
      uniqueTokens.push(token);
    }
  }
  name = uniqueTokens.join(" ");

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
  const seenSim = new Set();
  const simTokens = [];
  const storageTokens = [];
  const otherTokens = [];

  for (const token of name.split(" ")) {
    if (/^\d+(gb|tb|mm)$/i.test(token)) storageTokens.push(token);
    else if (
      ["esim", "nanosim", "dualsim", "wifi", "lte", "5g", "cellular"].includes(
        token,
      )
    ) {
      if (!seenSim.has(token)) {
        simTokens.push(token);
        seenSim.add(token);
      }
    } else otherTokens.push(token);
  }

  return [...otherTokens, ...storageTokens, ...simTokens].join(" ");
}

function getMatchKey(key) {
  const cleaned = key
    .replace(/\s+nanosim\b/g, "")
    .replace(/\s+esim\b/g, "")
    .replace(/\s+dual\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (isIpadName(cleaned) || SPEAKER_BRAND_REGEX.test(cleaned)) {
    return cleaned;
  }

  return cleaned.replace(/\s+cellular\b/g, "").replace(/\s+wifi\b/g, "");
}

function getBaseKey(key) {
  if (isIpadName(key)) {
    return getIpadBaseKey(getMatchKey(key));
  }

  const hasStorage = /\d+(gb|tb)/i.test(key);
  if (hasStorage) {
    return getMatchKey(key);
  } else {
    return stripStorage(getMatchKey(key));
  }
}

function resolveIpadGroupKey(key, groups, currentPrice) {
  const base = getIpadBaseKey(getMatchKey(key));
  const explicitConnectivity = getIpadConnectivityToken(key) ?? "wifi";
  const explicitYear = getIpadYearToken(key);

  const candidates = [];
  for (const [candidateKey, group] of groups) {
    const candidateBase = getIpadBaseKey(getMatchKey(candidateKey));
    if (candidateBase !== base) continue;

    const candidateConnectivity =
      getIpadConnectivityToken(candidateKey) ?? "wifi";
    if (candidateConnectivity !== explicitConnectivity) continue;

    const candidateYear = getIpadYearToken(candidateKey);
    if (explicitYear && candidateYear && candidateYear !== explicitYear) {
      continue;
    }

    const candidatePrice = Object.values(group.sources).find(
      (entry) => entry.cash_price != null,
    )?.cash_price;
    if (candidatePrice == null) continue;

    candidates.push({ candidateKey, candidatePrice });
  }

  if (!candidates.length) {
    return explicitYear
      ? `${base} ${explicitConnectivity} ${explicitYear}`
      : `${base} ${explicitConnectivity}`;
  }

  let best = candidates[0];
  let bestDiff = Math.abs(best.candidatePrice - (currentPrice ?? 0));
  for (const candidate of candidates.slice(1)) {
    const diff = Math.abs(candidate.candidatePrice - (currentPrice ?? 0));
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  return best.candidateKey;
}

function extractSamsungTabCode(rawName) {
  if (!/\bgalaxy\s*tab\b/i.test(rawName)) return null;
  const match = rawName.match(/\b(x\d{3}[a-z]?)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function hasExplicitConnectivityToken(key) {
  return /\b(cellular|esim|nanosim|dualsim|lte|5g|wifi)\b/i.test(key);
}

function resolveProductGroupKey(key, itemsOfBase, productPrice) {
  if (itemsOfBase.length <= 1) {
    return itemsOfBase[0].key;
  }

  // Count distinct variants by connectivity
  const distinctKeys = Array.from(new Set(itemsOfBase.map((i) => i.key)));
  if (distinctKeys.length === 1) {
    return distinctKeys[0];
  }

  // Check if there are distinct explicit connectivity variants
  const connVariants = distinctKeys.filter((k) =>
    hasExplicitConnectivityToken(k),
  );

  if (connVariants.length >= 2) {
    // There are multiple variants with explicit connectivity info.
    // Pick the variant whose average/first price is closest to productPrice.
    let bestKey = distinctKeys[0];
    let minDiff = Infinity;

    for (const candKey of distinctKeys) {
      const candItems = itemsOfBase.filter((i) => i.key === candKey);
      for (const item of candItems) {
        if (item.product.cash_price != null && productPrice != null) {
          const diff = Math.abs(item.product.cash_price - productPrice);
          if (diff < minDiff) {
            minDiff = diff;
            bestKey = candKey;
          }
        }
      }
    }
    return bestKey;
  }

  // If there are not multiple explicit variants, collapse/match with the main key
  return distinctKeys[0];
}

export function groupByNormalizedName(allProducts) {
  const groups = new Map();

  const items = allProducts.map((p) => ({
    product: p,
    key: isYerevanMobileAirpodsProCaseBug(p)
      ? `${normalizeName(p.name)} caseonly`
      : normalizeName(p.name),
    samsungCode: extractSamsungTabCode(p.name),
  }));

  // Group items by base key for connectivity resolution
  const itemsByBase = new Map();
  for (const item of items) {
    const base = getBaseKey(item.key);
    if (!itemsByBase.has(base)) itemsByBase.set(base, []);
    itemsByBase.get(base).push(item);
  }

  // Map Samsung model codes (e.g. "x526") to the first canonical key that introduced it
  const samsungCodeToCanonical = new Map();
  for (const { key, samsungCode } of items) {
    if (samsungCode && !samsungCodeToCanonical.has(samsungCode)) {
      samsungCodeToCanonical.set(samsungCode, key);
    }
  }

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

  for (const { product, key, samsungCode } of items) {
    let groupKey;
    if (samsungCode && samsungCodeToCanonical.has(samsungCode)) {
      groupKey = samsungCodeToCanonical.get(samsungCode);
    } else if (isIpadName(key)) {
      groupKey = resolveIpadGroupKey(key, groups, product.cash_price);
    } else {
      const base = getBaseKey(key);
      const itemsOfBase = itemsByBase.get(base) || [];
      groupKey = resolveProductGroupKey(key, itemsOfBase, product.cash_price);
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { normalized: groupKey, sources: {} });
    }

    const group = groups.get(groupKey);
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

function isYerevanMobileAirpodsProCaseBug(product) {
  return (
    product.source === "yerevanmobile" &&
    /^airpods\s*pro\s*3\b/i.test(product.name.trim())
  );
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
  const filtered = tokens.filter((t) => {
    if (isIpadName(key)) {
      return !["nanosim", "dual"].includes(t.toLowerCase());
    }
    return t !== "cellular";
  });

  return filtered.join(" ").replace(/\s+/g, " ").trim();
}

export function getStorageLabel(key) {
  // Returns "12GB/256GB" for Android, "256GB" for Apple, or null.
  return getTrailingStorageRun(key).label;
}
