function normalizeResolution(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{3,4})\s*[xX]\s*(\d{3,4})/);
  return m ? `${m[1]}x${m[2]}` : null;
}

function normalizeScreenType(raw) {
  if (!raw) return null;
  return String(raw).trim().toUpperCase();
}

function normalizeBrand(raw) {
  if (!raw) return null;
  return String(raw).trim().toUpperCase();
}

function normalizeBoolean(raw) {
  if (raw === null || raw === undefined || raw === '') return undefined; // "not present" — different from false
  const s = String(raw).trim().toLowerCase();
  if (['yes', 'true', '1', 'այո'].includes(s)) return true;
  if (['no', 'false', '0', 'ոչ'].includes(s)) return false;
  return undefined; // unparseable — treat as not present rather than guessing
}

/**
 * @param {object} product - normalized product record (from redstore.json / notebookcentre.json)
 * @param {string|null} cpuCanonical - result of canonicalizeCpuRegex(product.specs.cpu)?.canonical
 * @returns {{ required: object, touch_screen: boolean|undefined }}
 */
export function buildSpecKey(product, cpuCanonical) {
  return {
    required: {
      brand: normalizeBrand(product.brand),
      screen_inches: product.specs?.screen_inches ?? null,
      cpu: cpuCanonical ?? null,
      screen_resolution: normalizeResolution(product.specs?.screen_resolution),
      refresh_rate_hz: product.specs?.refresh_rate_hz ?? null,
      screen_type: normalizeScreenType(product.specs?.screen_type),
    },
    touch_screen: normalizeBoolean(product.specs?.touch_screen),
  };
}

/**
 * Two spec keys match if every required field is non-null on both sides
 * AND equal. Missing/null data on either side = no match (we don't
 * guess). touch_screen only compared when present on both sides.
 */
export function specKeysMatch(a, b) {
  for (const field of Object.keys(a.required)) {
    const va = a.required[field];
    const vb = b.required[field];
    if (va === null || vb === null) return false; // missing required field — can't confirm a match
    if (va !== vb) return false;
  }

  if (a.touch_screen !== undefined && b.touch_screen !== undefined) {
    if (a.touch_screen !== b.touch_screen) return false;
  }

  return true;
}