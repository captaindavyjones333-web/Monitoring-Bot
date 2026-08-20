import { fetchAllBrands } from "./client.js";

const BRAND_IDS = {
  apple: 294,
  samsung: 295,
  xiaomi: 296,
  google: 352,
  oneplus: 304,
  nothing: 478,
  asus: 310,
  honor: 498,
  zte: 335,
};

function getSimSuffix(simValue) {
  const s = simValue.trim().toLowerCase();
  switch (s) {
    case "2 esim":
      return " eSim";
    case "1 sim + esim":
      return " Nano-Sim";
    case "2 sim":
      return " Dual-Sim";
    case "1 sim":
      return "";
    case "առանց sim քարտի հնարավորության":
    case "without sim card capability":
      return " eSim";
    default:
      console.warn(`[redstore/phones] Unrecognized SIM value: "${simValue}"`);
      return "";
  }
}

function normalize(raw) {
  const simAttr = raw.attributes?.find((a) => a.attribute_id === 19);
  const simValue = simAttr?.attribute_value || "";
  const simSuffix = getSimSuffix(simValue);

  const cleanedName = raw.name
    .replace(/\b(?:dual\s+)?e[\s-]?sim\b/gi, "")
    .replace(/\b\d?\s*sim\s*\+\s*e[\s-]?sim\b/gi, "")
    .replace(/\bnano[\s-]?sim\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const productName = simSuffix ? `${cleanedName}${simSuffix}` : cleanedName;

  return {
    name: productName,
    price: Number(raw.price) || null,
    cash_price: Number(raw.cash_price) || null,
    installment_price: Number(raw.installment_price) || null,
    source: "redstore",
    category: "phones",
    url: raw.slug ? `https://redstore.am/product/${raw.slug}` : null,
  };
}

export async function scrapeRedstorePhones() {
  return fetchAllBrands("smartphones", BRAND_IDS, normalize);
}
