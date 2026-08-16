export function parseRam(raw) {
  if (!raw) return { ram_gb: null, ram_type: null };
  const str = String(raw);
  const gbMatch = str.match(/(\d+)\s*GB/i);
  const typeMatch = str.match(/(LP)?DDR\d/i);
  return {
    ram_gb: gbMatch ? Number(gbMatch[1]) : null,
    ram_type: typeMatch ? typeMatch[0].toUpperCase() : null,
  };
}

export function parseStorage(raw) {
  if (!raw) return { storage_gb: null, storage_type: null };
  const str = String(raw);
  const sizeMatch = str.match(/(\d+)\s*(GB|TB)/i);
  const typeMatch = str.match(/SSD|HDD|EMMC/i);
  const storage_gb = sizeMatch
    ? sizeMatch[2].toUpperCase() === 'TB'
      ? Number(sizeMatch[1]) * 1024
      : Number(sizeMatch[1])
    : null;
  return {
    storage_gb,
    storage_type: typeMatch ? typeMatch[0].toUpperCase() : null,
  };
}

export function parseWeightKg(raw) {
  if (!raw) return null;
  // handles Armenian-style decimal comma, e.g. "1,50 kilogram"
  const m = String(raw).replace(',', '.').match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

export function parseScreenInches(raw) {
  if (!raw) return null;
  const normalized = String(raw).replace(/[,.․]/g, '.');
  const m = normalized.match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

export function parseRefreshRateHz(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}