import { Router } from "express";
import { pool } from "../db.js";

export const reviewQueueRouter = Router();

const DEFAULT_PAGE_SIZE = 20;

// GET /api/review-queue?page=&pageSize=
// Suggested product-to-product merge candidates, highest confidence first.
reviewQueueRouter.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE),
    );
    const offset = (page - 1) * pageSize;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM product_merge_candidates WHERE status = 'suggested'`,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await pool.query(
      `SELECT
         pmc.id,
         pmc.confidence_score,
         pmc.created_at,
         pa.id AS a_id, pa.canonical_title AS a_title,
         (SELECT COUNT(*) FROM store_listings WHERE product_id = pa.id) AS a_listing_count,
         (SELECT array_agg(DISTINCT s.name) FROM store_listings sl JOIN stores s ON s.id = sl.store_id WHERE sl.product_id = pa.id) AS a_stores,
         pb.id AS b_id, pb.canonical_title AS b_title,
         (SELECT COUNT(*) FROM store_listings WHERE product_id = pb.id) AS b_listing_count,
         (SELECT array_agg(DISTINCT s.name) FROM store_listings sl JOIN stores s ON s.id = sl.store_id WHERE sl.product_id = pb.id) AS b_stores,
         c.name AS category_name
       FROM product_merge_candidates pmc
       JOIN products pa ON pa.id = pmc.product_a_id
       JOIN products pb ON pb.id = pmc.product_b_id
       LEFT JOIN categories c ON c.id = pa.category_id
       WHERE pmc.status = 'suggested'
       ORDER BY pmc.confidence_score DESC, pmc.created_at ASC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: result.rows.map((row) => ({
        id: row.id,
        confidenceScore: Number(row.confidence_score),
        createdAt: row.created_at,
        category: row.category_name,
        productA: {
          id: row.a_id,
          canonicalTitle: row.a_title,
          listingCount: parseInt(row.a_listing_count, 10),
          storeNames: row.a_stores ?? [],
        },
        productB: {
          id: row.b_id,
          canonicalTitle: row.b_title,
          listingCount: parseInt(row.b_listing_count, 10),
          storeNames: row.b_stores ?? [],
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/review-queue/:id/confirm — merge product_b into product_a
reviewQueueRouter.post("/:id/confirm", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");

    const candidateResult = await client.query(
      `SELECT * FROM product_merge_candidates WHERE id = $1 AND status = 'suggested'`,
      [id],
    );
    if (candidateResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Candidate not found or already reviewed" });
    }
    const candidate = candidateResult.rows[0];

    // Reassign every listing from product_b to product_a.
    await client.query(
      `UPDATE store_listings SET product_id = $1 WHERE product_id = $2`,
      [candidate.product_a_id, candidate.product_b_id],
    );

    // Mark product_b as merged rather than deleting it — keeps history intact.
    await client.query(
      `UPDATE products SET status = 'merged', merged_into_id = $1 WHERE id = $2`,
      [candidate.product_a_id, candidate.product_b_id],
    );

    await client.query(
      `UPDATE product_merge_candidates SET status = 'confirmed', reviewed_at = now() WHERE id = $1`,
      [id],
    );

    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES ('merge_confirmed', 'product_merge_candidates', $1, $2::jsonb)`,
      [id, JSON.stringify({ product_a_id: candidate.product_a_id, product_b_id: candidate.product_b_id })],
    );

    await client.query("COMMIT");
    res.json({ ok: true, mergedInto: candidate.product_a_id });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/review-queue/:id/reject — mark reviewed, never resurfaces
reviewQueueRouter.post("/:id/reject", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE product_merge_candidates
       SET status = 'rejected', reviewed_at = now()
       WHERE id = $1 AND status = 'suggested'
       RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Candidate not found or already reviewed" });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});