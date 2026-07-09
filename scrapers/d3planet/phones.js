import { crawl3DPlanetCategory } from "./crawler.js";

const LIST_URL = "https://3dplanet.am/hy/store/smartphones";

export async function scrape3DPlanetPhones() {
  return crawl3DPlanetCategory(LIST_URL, "3d-phones");
}