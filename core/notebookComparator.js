import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { canonicalizeCpuRegex } from "./ai/normalizeCpuRegex.js";
import { canonicalizeGpuRegex } from "./ai/normalizeGpuRegex.js";
import { extractCpuTierGroup, isGamingGpu } from "./cpuGroup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCHES_FILE = path.resolve(__dirname, "../cache/notebooks/matches-v2.json");
const REDSTORE_NOTEBOOKS_FILE = path.resolve(__dirname, "../cache/notebooks/redstore.json");

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

export function loadRsOnlyNotebooks() {
  if (!fs.existsSync(REDSTORE_NOTEBOOKS_FILE)) return [];
  try {
    const rsProducts = JSON.parse(fs.readFileSync(REDSTORE_NOTEBOOKS_FILE, "utf-8"));
    const allMatches = loadAllMatches();
    const matchedKeys = new Set();
    for (const m of allMatches) {
      if (m.a?.url) matchedKeys.add(String(m.a.url).trim());
      if (m.a?.name) matchedKeys.add(String(m.a.name).trim());
    }

    const rsOnly = [];
    for (const p of rsProducts) {
      const urlKey = p.url ? String(p.url).trim() : null;
      const nameKey = p.name ? String(p.name).trim() : null;
      if (urlKey && matchedKeys.has(urlKey)) continue;
      if (nameKey && matchedKeys.has(nameKey)) continue;

      const cpu = canonicalizeCpuRegex(p.specs?.cpu)?.canonical ?? null;
      const gpu = canonicalizeGpuRegex(p.specs?.gpu)?.canonical ?? null;
      const cpuTier = extractCpuTierGroup(cpu);
      const isGaming = isGamingGpu(gpu);
      const brand = p.brand ? String(p.brand).trim().toUpperCase() : null;

      const cash = p.price != null ? Number(p.price) : null;
      const inst = p.installment_price != null ? Number(p.installment_price) : cash;
      const fmt = (n) =>
        n != null ? n.toLocaleString("ru-RU").replace(/,/g, " ") : "—";
      const displayName = (p.name || "").replace(/\s+/g, " ").trim();
      const text = `*Redstore: ${displayName}*\nRS - ${fmt(cash)} - ${fmt(inst)} ❌`;

      rsOnly.push({
        name: displayName,
        text,
        cpu_group: cpuTier ? String(cpuTier) : null,
        brand,
        is_gaming: isGaming,
      });
    }
    return rsOnly;
  } catch (err) {
    console.error("[notebookComparator] ❌ Failed to load RS-only notebooks:", err.message);
    return [];
  }
}

export function filterRsOnlyNotebooks(rsOnlyList, section = "all", brand = null, cpuGroup = null) {
  return rsOnlyList.filter((item) => {
    if (section === "gaming" && item.is_gaming !== true) return false;
    if ((section === "standard" || section === "non_gaming") && item.is_gaming !== false) return false;
    if (brand && item.brand !== String(brand).trim().toUpperCase()) return false;
    if (cpuGroup && item.cpu_group !== String(cpuGroup)) return false;
    return true;
  });
}

/**
 * Builds formatted comparison messages from a list of matches:
 * - RS: includes ALL matching RS models in the comparison.
 * - Competitors: includes only the CHEAPEST matching model per competitor store.
 * - Grouped by existing processor groups (Core 3/i3/Ryzen 3, Core 5..., Core 7..., Core 9...).
 * - All comparisons belonging to the same processor group are included in ONE Telegram message.
 * - After normal comparisons, includes one additional message for RS-only models of that group.
 */
export function formatNotebookMatches(matches, rsOnlyNotebooks = []) {
  const adj = new Map();
  function addEdge(u, v) {
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u).add(v);
    adj.get(v).add(u);
  }

  const rsMap = new Map();
  const compMap = new Map();
  const matchCpuGroupMap = new Map();

  for (const m of matches) {
    if (!m.a || !m.b) continue;
    const rsKey = `RS::${(m.a.url && String(m.a.url).trim()) || String(m.a.name).trim()}`;
    const compKey = `COMP::${m.b.store}::${(m.b.url && String(m.b.url).trim()) || String(m.b.name).trim()}`;
    rsMap.set(rsKey, m.a);
    compMap.set(compKey, m.b);
    addEdge(rsKey, compKey);
    if (m.cpu_group) {
      matchCpuGroupMap.set(rsKey, String(m.cpu_group));
      matchCpuGroupMap.set(compKey, String(m.cpu_group));
    }
  }

  const visited = new Set();
  const comparisonsByCpuGroup = new Map();
  let totalComparisonsCount = 0;

  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const comp = { rs: [], competitors: [], cpu_group: null };
    const queue = [node];
    visited.add(node);

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.startsWith("RS::")) {
        comp.rs.push(rsMap.get(curr));
      } else {
        comp.competitors.push(compMap.get(curr));
      }
      if (!comp.cpu_group && matchCpuGroupMap.has(curr)) {
        comp.cpu_group = matchCpuGroupMap.get(curr);
      }
      for (const n of adj.get(curr)) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    if (comp.rs.length === 0 || comp.competitors.length === 0) continue;

    // Requirement 3:
    // RS: include ALL matching RS models
    // Competitor stores: if multiple matching models exist, include only the cheapest matching model from that store
    const compsByStore = new Map();
    for (const b of comp.competitors) {
      const storeKey = (b.store || "unknown").toLowerCase();
      const prices = parsePrice(b.price);
      const cash = prices.cash ?? Infinity;
      if (!compsByStore.has(storeKey) || cash < (compsByStore.get(storeKey).cash ?? Infinity)) {
        compsByStore.set(storeKey, { b, prices, cash });
      }
    }

    const selectedComps = Array.from(compsByStore.values());
    const competitorPrices = selectedComps.map((x) => x.prices);

    let minRsCash = Infinity;
    let minRsInst = Infinity;
    for (const a of comp.rs) {
      const p = parsePrice(a.price);
      if (p.cash && p.cash < minRsCash) minRsCash = p.cash;
      const inst = p.installment || p.cash;
      if (inst && inst < minRsInst) minRsInst = inst;
    }
    if (minRsCash === Infinity) minRsCash = null;
    if (minRsInst === Infinity) minRsInst = null;

    const lines = [];
    for (const a of comp.rs) {
      const p = parsePrice(a.price);
      const rsLine = formatRsLine(p.cash, p.installment, competitorPrices);
      lines.push(`*Redstore: ${a.name.trim()}*\n${rsLine}`);
    }

    for (const { b, prices } of selectedComps) {
      const compLine = formatCompLine(minRsCash, minRsInst, prices.cash, prices.installment, b.store);
      lines.push(`*${getStoreTitle(b.store)}: ${b.name.trim()}*\n${compLine}`);
    }

    const groupKey = comp.cpu_group || "other";
    if (!comparisonsByCpuGroup.has(groupKey)) {
      comparisonsByCpuGroup.set(groupKey, []);
    }
    comparisonsByCpuGroup.get(groupKey).push(lines.join("\n\n"));
    totalComparisonsCount++;
  }

  // RS-only notebooks grouped by cpu_group
  const rsOnlyByCpuGroup = new Map();
  for (const item of rsOnlyNotebooks) {
    const groupKey = item.cpu_group || "other";
    if (!rsOnlyByCpuGroup.has(groupKey)) rsOnlyByCpuGroup.set(groupKey, []);
    rsOnlyByCpuGroup.get(groupKey).push(item.text);
  }

  // Existing processor groups order: 3, 5, 7, 9, other
  const standardOrder = ["3", "5", "7", "9", "other"];
  const allCpuGroups = new Set([
    ...comparisonsByCpuGroup.keys(),
    ...rsOnlyByCpuGroup.keys(),
  ]);
  const sortedCpuGroups = Array.from(allCpuGroups).sort((a, b) => {
    const ai = standardOrder.indexOf(a);
    const bi = standardOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const finalMessages = [];

  for (const groupKey of sortedCpuGroups) {
    const normalBlocks = comparisonsByCpuGroup.get(groupKey) || [];
    if (normalBlocks.length > 0) {
      // Requirement 2: All notebook comparisons belonging to the same existing processor group
      // should be included in ONE Telegram message.
      const normalMsg = normalBlocks
        .map((block, i) => `${i + 1}. ${block}`)
        .join("\n\n");
      finalMessages.push(normalMsg);
    }

    const rsItems = rsOnlyByCpuGroup.get(groupKey) || [];
    if (rsItems.length > 0) {
      // Requirement 1: After normal comparisons are sent, send one additional message
      // containing all RS-only models for that group.
      const rsMsg = rsItems
        .map((text, i) => `${i + 1}. ${text}`)
        .join("\n\n");
      finalMessages.push(rsMsg);
    }
  }

  finalMessages.matchCount = totalComparisonsCount;
  return finalMessages;
}

export function buildNotebookComparisons(filter = "all") {
  const matches = getNotebookMatchesBySection(filter);
  const rsOnly = filterRsOnlyNotebooks(loadRsOnlyNotebooks(), filter);
  return formatNotebookMatches(matches, rsOnly);
}

export function buildNotebookSectionCpuComparisons(section, cpuGroup) {
  const matches = getNotebookMatchesBySection(section).filter(
    (m) => String(m.cpu_group) === String(cpuGroup)
  );
  const rsOnly = filterRsOnlyNotebooks(loadRsOnlyNotebooks(), section, null, cpuGroup);
  return formatNotebookMatches(matches, rsOnly);
}

export function buildNotebookSameBrandCpuComparisons(brand, cpuGroup) {
  const normalizedBrand = String(brand).trim().toUpperCase();
  const matches = getNotebookMatchesBySection("same_brand").filter(
    (m) =>
      String(m.brand).trim().toUpperCase() === normalizedBrand &&
      String(m.cpu_group) === String(cpuGroup)
  );
  const rsOnly = filterRsOnlyNotebooks(loadRsOnlyNotebooks(), "same_brand", normalizedBrand, cpuGroup);
  return formatNotebookMatches(matches, rsOnly);
}

