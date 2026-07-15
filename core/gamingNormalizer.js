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
  name = name.replace(/\bmario\s*kart\s*world\s*(game)?\b/gi, "");
  name = name.replace(/\(eu\)/gi, "");
  name = name.replace(/\beu\b/gi, "");
  name = name.replace(/\bd\s*chassis\b/gi, "");
  name = name.replace(/\(slim\)/gi, "");
  name = name.replace(/\bբաժ\.?\s*քարտ\b/gi, "");

  name = name
    .replace(/[(),+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return name;
}
