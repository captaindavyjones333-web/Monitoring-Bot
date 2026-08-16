import "dotenv/config";
import axios from "axios";

/**
 * Fetch every page of a single brand within a given category using the Redstore Export API.
 * @param {string} categoryEndpoint - e.g. "smartphones" or "tablets"
 * @param {number} brandId
 * @param {object} [extraParams] - optional extra query params merged into every request (e.g. { lang: "en" }) — opt-in per category, not applied globally.
 * @returns {Promise<Array>} raw product objects from the API
 */
export async function fetchBrandProducts(categoryEndpoint, brandId, extraParams = {}) {
  const baseUrl = `https://admin.redstore.am/api/v1/export/catalog/${categoryEndpoint}/category`;
  const headers = { "X-Export-Key": process.env.REDSTORE_EXPORT_KEY || "" };

  const firstRes = await axios.get(baseUrl, {
    params: { view: "all", "brand_id[]": brandId, page: 1, ...extraParams },
    headers,
  });

  const productsObj = firstRes.data?.products || firstRes.data?.data?.products;
  const { last_page, data: firstPage } = productsObj;
  if (!last_page || last_page === 1) return firstPage || [];

  const rest = await Promise.all(
    Array.from({ length: last_page - 1 }, (_, i) =>
      axios
        .get(baseUrl, {
          params: { view: "all", "brand_id[]": brandId, page: i + 2, ...extraParams },
          headers,
        })
        .then((r) => {
          const pObj = r.data?.products || r.data?.data?.products;
          return pObj?.data || [];
        }),
    ),
  );

  return [...firstPage, ...rest.flat()];
}

/**
 * Fetch every brand in BRAND_IDS for a category, tolerating individual
 * brand failures without failing the whole category.
 * @param {string} categoryEndpoint
 * @param {Record<string, number>} brandIds
 * @param {(raw: object) => object} normalize
 * @param {object} [extraParams] - optional extra query params, see fetchBrandProducts
 * @returns {Promise<Array>} normalized product objects
 */
export async function fetchAllBrands(categoryEndpoint, brandIds, normalize, extraParams = {}) {
  const results = [];

  for (const [brand, id] of Object.entries(brandIds)) {
    try {
      const products = await fetchBrandProducts(categoryEndpoint, id, extraParams);
      const normalized = products
        .map((raw) => {
          try {
            return normalize(raw);
          } catch (err) {
            console.warn(
              `[redstore/${categoryEndpoint}] skipped malformed product for brand ${brand}: ${err.message}`,
            );
            return null;
          }
        })
        .filter(Boolean);

      results.push(...normalized);
    } catch (err) {
      console.error(
        `[redstore/${categoryEndpoint}] failed to fetch brand ${brand}: ${err.message}`,
      );
    }
  }

  return results;
}