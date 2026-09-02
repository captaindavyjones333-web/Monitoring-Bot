import { crawlAllsellCategory } from "./crawler.js";

const CATEGORY_URLS = [
  "https://allsell.am/am/audio-video-photo/video/drones",
];

export async function scrapeAllsellDrones() {
  const results = await crawlAllsellCategory(CATEGORY_URLS, "allsell-drones");
  return results.map((p) => ({ ...p, category: "drones" }));
}
