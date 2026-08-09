const CONSOLE_INCLUDE =
  /\bps5\b|\bplaystation\s*5\b|\bswitch\b|\bxbox\s*series\b|\bmeta\s*quest\b/i;

const ACCESSORY_EXCLUDE =
  /dualsense|\bcontroller\b|\bcase\b|\bstand\b|\bcooling\b|\bcharging\b|disc\s*drive|\bheadset\b|\bpulse\b|\bportal\b|\bbackbone\b|vr2|\bfan\b|խաղային\s*սկավառակ|racing\s*wheel|\bnacon\b|\bcamera\b|\bhori\b|split\s*pad|joy-?con/i;

export function isConsoleProduct(name) {
  return CONSOLE_INCLUDE.test(name) && !ACCESSORY_EXCLUDE.test(name);
}