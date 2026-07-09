const CODE_CANDIDATE_REGEX = /\b[A-Z0-9]{5}\b/g;

export function extractModelCode(name) {
  if (!name) return null;
  const upper = name.toUpperCase();
  const candidates = upper.match(CODE_CANDIDATE_REGEX) || [];

  for (const token of candidates) {
    if (/^\d+(GB|TB|MB)$/.test(token)) continue; // storage size, e.g. "256GB"
    if (!/\d/.test(token)) continue;              // pure word, e.g. "BLACK", "BLUSH"
    if (!/[A-Z]/.test(token)) continue;           // pure digits, unlikely but safe
    return token;
  }

  return null;
}