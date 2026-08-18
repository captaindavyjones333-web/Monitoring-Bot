import { Router } from "express";
import { pool } from "../db.js";

export const productsRouter = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

async function autoHealOrphanedListings() {
  try {
    const orphaned = await pool.query(
      `SELECT id, raw_title, normalized_title FROM store_listings WHERE product_id IS NULL LIMIT 50`,
    );
    for (const row of orphaned.rows) {
      const title = (row.normalized_title || row.raw_title || "").trim();
      if (!title) continue;
      const res = await pool.query(
        `INSERT INTO products (canonical_title, attributes, status)
         VALUES ($1, '{}'::jsonb, 'active')
         RETURNING id`,
        [title],
      );
      await pool.query(
        `UPDATE store_listings SET product_id = $1 WHERE id = $2`,
        [res.rows[0].id, row.id],
      );
    }
  } catch {
    // Non-blocking auto-heal
  }
}

// GET /api/products?q=&category=&storeId=&page=&pageSize=
// Search + filter canonical products. Each result includes a rollup of
// which stores carry it and its price range, so the list view gives a
// useful summary without a second round-trip per row.
productsRouter.get("/", async (req, res, next) => {
  try {
    await autoHealOrphanedListings();
    const q = (req.query.q ?? "").trim();
    const categorySlug = (req.query.category ?? "").trim();
    const storeId = (req.query.storeId ?? "").trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE),
    );
    const offset = (page - 1) * pageSize;

    const conditions = [`p.status = 'active'`];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      const qIdx = params.length;
      conditions.push(
        `(p.canonical_title ILIKE $${qIdx} OR EXISTS (
           SELECT 1 FROM store_listings sl_q
           WHERE sl_q.product_id = p.id AND sl_q.raw_title ILIKE $${qIdx}
         ))`,
      );
    }

    if (categorySlug) {
      params.push(categorySlug);
      conditions.push(`c.slug = $${params.length}`);
    }

    if (storeId) {
      params.push(storeId);
      conditions.push(
        `EXISTS (SELECT 1 FROM store_listings sl_s WHERE sl_s.product_id = p.id AND sl_s.store_id = $${params.length})`,
      );
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    params.push(pageSize);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const itemsResult = await pool.query(
      `SELECT
         p.id,
         p.canonical_title,
         p.brand,
         p.primary_image_url,
         c.id AS category_id,
         c.name AS category_name,
         c.slug AS category_slug,
         COUNT(sl.id) AS listing_count,
         MIN(COALESCE(sl.cash_price, sl.price)) AS min_price,
         MAX(COALESCE(sl.cash_price, sl.price)) AS max_price,
         array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) AS store_names
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN store_listings sl ON sl.product_id = p.id
       LEFT JOIN stores s ON s.id = sl.store_id
       WHERE ${whereClause}
       GROUP BY p.id, c.id
       ORDER BY p.canonical_title ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: itemsResult.rows.map((row) => ({
        id: row.id,
        canonicalTitle: row.canonical_title,
        brand: row.brand,
        primaryImageUrl: row.primary_image_url,
        category: row.category_id
          ? { id: row.category_id, name: row.category_name, slug: row.category_slug }
          : null,
        listingCount: parseInt(row.listing_count, 10),
        minPrice: row.min_price != null ? Number(row.min_price) : null,
        maxPrice: row.max_price != null ? Number(row.max_price) : null,
        storeNames: row.store_names ?? [],
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — full detail: canonical record + every linked
// store listing, ready for side-by-side comparison in the panel.
productsRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const productResult = await pool.query(
      `SELECT p.id, p.canonical_title, p.brand, p.attributes, p.primary_image_url,
              p.status, p.created_at, p.updated_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1`,
      [id],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    const p = productResult.rows[0];

    const listingsResult = await pool.query(
      `SELECT sl.id, sl.raw_title, sl.normalized_title, sl.normalized_key,
              sl.url, sl.price, sl.cash_price, sl.installment_price, sl.installation_price,
              sl.in_category, sl.status, sl.last_seen_at, sl.last_seen_in_category_at,
              sl.search_attempts, sl.created_at,
              s.id AS store_id, s.name AS store_name, s.is_own_store
       FROM store_listings sl
       JOIN stores s ON s.id = sl.store_id
       WHERE sl.product_id = $1
       ORDER BY s.is_own_store DESC, s.name ASC`,
      [id],
    );

    res.json({
      id: p.id,
      canonicalTitle: p.canonical_title,
      brand: p.brand,
      attributes: p.attributes,
      primaryImageUrl: p.primary_image_url,
      status: p.status,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      category: p.category_id
        ? { id: p.category_id, name: p.category_name, slug: p.category_slug }
        : null,
      listings: listingsResult.rows.map((l) => ({
        id: l.id,
        store: { id: l.store_id, name: l.store_name, isOwnStore: l.is_own_store },
        rawTitle: l.raw_title,
        normalizedTitle: l.normalized_title,
        normalizedKey: l.normalized_key,
        url: l.url,
        price: l.price != null ? Number(l.price) : null,
        cashPrice: l.cash_price != null ? Number(l.cash_price) : null,
        installmentPrice: l.installment_price != null ? Number(l.installment_price) : null,
        installationPrice: l.installation_price != null ? Number(l.installation_price) : null,
        inCategory: l.in_category,
        status: l.status,
        lastSeenAt: l.last_seen_at,
        lastSeenInCategoryAt: l.last_seen_in_category_at,
        searchAttempts: l.search_attempts,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/products/:id — update product details (e.g. canonicalTitle)
productsRouter.patch("/:id", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { canonicalTitle } = req.body || {};

    if (!canonicalTitle || typeof canonicalTitle !== "string" || !canonicalTitle.trim()) {
      return res.status(400).json({ error: "canonicalTitle is required" });
    }

    await client.query("BEGIN");

    const productRes = await client.query(
      `SELECT id, canonical_title, status FROM products WHERE id = $1`,
      [id],
    );

    if (productRes.rows.length === 0 || productRes.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found or not active" });
    }

    const previousTitle = productRes.rows[0].canonical_title;
    const newTitle = canonicalTitle.trim();

    const updateRes = await client.query(
      `UPDATE products
       SET canonical_title = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, canonical_title, brand, category_id, updated_at`,
      [newTitle, id],
    );

    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES ('product_title_updated', 'products', $1, $2::jsonb)`,
      [
        id,
        JSON.stringify({
          previous_title: previousTitle,
          new_title: newTitle,
        }),
      ],
    );

    await client.query("COMMIT");
    res.json({
      ok: true,
      canonicalTitle: updateRes.rows[0].canonical_title,
      updatedAt: updateRes.rows[0].updated_at,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/products/:id/manual-match — manually merge another product (otherProductId)
// into this product (:id). Reassigns all store listings, marks otherProductId as merged,
// creates a confirmed candidate record, and records an audit log entry.
productsRouter.post("/:id/manual-match", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { otherProductId } = req.body || {};

    if (!otherProductId || typeof otherProductId !== "string") {
      return res.status(400).json({ error: "otherProductId is required" });
    }

    if (id === otherProductId) {
      return res.status(400).json({ error: "Cannot merge a product into itself" });
    }

    await client.query("BEGIN");

    const targetRes = await client.query(
      `SELECT id, canonical_title, category_id, status FROM products WHERE id = $1`,
      [id],
    );
    if (targetRes.rows.length === 0 || targetRes.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Target product not found or not active" });
    }

    const otherRes = await client.query(
      `SELECT id, canonical_title, category_id, status FROM products WHERE id = $1`,
      [otherProductId],
    );
    if (otherRes.rows.length === 0 || otherRes.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product to merge not found or not active" });
    }

    // Note: If target and other product belong to different categories, we still allow
    // the merge (admin manual judgment call overrides automatic category detection).

    // 1. Reassign every listing from otherProductId to id
    await client.query(
      `UPDATE store_listings SET product_id = $1 WHERE product_id = $2`,
      [id, otherProductId],
    );

    // 2. Mark otherProductId as merged rather than deleting it
    await client.query(
      `UPDATE products SET status = 'merged', merged_into_id = $1 WHERE id = $2`,
      [id, otherProductId],
    );

    // 3. Record in product_merge_candidates directly as confirmed
    const candidateRes = await client.query(
      `INSERT INTO product_merge_candidates (product_a_id, product_b_id, confidence_score, status, reviewed_at)
       VALUES ($1, $2, 1.0, 'confirmed', now())
       ON CONFLICT (product_a_id, product_b_id)
       DO UPDATE SET status = 'confirmed', confidence_score = 1.0, reviewed_at = now()
       RETURNING id`,
      [id, otherProductId],
    );
    const candidateId = candidateRes.rows[0]?.id;

    // 4. Log to audit_log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES ('manual_merge', 'products', $1, $2::jsonb)`,
      [
        id,
        JSON.stringify({
          product_a_id: id,
          product_b_id: otherProductId,
          candidate_id: candidateId,
        }),
      ],
    );

    await client.query("COMMIT");
    res.json({ ok: true, mergedInto: id });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /api/products/:id — archive/delete a product from the database
productsRouter.delete("/:id", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const productRes = await client.query(
      `SELECT id, canonical_title, status FROM products WHERE id = $1`,
      [id],
    );

    if (productRes.rows.length === 0 || productRes.rows[0].status === "archived") {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    const p = productRes.rows[0];

    // 1. Mark product as archived
    await client.query(
      `UPDATE products SET status = 'archived', updated_at = now() WHERE id = $1`,
      [id],
    );

    // 2. Unassign linked store listings
    await client.query(
      `UPDATE store_listings SET product_id = NULL WHERE product_id = $1`,
      [id],
    );

    // 3. Remove any pending merge suggestions involving this product
    await client.query(
      `DELETE FROM product_merge_candidates WHERE (product_a_id = $1 OR product_b_id = $1) AND status = 'suggested'`,
      [id],
    );

    // 4. Log to audit_log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES ('product_deleted', 'products', $1, $2::jsonb)`,
      [id, JSON.stringify({ canonical_title: p.canonical_title })],
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});
