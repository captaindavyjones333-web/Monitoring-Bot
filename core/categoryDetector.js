export const TABLET_REGEX =
  /\bipad\b|\btab\b|galaxy tab|redmi pad|\bpad\s?\d|\bpad\b/i;
export const WATCH_REGEX =
  /\bwatch\d*\b|\bfit\s*\d\b|smart\s*band|\bmi\s*band\b/i;
export const HEADPHONE_REGEX =
  /\bairpods\b|\bbuds\d*\b|marshall\s*(major|minor|monitor|motif|heston)/i;
export const MACBOOK_REGEX = /\bmacbook\b/i;
export const SPEAKER_REGEX =
  /\bspeaker\b|harman[\s\/]*kardon|jbl|marshall\s*(\b(i{1,3}|iv|v)\b\s*)?(emberton|acton|stanmore|middleton|stockwell|willen|woburn|tufton|kilburn)/i;
export const TV_REGEX =
  /\btv\b|հեռուստացույց|\bled\b.*\bsmart\b|\bqled\b|\b[uq]e\d{2,3}[a-z0-9]{4,10}\b|\b\d{2}ev\d{3}[a-z0-9-]*\b/i;
export const DYSON_REGEX = /\bdyson\b/i;
export const GAMING_REGEX =
  /\bps5\b|\bplaystation\s*5\b|\bswitch\b|\bxbox\s*series\b|\bmeta\s*quest\b|\bsteam\s*deck\b|\brog\s*ally\b|\blegion\s*go\b|\b(ps5?|playstation5?)\s*vr\s*2\b/i;
export const AC_REGEX = /\bair\s*condition|odorak|օդորակ/i;

export function detectCategory(name) {
  if (WATCH_REGEX.test(name)) return "watches";
  if (HEADPHONE_REGEX.test(name)) return "headphones";
  if (MACBOOK_REGEX.test(name)) return "macbooks";
  if (TABLET_REGEX.test(name)) return "tablets";
  if (SPEAKER_REGEX.test(name)) return "speakers";
  if (TV_REGEX.test(name)) return "tvs";
  if (DYSON_REGEX.test(name)) return "dyson";
  if (GAMING_REGEX.test(name)) return "gaming";
  if (AC_REGEX.test(name)) return "airconditioners";
  return "phones";
}
