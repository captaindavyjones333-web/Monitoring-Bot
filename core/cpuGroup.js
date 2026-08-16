/**
 * core/cpuGroup.js
 *
 * Groups a canonical CPU string into its performance tier (3/5/7/9),
 * regardless of brand/generation naming — i3, Core 3, and Ryzen 3 all
 * group as tier "3"; i5, Core 5, Core Ultra 5, and Ryzen 5/Ryzen AI 5
 * all group as tier "5". Used for the looser group-match tiers, not
 * the strict full-match tier (which requires the exact CPU string).
 *
 * Apple (M-series), Intel N-series, Snapdragon, and Athlon don't fit
 * this i3/i5/i7/i9-style tiering — they return null and simply won't
 * participate in group matching.
 */
export function extractCpuTierGroup(canonicalCpu) {
  if (!canonicalCpu) return null;

  let m = canonicalCpu.match(/Ultra\s*([3579])/i);
  if (m) return m[1];

  m = canonicalCpu.match(/Ryzen\s*AI\s*([3579])/i);
  if (m) return m[1];

  m = canonicalCpu.match(/Ryzen\s*([3579])/i);
  if (m) return m[1];

  m = canonicalCpu.match(/i([3579])-/i);
  if (m) return m[1];

  m = canonicalCpu.match(/Core\s*([3579])-/i); // new no-"i" Intel Core tier
  if (m) return m[1];

  return null;
}

/**
 * Gaming detection, per your instruction: RTX presence = gaming laptop.
 */
export function isGamingGpu(canonicalGpu) {
  if (!canonicalGpu) return false;
  return /\bRTX\b/i.test(canonicalGpu);
}

export function isOled(canonicalScreenType) {
  if (!canonicalScreenType) return false;
  return /OLED/i.test(canonicalScreenType);
}