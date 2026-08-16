
const SEP = '\\D{0,3}';

// Model-code tail: digits, optionally followed by up to 3 more
// alphanumeric chars — covers plain suffixes ("155H", "13700H") AND
// letter+digit suffixes ("1165G7", where G7 denotes the iGPU tier).
const MODEL_TAIL = '[A-Z0-9]{0,3}';

const PATTERNS = [
  // Apple M-series: "M4", "M3 Pro", "M2 Max", "M1 Ultra"
  {
    name: 'apple',
    regex: /\bM([1-4])\s*(Pro|Max|Ultra)?\b/i,
    build: (m) => `Apple M${m[1]}${m[2] ? ' ' + capitalize(m[2]) : ''}`,
    confidence: 'high',
  },

  // Intel Core Ultra: "Core Ultra 7 - 155H", "Ultra 7 355" + letter suffix
  {
    name: 'intel_core_ultra',
    regex: new RegExp(`(?:Core\\s*)?Ultra\\s*([3579])${SEP}(\\d{3}${MODEL_TAIL})`, 'i'),
    build: (m) => `Intel Core Ultra ${m[1]}-${m[2].toUpperCase()}`,
    confidence: 'high',
  },

  // AMD Ryzen AI: "Ryzen AI 7 350", "AI 7 350"
  {
    name: 'amd_ryzen_ai',
    regex: new RegExp(`(?:Ryzen\\s*)?AI\\s*([3579])${SEP}(\\d{3})\\b`, 'i'),
    build: (m) => `AMD Ryzen AI ${m[1]} ${m[2]}`,
    confidence: 'high',
  },

  // Legacy Intel Core i-series: "i5-1334U", "I7 - 13620H", "i7 1165G7"
  {
    name: 'intel_legacy',
    regex: new RegExp(`\\bi([3579])${SEP}(\\d{4,5}${MODEL_TAIL})\\b`, 'i'),
    build: (m) => `Intel Core i${m[1]}-${m[2].toUpperCase()}`,
    confidence: 'high',
  },

  // New Intel "Core 3/5/7" (no "i", no "Ultra") — 2024+ rebrand,
  // model code can start with "N" (budget N-series under this tier)
  {
    name: 'intel_core_no_i',
    regex: new RegExp(`\\bCore\\s*([3579])${SEP}(N?\\d{2,3}${MODEL_TAIL})\\b`, 'i'),
    build: (m) => `Intel Core ${m[1]}-${m[2].toUpperCase()}`,
    confidence: 'high',
  },

  // Bare Intel N-series, no tier prefix — "N100"..."N355" (3-digit,
  // newer Alder Lake-N/Twin Lake) AND "N4020"/"N4100"/"N4500" (4-digit,
  // older Gemini/Jasper Lake). Store may prefix with an unrelated fake
  // tier label like "Celeron"/"Core i3" — the N-code is ground truth.
  {
    name: 'intel_n_series',
    regex: /\bN(\d{3,4})\b/,
    build: (m) => `Intel N${m[1]}`,
    confidence: 'high',
  },

  // Qualcomm Snapdragon X — laptop ARM chips. Core-count wording is
  // optional ("Snapdragon X Plus" alone is valid, no "8 Core" needed).
  {
    name: 'qualcomm_snapdragon_x',
    regex: /Snapdragon\s*X(\d*)\s*(Elite|Plus)?(?:\D{0,15}?(\d+)\s*Core)?/i,
    build: (m) => {
      const variant = m[1] || ''; // e.g. "1" in "X1 Elite"
      const tier = m[2] ? ' ' + capitalize(m[2]) : '';
      const cores = m[3] ? ` ${m[3]} Core` : '';
      return `Qualcomm Snapdragon X${variant}${tier}${cores}`;
    },
    confidence: 'high',
  },

  // AMD Athlon (budget chips, e.g. "Athlon Silver 7120U")
  {
    name: 'amd_athlon',
    regex: /Athlon\s*(Silver|Gold)?\s*(\d{3,4}[A-Z]{0,2})/i,
    build: (m) => `AMD Athlon${m[1] ? ' ' + capitalize(m[1]) : ''} ${m[2].toUpperCase()}`,
    confidence: 'high',
  },

  // Legacy AMD Ryzen: "Ryzen 7 7735HS", "Ryzen 5 5500U"
  {
    name: 'amd_ryzen_legacy',
    regex: new RegExp(`Ryzen\\s*([3579])${SEP}(\\d{3,4}${MODEL_TAIL})\\b`, 'i'),
    build: (m) => `AMD Ryzen ${m[1]} ${m[2].toUpperCase()}`,
    confidence: 'high',
  },

  // Malformed/truncated model numbers, e.g. "Ryzen 5 40" — not a real
  // AMD laptop chip (all real ones are 3-4 digits). Likely bad source
  // data (missing digits). Still tag brand+tier so it's at least
  // groupable, but flag for manual review rather than trusting it.
  {
    name: 'amd_ryzen_malformed',
    regex: /Ryzen\s*([3579])\D{0,3}(\d{1,2})\b(?!\d)/i,
    build: (m) => `AMD Ryzen ${m[1]} ${m[2]}`,
    confidence: 'guessed',
  },

  // Ambiguous bare "Ultra 7 355" with NO "Core"/"Ryzen"/"AI" keyword —
  // guess brand from suffix shape (letter suffix -> Intel; bare digits
  // -> AMD Ryzen AI) and flag as 'guessed'.
  {
    name: 'ambiguous_ultra',
    regex: new RegExp(`\\bUltra\\s*([3579])${SEP}(\\d{3}${MODEL_TAIL})\\b`, 'i'),
    build: (m) => {
      const hasLetterSuffix = /[A-Z]/i.test(m[2].slice(-2));
      return hasLetterSuffix
        ? `Intel Core Ultra ${m[1]}-${m[2].toUpperCase()}`
        : `AMD Ryzen AI ${m[1]} ${m[2]}`;
    },
    confidence: 'guessed',
  },
];

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function canonicalizeCpuRegex(raw) {
  if (!raw) return null;
  let cleaned = String(raw).replace(/[®™]/g, '').trim();

  // "Al 5 340" -> "AI 5 340": common font/scrape artifact where capital
  // "I" renders/copies as lowercase "l".
  cleaned = cleaned.replace(/\bAl(\s+[3579]\b)/i, 'AI$1');

  for (const pattern of PATTERNS) {
    const m = cleaned.match(pattern.regex);
    if (m) {
      return { canonical: pattern.build(m), confidence: pattern.confidence };
    }
  }

  return null;
}