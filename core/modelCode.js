export function extractModelCode(name) {
  if (!name) return null;
  const upper = name.toUpperCase();

  const candidateRegex = /\b[A-Z0-9]{5,10}(?:\/[A-Z0-9]{1,2})?\b/g;
  const candidates = upper.match(candidateRegex) || [];

  for (let token of candidates) {
    if (/^\d+(GB|TB|MB|SSD|RAM|INCH)$/.test(token)) continue;
    if (!/\d/.test(token)) continue;
    if (!/[A-Z]/.test(token)) continue;

    let clean = token.replace(/[\/-]?(RU|LL|UA|US|EU|ZP|HN|AB|B|CH|A)(\/[A-Z])?$/i, "");
    clean = clean.replace(/[\/-][A-Z]$/i, "");

    const mpnMatch = clean.match(/^([M][A-Z0-9]{4})/);
    if (mpnMatch) {
      return mpnMatch[1];
    }

    if (/^[Z\d][A-Z0-9]{6,9}$/.test(clean)) {
      return clean;
    }

    if (clean.length === 5) {
      return clean;
    }
  }

  const altMatch = upper.match(/\b([A-Z0-9]{5})\b/);
  if (altMatch) {
    const token = altMatch[1];
    if (/\d/.test(token) && /[A-Z]/.test(token) && !/^\d+(GB|TB)$/.test(token)) {
      return token;
    }
  }

  return null;
}