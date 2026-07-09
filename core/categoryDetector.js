export const TABLET_REGEX = /\bipad\b|\btab\b|galaxy tab|redmi pad|\bpad\s?\d|\bpad\b/i;
export const WATCH_REGEX = /\bwatch\b/i;
export const HEADPHONE_REGEX = /\bairpods\b|\bbuds\b|\bmarshall\b/i;
export const MACBOOK_REGEX = /\bmacbook\b/i;

export function detectCategory(name) {
  if (WATCH_REGEX.test(name)) return "watches";
  if (HEADPHONE_REGEX.test(name)) return "headphones";
  if (MACBOOK_REGEX.test(name)) return "macbooks";
  if (TABLET_REGEX.test(name)) return "tablets";
  return "phones";
}