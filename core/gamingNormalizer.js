export function normalizeGamingName(raw) {
  let name = raw.toLowerCase();

  name = name.replace(/\bsony\s+playstation\b/gi, "ps");
  name = name.replace(/\bplaystation\b/gi, "ps");
  name = name.replace(/\bsony\s+ps/gi, "ps");
  name = name.replace(/\bsony\s+playstation\b/gi, "ps");
  name = name.replace(/\bplaystation\b/gi, "ps");
  name = name.replace(/\bsony\s+ps\b/gi, "ps");
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
  name = name.replace(/\(slim\)/gi, "");
  name = name.replace(/\bբաժ\.?\s*քարտ\b/gi, "");

  // ── Nintendo Switch: keep game bundles as distinct products, strip colors ──
  if (/\bnintendo\s*switch\b/.test(name)) {
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
    .replace(/[(),+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return name;
}
