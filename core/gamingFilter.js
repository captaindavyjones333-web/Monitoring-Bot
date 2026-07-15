const CONSOLE_INCLUDE =
  /\bps5\b|\bplaystation\s*5\b|\bswitch\b|\bxbox\s*series\b|\bmeta\s*quest\s*\d\b/i;

const ACCESSORY_EXCLUDE =
  /dualsense|controller|\bcase\b|stand|cooling|charging|disc\s*drive|headset|pulse|portal|backbone|vr2|\bfan\b|խաղային\s*սկավառակ|racing\s*wheel|nacon|camera|hori|split\s*pad|joy-?con|elite\s*strap|\bstrap\b/i;

export function isConsoleProduct(name) {
  return CONSOLE_INCLUDE.test(name) && !ACCESSORY_EXCLUDE.test(name);
}
