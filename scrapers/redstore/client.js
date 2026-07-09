import axios from "axios";

/**
 * Fetch every page of a single brand within a given category.
 * @param {string} categoryEndpoint - e.g. "smartphones" or "tablets"
 * @param {number} brandId
 * @returns {Promise<Array>} raw product objects from the API
 */
export async function fetchBrandProducts(categoryEndpoint, brandId) {
  const baseUrl = `https://admin.redstore.am/api/v1/catalog/${categoryEndpoint}/category`;

  const firstRes = await axios.get(baseUrl, {
    params: { view: "all", "brand_id[]": brandId, page: 1 },
  });

  const { last_page, data: firstPage } = firstRes.data.data.products;
  if (last_page === 1) return firstPage;

  const rest = await Promise.all(
    Array.from({ length: last_page - 1 }, (_, i) =>
      axios
        .get(baseUrl, {
          params: { view: "all", "brand_id[]": brandId, page: i + 2 },
        })
        .then((r) => r.data.data.products.data),
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
 * @returns {Promise<Array>} normalized product objects
 */
export async function fetchAllBrands(categoryEndpoint, brandIds, normalize) {
  const results = [];

  for (const [brand, id] of Object.entries(brandIds)) {
    try {
      const products = await fetchBrandProducts(categoryEndpoint, id);
      results.push(...products.map(normalize));
    } catch (err) {
      console.error(
        `[redstore/${categoryEndpoint}] failed to fetch brand ${brand}: ${err.message}`,
      );
    }
  }

  return results;
}