// debug/testVestaAC.mjs
import axios from "axios";
import * as cheerio from "cheerio";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

const res = await axios.get("https://vesta.am/odorakichner/household-air-conditioners?tf_ff=83.23", {
  headers: HEADERS,
});
const $ = cheerio.load(res.data);
console.log("product-thumb count:", $(".product-thumb").length);
console.log("Response length:", res.data.length);
console.log("Contains 'MIDEA':", res.data.includes("MIDEA"));