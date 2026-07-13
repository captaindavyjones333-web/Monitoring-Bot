export const TABLET_REGEX =
  /\bipad\b|\btab\b|galaxy tab|redmi pad|\bpad\s?\d|\bpad\b/i;
export const WATCH_REGEX = /\bwatch\b/i;
export const HEADPHONE_REGEX = /\bairpods\b|\bbuds\b|\bmarshall\b/i;
export const MACBOOK_REGEX = /\bmacbook\b/i;
export const SPEAKER_REGEX = /\bspeaker\b|\bharman\s*kardon\b|\bjbl\b/i;
export const TV_REGEX = /\btv\b|հեռուստացույց|\bled\b.*\bsmart\b|\bqled\b|\b[uq]e\d{2,3}[a-z0-9]{4,10}\b|\b\d{2}ev\d{3}[a-z0-9-]*\b/i;
export const DYSON_REGEX = /\bdyson\b/i;

export function detectCategory(name) {
  if (WATCH_REGEX.test(name)) return "watches";
  if (HEADPHONE_REGEX.test(name)) return "headphones";
  if (MACBOOK_REGEX.test(name)) return "macbooks";
  if (TABLET_REGEX.test(name)) return "tablets";
  if (SPEAKER_REGEX.test(name)) return "speakers";
  if (TV_REGEX.test(name)) return "tvs";
  if (DYSON_REGEX.test(name)) return "dyson";
  return "phones";
}
