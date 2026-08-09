export function normalizeGamingName(raw) {
  let name = raw.toLowerCase();

  name = name.replace(/\bsony\b/gi, "");
  name = name.replace(/\bplaystation\b/gi, "ps");
  name = name.replace(/\bps\s*5\b/gi, "ps5"); // unify "ps 5" / "playstation 5" spacing

  // Strip storage capacity — not consistently reported across sites.
  name = name.replace(/\b\d+\s*(gb|tb)\b/gi, "");

  // Strip bundle/pack/game-bundle suffixes and region codes.
  name = name.replace(/\bny26\s*pack\b/gi, "");
  name = name.replace(/\bmega\s*bundle\b/gi, "");
  name = name.replace(/\bfcgt\s*pack\s*\d*\b/gi, "");
  name = name.replace(/\bgame\s*pack\b/gi, "");
  name = name.replace(/\+\s*games?\b/gi, "");
  name = name.replace(/\+\s*fifa\s*\d*\b/gi, "");
  name = name.replace(/\(eu\)/gi, "");
  name = name.replace(/\beu\b/gi, "");
  name = name.replace(/\bd\s*chassis\b/gi, "");
  name = name.replace(/\bբաժ\.?\s*քարտ\b/gi, "");
  name = name.replace(/խաղային\s*համակարգ/gi, ""); // Armenian "gaming system" — generic descriptor noise

  // Filler/marketing connective words that carry no product-distinguishing info.
  name = name.replace(/\bconsole\b/gi, "");
  name = name.replace(/\bwith\b/gi, "");
  name = name.replace(/\band\b/gi, "");
  name = name.replace(/joy[\u2010-\u2015-]?con/gi, ""); // "Joy-Con"/"Joy‑Con"/"Joycon" bundle noise

  // ── PS5: canonicalize edition, drop default-state "disc" noise, strip colors ──
  if (/\bps5\b/.test(name)) {
    // "Disc"/"Disc Version"/"Disc Edition" is the default state (absence of
    // "Digital" implies disc) — normalize it away so labelled and
    // unlabelled disc listings match each other.
    name = name.replace(/\bdisc\s*(version|edition)?\b/gi, "");

    // Canonicalize "Digital Edition" (and typos) down to "digital" — this
    // IS a distinct SKU (no disc drive), just strip the inconsistent
    // "edition" suffix so "Digital Edition" and "Digital" line up.
    name = name.replace(/\bdigital\s*ed(i?t)+ion\b/gi, "digital");

    // Strip cosmetic colors — not a different product/price tier.
    name = name.replace(
      /\b(black|white|grey|gray|red|blue|pink|green|yellow|purple|midnight)\b/gi,
      "",
    );

    // Some source titles mention "PS5" twice (e.g. "Sony Playstation 5 PS5
    // Disc Version ...") — collapse the duplicate.
    name = name.replace(/\b(ps5)(\s+\1\b)+/gi, "$1");
  }

  // ── Nintendo Switch: keep game bundles as distinct products, strip colors ──
  if (/\bnintendo\s*switch\b/.test(name)) {
    // "V2" is just alternate notation for "2" (same console generation).
    name = name.replace(/\bv2\b/gi, "2");

    if (/\bswitch\s*2\b/.test(name)) {
      name = name.replace(
        /\bmario\b(?!\s*(kart|party|odyssey|wonder|bros|galaxy))/gi,
        "mario kart world",
      );
    }

    // Normalize game bundle names to canonical forms (these ARE distinct products)
    name = name.replace(/\bmario\s*kart\s*world\b/gi, "mario kart world");
    name = name.replace(/\bgame\b/gi, "");
    // Strip colors (cosmetic only, not a different product)
    name = name.replace(
      /\b(black|white|grey|gray|red|blue|pink|green|yellow|neon|purple|coral|turquoise)\b/gi,
      "",
    );
    name = name.replace(/[&]/g, " ");
  }

  // ── Xbox: strip colors, SSD, Digital Edition (incl. typos) ──
  if (/\bxbox\b/.test(name)) {
    name = name.replace(/\bdigital\s*ed(i?t)+ion\b/gi, "digital edition");
    name = name.replace(/\bssd\b/gi, "");
    name = name.replace(
      /\b(black|white|grey|gray|red|blue|green|yellow|purple)\b/gi,
      "",
    );
  }

  name = name
    .replace(/[(),+/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return name;
}
