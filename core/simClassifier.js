export function getSimSuffixFromText(raw, forceDual = false) {
  if (forceDual) return " Dual-Sim";
  if (!raw) return "";
  const s = raw.toLowerCase().trim();

  // "Up to two Nano-SIM and multi eSIM" -> Dual-Sim
  if (s.includes("up to two nano-sim") && s.includes("esim"))
    return " Dual-Sim";

  const nanoCount = (s.match(/nano[\s-]?sim/g) || []).length;
  const esimCount = (s.match(/\besim\b/g) || []).length;

  // Nano-SIM + eSIM + eSIM (1 Nano + 2 eSIM, max 2 at a time) -> Nano-Sim
  if (nanoCount === 1 && esimCount >= 2) return " Nano-Sim";

  // Nano-SIM + Nano-SIM (2 physical Nano SIMs) -> Dual-Sim
  if (nanoCount >= 2 && esimCount === 0) return " Dual-Sim";

  // 4-option flexible dual: Nano+Nano+eSIM+eSIM, "max 2 at a time" -> Dual-Sim
  if (nanoCount >= 2 && esimCount >= 2) return " Dual-Sim";

  // 3-slot hybrid tray: Nano+Nano+eSIM (pick 2 of 3) -> Nano-Sim
  if (nanoCount >= 2 && esimCount >= 1) return " Nano-Sim";

  // eSIM+eSIM / "2 eSIM" / "Dual eSIM" → all treated as plain eSim (dual eSIM does not exist as a separate concept)
  if (/esim\s*\+\s*esim/.test(s)) return " eSim";
  if (/\b2\b\s*esim|\bdual\b\s*esim/.test(s)) return " eSim";

  // Nano-SIM + eSIM / Nano-SIM & eSIM / Nano-SIM and/or eSIM -> hybrid Nano-Sim
  if (/nano[\s-]?sim\s*(?:&|\+|\/|and\/or)\s*esim/.test(s)) return " Nano-Sim";

  // Physical dual/multi-SIM (2 SIM, 3 SIM, SIM1&SIM2, Armenian "2 Սիմ քարտ")
  if (/\bdual[\s-]?sim\b/i.test(s)) return " Dual-Sim";
  if (/\bdual[\s-]?nano(?:[\s-]?sim)?\b/i.test(s)) return " Dual-Sim";
  if (/\bsim\s*1\s*&\s*sim\s*2\b/i.test(s)) return " Dual-Sim";
  if (/\b[23]\s*sim\b/i.test(s)) return " Dual-Sim";
  if (/\b[23]\s*սիմ/.test(s)) return " Dual-Sim";

  // "1 SIM" (alone or embedded, e.g. "1 SIM + eSIM") -> Nano-Sim
  if (/\b1\s*sim\b/.test(s)) return " Nano-Sim";

  // Bare single eSIM
  if (/\besim\b/.test(s)) return " eSim";

  // Plain "Nano-Sim" alone -> Nano-Sim
  if (/^nano[\s-]?sim$/.test(s)) return " Nano-Sim";

  console.warn(`[simClassifier] Unrecognized: "${raw}"`);
  return "";
}
