export const TABLET_REGEX =
  /\bipad\b|\btab\b|galaxy tab|redmi pad|\bpad\s?\d|\bpad\b|\bfire\s*(hd|hdx)?\s*\d|\bremarkable\b/i;
export const WATCH_REGEX =
  /\bwatch\d*\b|\bi\s*watch\b|\bfit\s*\d\b|smart\s*band|\bmi\s*band\b/i;
export const HEADPHONE_REGEX =
  /\bairpods\b|\bbuds\d*\b|marshall\s*(major|minor|monitor|motif|heston)|\bsony\s*(wh|wf|mdr|linkbuds|inzone)|\bxiaomi\s*(buds|earbuds|headphones)|\boneplus\s*(buds|Nord\s*Buds)|\bnothing\s*(ear|cmf)|\blogitech\s*(?!g29|g920|g923|g27|pro\s*racing|racing)(g\d+|zone|h\d+)|\bjbl\s*(tune|live|reflect|endurance|club|quantum)|\bbose\s*(qc|quietcomfort|soundsport|sport\s*earbuds|earbuds|headphones|700|nc)|\bbelkin\s*(soundform)|\bbeats\s*(studio|solo|powerbeats|fit\s*pro|flex|urbeats|epro)|soundcore/i;
export const MACBOOK_REGEX = /\bmacbook\b/i;
export const SPEAKER_REGEX =
  /\bspeaker\b|harman[\s\/]*kardon|jbl|marshall\s*(\b(i{1,3}|iv|v)\b\s*)?(emberton|acton|stanmore|middleton|stockwell|willen|woburn|tufton|kilburn)|\bbose\s*(soundlink|soundbar|home\s*speaker|portable|revolve|flexs?|s1\s*pro)|\bbeats\s*(pill|homepod)|\bsony\s*(srs|ht-|gtk-|mhc-)|\byandex\s*(станция|station)|\bxiaomi\s*(smart\s*speaker|mi\s*smart\s*speaker|sound\s*move)/i;
export const TV_REGEX =
  /\btv\b|հեռուստացույց|\bled\b.*\bsmart\b|\bqled\b|\b[uq]e\d{2,3}[a-z0-9]{4,10}\b|\b\d{2}ev\d{3}[a-z0-9-]*\b|\bkd-\d{2}[a-z0-9]+\b|\bbravia\b/i;
export const DYSON_REGEX = /\bdyson\b/i;
export const GAMING_REGEX =
  /\bps5\b|\bplaystation\s*5\b|\bswitch\b|\bxbox\s*series\b|\bmeta\s*quest\b|\bsteam\s*deck\b|\brog\s*ally\b|\blegion\s*go\b|\b(ps5?|playstation5?)\s*vr\s*2\b|\blogitech\s*(g\d*\s*)?(pro\s*racing|racing\s*wheel|trueforce|g29|g920|g923|g27)|\bpxn\s*(v\d+|l\d+|\w*\s*racing)|\bthrustmaster\s*(t\d+|tx\s*racing|tmx|ts-?xw|t-?gt|t300|tca|t150|t80)|\bhori\s*(rwa?|racing\s*wheel)/i;
export const AC_REGEX = /\bair\s*condition|odorak|օդորակ/i;
export const CAMERA_REGEX =
  /\b(canon|nikon|fujifilm|instax|gopro|insta360|osmo)\b|\bcamera\b|տեսախցիկ/i;
export const CLEANER_REGEX =
  /\b(dreame|karcher|k\xc3\xa4rcher|roborock|miele|vacuum|cleaner)\b|փոշեկուլ/i;
export const PRINTER_REGEX =
  /\b(printer|laserjet|deskjet|ecotank|pixma)\b|տպիչ/i;
export const PROJECTOR_REGEX =
  /\b(projector|projectors|wanbo|xgimi)\b|պրոյեկտոր|պրոեկտոր|проектор/i;
export const DRONE_REGEX =
  /\b(drone|drones|mavic|avata|phantom|matrice|autel|betafpv|hubsan)\b|\bdji\s*(mini|air|fpv|neo|inspire|mavic|avata)\b|դրոն|դրոններ|թռչող\s*սարք|дрон|квадрокоптер/i;
export const MONITOR_REGEX =
  /\b(monitor|monitors)\b|մոնիտոր|մոնիտորներ|монитор/i;

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
  if (CAMERA_REGEX.test(name)) return "camera";
  if (CLEANER_REGEX.test(name)) return "cleaners";
  if (PRINTER_REGEX.test(name)) return "printers";
  if (PROJECTOR_REGEX.test(name)) return "projectors";
  if (DRONE_REGEX.test(name)) return "drones";
  if (MONITOR_REGEX.test(name)) return "monitors";
  return "phones";
}
