function isModelToken(token) {
  if (token.length < 4) return false;
  const hasLetter = /[A-Z]/i.test(token);
  const hasDigit = /\d/.test(token);
  return (hasLetter && hasDigit) || /^\d{4,}$/.test(token);
}

const STOPWORDS = new Set([
  'INCH', 'LAPTOP', 'NOTEBOOK', 'GAMING', 'SERIES', 'GEN', 'GENERATION',
]);

/**
 * @param {string} name - raw product title
 * @returns {string[]} normalized (uppercased) candidate model tokens
 */
export function extractModelTokens(name = '') {
  const tokens = name
    .toUpperCase()
    .match(/[A-Z0-9][A-Z0-9-]{2,}/g) || [];

  return tokens
    .filter((t) => !STOPWORDS.has(t))
    .filter(isModelToken)
    .map((t) => t.replace(/^-+|-+$/g, '')); // trim stray leading/trailing hyphens
}

/**
 * True if the two token sets share at least one identifier.
 * Returns false (not "unknown") if either side has zero tokens —
 * caller should treat that case separately (can't confirm OR deny).
 */
export function sharesModelToken(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return null; // can't evaluate
  const setB = new Set(tokensB);
  return tokensA.some((t) => setB.has(t));
}