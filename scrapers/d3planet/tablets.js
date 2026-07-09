import { crawl3DPlanetCategory } from "./crawler.js";

const LIST_URL =
  "https://3dplanet.am/hy/store/tablets?brands[]=3&brands[]=4&brands[]=6&sort=none";

export async function scrape3DPlanetTablets() {
  return crawl3DPlanetCategory(LIST_URL, "3d-tablets");
}