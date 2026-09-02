import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCHES_FILE = path.resolve(__dirname, "../cache/notebooks/matches-v2.json");

function parsePrice(priceStr) {
  if (!priceStr) return { cash: null, installment: null };
  const parts = priceStr.split("-").map((s) => s.trim());
  const parseNum = (val) => {
    if (!val || val === "N/A" || val === "—") return null;
    const num = Number(val.replace(/[^\d]/g, ""));
    return isNaN(num) ? null : num;
  };
  const cash = parseNum(parts[0]);
  const installment = parts[1] ? parseNum(parts[1]) : cash;
  return { cash, installment };
}

function getFlag(rsPrice, compPrice) {
  if (!rsPrice || !compPrice) return "";
  if (compPrice < rsPrice) return "‼️";
  if (compPrice > rsPrice) return "♦️";
  return "🏷";
}

const STORE_LABELS = {
  "redstore": "RS",
  "redstore.am": "RS",
  "notebookcentre": "NC",
  "notebookcentre.am": "NC",
  "allsell": "Allsell",
  "allsell.am": "Allsell",
  "3dplanet": "3D",
  "3dplanet.am": "3D",
  "notebookmall.am": "NM",
  "notebookmall": "NM",
  "complife.am": "CL",
  "complife": "CL",
};

const STORE_TITLES = {
  "redstore": "Redstore",
  "redstore.am": "Redstore",
  "notebookcentre": "Notebookcentre",
  "notebookcentre.am": "Notebookcentre",
  "allsell": "Allsell",
  "allsell.am": "Allsell",
  "3dplanet": "3DPlanet",
  "3dplanet.am": "3DPlanet",
  "notebookmall.am": "NotebookMall",
  "notebookmall": "NotebookMall",
  "complife.am": "Complife",
  "complife": "Complife",
};

function getStoreLabel(store) {
  if (!store) return "Comp";
  return STORE_LABELS[store.toLowerCase()] || store;
}

function getStoreTitle(store) {
  if (!store) return "Competitor";
  return STORE_TITLES[store.toLowerCase()] || store;
}

function formatRsLine(rsCash, rsInst, competitorPrices = []) {
  const fmt = (n, bold = false) => {
    if (n === null || n === undefined) return "—";
    const formatted = n.toLocaleString("ru-RU").replace(/,/g, " ");
    return bold ? `*${formatted}*` : formatted;
  };

  const effectiveRsInst = rsInst || rsCash;

  const validCompetitors = competitorPrices.filter(
    (c) => c && (c.cash !== null || c.installment !== null)
  );

  const rsAffordableCash =
    validCompetitors.length > 0 &&
    validCompetitors.every((c) => c.cash && rsCash && rsCash < c.cash);

  const rsAffordableInst =
    validCompetitors.length > 0 &&
    validCompetitors.every((c) => {
      const effCompInst = c.installment || c.cash;
      return effCompInst && effectiveRsInst && effectiveRsInst < effCompInst;
    });

  const rsCashPart = rsAffordableCash ? `✅${fmt(rsCash)}` : fmt(rsCash);
  const rsInstPart = rsAffordableInst
    ? `${fmt(effectiveRsInst)}✅`
    : fmt(effectiveRsInst);

  return `RS - ${rsCashPart} - ${rsInstPart}`;
}

function formatCompLine(rsCash, rsInst, compCash, compInst, compStore = "notebookcentre") {
  const fmt = (n, bold = false) => {
    if (n === null || n === undefined) return "—";
    const formatted = n.toLocaleString("ru-RU").replace(/,/g, " ");
    return bold ? `*${formatted}*` : formatted;
  };

  const effectiveRsInst = rsInst || rsCash;
  const effectiveCompInst = compInst || compCash;

  const compLabel = getStoreLabel(compStore);
  const cashFlag = compCash ? getFlag(rsCash, compCash) : "";
  const instFlag = effectiveCompInst
    ? getFlag(effectiveRsInst, effectiveCompInst)
    : "";

  const cashBold = cashFlag === "‼️";
  const instBold = instFlag === "‼️";

  const cashMatch = compCash && rsCash && compCash === rsCash;
  const instMatch =
    effectiveCompInst && effectiveRsInst && effectiveCompInst === effectiveRsInst;

  const compCashStr = compCash
    ? cashMatch
      ? "🏷"
      : `${cashFlag}${fmt(compCash, cashBold)}`
    : "—";

  const compInstStr = instMatch
    ? "🏷"
    : `${fmt(effectiveCompInst, instBold)}${instFlag}`;

  return `${compLabel} - ${compCashStr} - ${compInstStr}`;
}

function formatPricePair(rsCash, rsInst, compCash, compInst, compStore = "notebookcentre") {
  const rsLine = formatRsLine(rsCash, rsInst, [{ cash: compCash, installment: compInst }]);
  const compLine = formatCompLine(rsCash, rsInst, compCash, compInst, compStore);
  return { rsLine, compLine };
}

function loadAllMatches() {
  if (!fs.existsSync(MATCHES_FILE)) {
    console.warn(`[notebookComparator] ⚠️  No matches file found at ${MATCHES_FILE}`);
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(MATCHES_FILE, "utf-8"));
    const fullMatches = data.full_match || [];
    const gamingSameBrand = data.gaming_same_brand || [];
    const gamingCrossBrand = data.gaming_cross_brand || [];
    const nonGamingSameBrand = data.non_gaming_same_brand || [];
    const nonGamingCrossBrand = data.non_gaming_cross_brand || [];

    return [
      ...fullMatches,
      ...gamingSameBrand,
      ...gamingCrossBrand,
      ...nonGamingSameBrand,
      ...nonGamingCrossBrand,
    ];
  } catch (err) {
    console.error(`[notebookComparator] ❌ Failed to read ${MATCHES_FILE}:`, err.message);
    return [];
  }
}

/**
 * Filter matches by section:
 * - gaming: is_gaming === true (regardless of same_brand)
 * - standard: is_gaming === false (regardless of same_brand)
 * - same_brand: same_brand === true (including full_match)
 * - cross_brand: same_brand === false
 */
export function getNotebookMatchesBySection(section) {
  const allMatches = loadAllMatches();

  switch (section) {
    case "gaming":
      return allMatches.filter((m) => m.is_gaming === true);
    case "standard":
    case "non_gaming":
      return allMatches.filter((m) => m.is_gaming === false);
    case "same_brand":
      return allMatches.filter((m) => m.same_brand === true);
    case "cross_brand":
      return allMatches.filter((m) => m.same_brand === false);
    default:
      return allMatches;
  }
}

/**
 * Returns available CPU groups (e.g. ['3', '5', '7', '9']) for a given section (gaming, standard, cross_brand)
 */
export function getAvailableNotebookCpuGroups(section) {
  const matches = getNotebookMatchesBySection(section);
  const groups = new Set();
  for (const m of matches) {
    if (m.cpu_group) {
      groups.add(String(m.cpu_group));
    }
  }
  return Array.from(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Returns available brands for Same Brand matches
 */
export function getAvailableNotebookBrands() {
  const matches = getNotebookMatchesBySection("same_brand");
  const brands = new Set();
  for (const m of matches) {
    if (m.brand) {
      brands.add(String(m.brand).trim().toUpperCase());
    }
  }
  return Array.from(brands).sort();
}

/**
 * Returns available CPU groups for a specific brand within Same Brand matches
 */
export function getAvailableNotebookSameBrandCpuGroups(brand) {
  const normalizedBrand = String(brand).trim().toUpperCase();
  const matches = getNotebookMatchesBySection("same_brand").filter(
    (m) => String(m.brand).trim().toUpperCase() === normalizedBrand
  );
  const groups = new Set();
  for (const m of matches) {
    if (m.cpu_group) {
      groups.add(String(m.cpu_group));
    }
  }
  return Array.from(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Builds formatted comparison messages from a list of matches,
 * grouping all competitor matches under the same Redstore product.
 */
export function formatNotebookMatches(matches) {
  // Map<rsKey, { rs: a, competitors: Map<compPairKey, b> }>
  const grouped = new Map();

  for (const match of matches) {
    const a = match.a; // Redstore
    const b = match.b; // Competitor
    if (!a || !b) continue;

    const rsKey = (a.url && String(a.url).trim()) || String(a.name).trim();

    if (!grouped.has(rsKey)) {
      grouped.set(rsKey, {
        rs: a,
        competitors: new Map(),
      });
    }

    const compPairKey = `${b.store}|${(b.url && String(b.url).trim()) || String(b.name).trim()}`;
    const group = grouped.get(rsKey);
    if (!group.competitors.has(compPairKey)) {
      group.competitors.set(compPairKey, b);
    }
  }

  const results = [];

  for (const { rs, competitors } of grouped.values()) {
    const compList = Array.from(competitors.values());
    if (compList.length === 0) continue;

    const rsPrices = parsePrice(rs.price);
    const competitorPrices = compList.map((b) => parsePrice(b.price));

    const rsLine = formatRsLine(rsPrices.cash, rsPrices.installment, competitorPrices);
    const rsName = rs.name.trim();

    const lines = [`*Redstore: ${rsName}*\n${rsLine}`];

    for (let i = 0; i < compList.length; i++) {
      const b = compList[i];
      const compPrices = competitorPrices[i];
      const compLine = formatCompLine(
        rsPrices.cash,
        rsPrices.installment,
        compPrices.cash,
        compPrices.installment,
        b.store
      );
      const compName = b.name.trim();
      const compTitle = getStoreTitle(b.store);

      lines.push(`*${compTitle}: ${compName}*\n${compLine}`);
    }

    results.push(lines.join("\n\n"));
  }

  return results.map((msg, i) => `${i + 1}. ${msg}`);
}

export function buildNotebookComparisons(filter = "all") {
  const matches = getNotebookMatchesBySection(filter);
  return formatNotebookMatches(matches);
}

export function buildNotebookSectionCpuComparisons(section, cpuGroup) {
  const matches = getNotebookMatchesBySection(section).filter(
    (m) => String(m.cpu_group) === String(cpuGroup)
  );
  return formatNotebookMatches(matches);
}

export function buildNotebookSameBrandCpuComparisons(brand, cpuGroup) {
  const normalizedBrand = String(brand).trim().toUpperCase();
  const matches = getNotebookMatchesBySection("same_brand").filter(
    (m) =>
      String(m.brand).trim().toUpperCase() === normalizedBrand &&
      String(m.cpu_group) === String(cpuGroup)
  );
  return formatNotebookMatches(matches);
}

