const PATTERNS = [
  // NVIDIA RTX workstation/Ada series with letter+number model, e.g.
  // "RTX A500" — different naming from consumer RTX (must come before
  // the generic RTX/GTX pattern below, since that requires digits only).
  {
    name: 'nvidia_rtx_workstation',
    regex: /\bRTX\s*(A\d{3,4})/i,
    build: (m) => `NVIDIA RTX ${m[1].toUpperCase()}`,
    confidence: 'high',
  },

  // NVIDIA consumer RTX/GTX, e.g. "RTX 4060 8GB", "GeForce RTX 4090"
  {
    name: 'nvidia_rtx_gtx',
    regex: /\b(RTX|GTX)\s*(\d{3,4})\s*(Ti)?/i,
    build: (m) => `NVIDIA ${m[1].toUpperCase()} ${m[2]}${m[3] ? ' Ti' : ''}`,
    confidence: 'high',
  },

  // NVIDIA MX-series (entry-level laptop GPUs), e.g. "GeForce MX450 2GB"
  {
    name: 'nvidia_mx',
    regex: /(?:Nvidia\s*)?Ge[Ff]orce\s*(MX\s*\d{3})/i,
    build: (m) => `NVIDIA GeForce ${m[1].replace(/\s+/g, '').toUpperCase()}`,
    confidence: 'high',
  },

  // AMD Radeon discrete (RX series), e.g. "Radeon RX 7600S"
  {
    name: 'amd_radeon_rx',
    regex: /Radeon\s*RX\s*(\d{3,4})([A-Z]{0,2})/i,
    build: (m) => `AMD Radeon RX ${m[1]}${m[2] ? m[2].toUpperCase() : ''}`,
    confidence: 'high',
  },

  // AMD Radeon integrated with model number (e.g. "780M", "740M", "680M")
  {
    name: 'amd_radeon_integrated_number',
    regex: /Radeon\s*(?:Graphics\s*)?(\d{3})M\b/i,
    build: (m) => `AMD Radeon ${m[1]}M`,
    confidence: 'high',
  },
  {
    name: 'amd_radeon_vega',
    regex: /Radeon\s*(?:Graphics\s*)?Vega\s*(\d+)/i,
    build: (m) => `AMD Radeon Vega ${m[1]}`,
    confidence: 'high',
  },

  // AMD Radeon generic/bare — no model number at all ("AMD Radeon
  // Graphics", "Radeon Graphics", "Radeon Integrated" — all the same
  // generic integrated GPU under different store wording).
  {
    name: 'amd_radeon_generic',
    regex: /(?:AMD\s*)?Radeon\s*(?:Graphics|Integrated)?\b/i,
    build: () => 'AMD Radeon Graphics',
    confidence: 'high',
  },

  // Intel Arc — with or without "Graphics" wording, with or without a model number
  {
    name: 'intel_arc',
    regex: /Intel\s*Arc\s*(?:Graphics\s*)?([A-Z]?\d{3}[A-Z]?)?/i,
    build: (m) => `Intel Arc${m[1] ? ' Graphics ' + m[1].toUpperCase() : ''}`,
    confidence: 'high',
  },

  // Intel Iris Xe / Iris Plus
  {
    name: 'intel_iris_xe',
    regex: /Iris\s*Xe/i,
    build: () => 'Intel Iris Xe',
    confidence: 'high',
  },
  {
    name: 'intel_iris_plus',
    regex: /Iris\s*Plus/i,
    build: () => 'Intel Iris Plus',
    confidence: 'high',
  },

  // Intel UHD / HD Graphics — with or without a model number
  {
    name: 'intel_uhd',
    regex: /(?:Intel\s*)?UHD\s*(?:Graphics)?\s*(\d{3})?/i,
    build: (m) => `Intel UHD Graphics${m[1] ? ' ' + m[1] : ''}`,
    confidence: 'high',
  },
  {
    name: 'intel_hd',
    regex: /(?:Intel\s*)?HD\s*Graphics\s*(\d{3,4})?/i,
    build: (m) => `Intel HD Graphics${m[1] ? ' ' + m[1] : ''}`,
    confidence: 'high',
  },

  // Intel generic — totally bare "Intel Graphics" with no other qualifier
  // (must come after all the more specific Intel patterns above)
  {
    name: 'intel_generic',
    regex: /\bIntel\s*Graphics\b/i,
    build: () => 'Intel Graphics',
    confidence: 'high',
  },

  // Apple integrated — "M4 GPU", "M3 Pro GPU"
  {
    name: 'apple_gpu',
    regex: /\bM([1-4])\s*(Pro|Max|Ultra)?\s*GPU\b/i,
    build: (m) => `Apple M${m[1]}${m[2] ? ' ' + capitalize(m[2]) : ''} GPU`,
    confidence: 'high',
  },

  // Qualcomm Adreno (Snapdragon X laptops)
  {
    name: 'qualcomm_adreno',
    regex: /Adreno\s*(?:GPU)?\s*(\d{3,4})?/i,
    build: (m) => `Qualcomm Adreno${m[1] ? ' ' + m[1] : ''}`,
    confidence: 'high',
  },
];

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function canonicalizeGpuRegex(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[®™]/g, '').trim();

  for (const pattern of PATTERNS) {
    const m = cleaned.match(pattern.regex);
    if (m) {
      return { canonical: pattern.build(m), confidence: pattern.confidence };
    }
  }

  return null;
}