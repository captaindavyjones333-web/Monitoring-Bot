const CONSOLE_INCLUDE =
  /\bps5\b|\bplaystation\s*5\b|\bswitch\b|\bxbox\s*series\b|\bmeta\s*quest\b|\bsteam\s*deck\b|\brog\s*ally\b|\blegion\s*go\b|\b(ps5?|playstation5?)\s*vr\s*2\b|\blogitech\s*(g\d*\s*)?(pro\s*racing|racing\s*wheel|trueforce|g29|g920|g923|g27)|\bpxn\s*(v\d+|l\d+|\w*\s*racing)|\bthrustmaster\s*(t\d+|tx\s*racing|tmx|ts-?xw|t-?gt|t300|tca|t150|t80)|\bhori\s*(rwa?|racing\s*wheel)/i;

const ACCESSORY_EXCLUDE =
  /dualsense|\bcontroller\b|\bcase\b|\bstand\b|\bcooling\b|\bcharging\b|disc\s*drive|\bheadset\b|\bpulse\b|\bportal\b|\bbackbone\b|\bfan\b|խաղային\s*սկավառակ|\bnacon\b|\bcamera\b|split\s*pad|joy-?con/i;

export function isConsoleProduct(name) {
  return CONSOLE_INCLUDE.test(name) && !ACCESSORY_EXCLUDE.test(name);
}