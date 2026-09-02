import { Router } from "express";
import { pool } from "../db.js";

export const listingsRouter = Router();

// POST /api/listings/:id/check-url
// Fetches the listing's stored URL server-side and updates its status
// based on whether it still resolves. Replaces the originally-planned
// Puppeteer search-fallback now that every listing carries a URL — see
// product-db-design.md §4.
listingsRouter.post("/:id/check-url", async (req, res, next) => {
  try {
    const { id } = req.params;

    const listingResult = await pool.query(
      `SELECT id, url, status FROM store_listings WHERE id = $1`,
      [id],
    );
    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }
    const listing = listingResult.rows[0];

    if (!listing.url) {
      return res.status(400).json({ error: "This listing has no URL to check" });
    }

    let newStatus;
    try {
      const response = await fetch(listing.url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 200) {
        newStatus = "active";
      } else if (response.status === 404) {
        newStatus = "removed";
      } else {
        newStatus = "unknown";
      }
    } catch {
      // Network error, timeout, DNS failure, etc. — can't tell if it's
      // really gone or just a transient issue, so don't jump to "removed".
      newStatus = "unknown";
    }

    const updateResult = await pool.query(
      `UPDATE store_listings
       SET status = $1, last_checked_at = now()
       WHERE id = $2
       RETURNING id, status, last_checked_at`,
      [newStatus, id],
    );

    res.json({
      id: updateResult.rows[0].id,
      status: updateResult.rows[0].status,
      lastCheckedAt: updateResult.rows[0].last_checked_at,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/listings/:id/unlink
// Unlinks a store listing from its current canonical product and creates a new
// standalone canonical product for it so it remains searchable and manageable.
listingsRouter.post("/:id/unlink", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");

    const listingResult = await client.query(
      `SELECT sl.id, sl.store_id, sl.product_id, sl.raw_title, sl.normalized_title, sl.url, sl.external_id,
              p.category_id, p.brand, p.canonical_title AS parent_title
       FROM store_listings sl
       LEFT JOIN products p ON p.id = sl.product_id
       WHERE sl.id = $1`,
      [id],
    );
    if (listingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Listing not found" });
    }
    const listing = listingResult.rows[0];

    const previousProductId = listing.product_id;
    // Use the listing's raw_title as the new group title
    const title = (listing.raw_title || listing.normalized_title || "").trim() || listing.parent_title || "";

    // 1. Create a new independent product for this unlinked listing
    const productRes = await client.query(
      `INSERT INTO products (canonical_title, category_id, brand, attributes, status)
       VALUES ($1, $2, $3, '{}'::jsonb, 'active')
       RETURNING id, canonical_title`,
      [title, listing.category_id || null, listing.brand || null],
    );
    const newProductId = productRes.rows[0].id;

    // 2. Reassign the listing to the newly created product
    await client.query(
      `UPDATE store_listings SET product_id = $1 WHERE id = $2`,
      [newProductId, id],
    );

    // 2b. Record explicit rejection in rejected_matches and product_matches
    if (previousProductId) {
      await client.query(
        `INSERT INTO rejected_matches (store_id, product_id, raw_title, url, external_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [listing.store_id, previousProductId, listing.raw_title, listing.url || null, listing.external_id || null],
      );

      await client.query(
        `UPDATE product_matches 
         SET status = 'rejected', reviewed_at = now()
         WHERE store_listing_id = $1 AND product_id = $2`,
        [id, previousProductId],
      );
    }

    // 3. Log to audit_log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES ('listing_unlinked', 'store_listings', $1, $2::jsonb)`,
      [
        id,
        JSON.stringify({
          listing_id: id,
          previous_product_id: previousProductId,
          new_product_id: newProductId,
          raw_title: listing.raw_title,
        }),
      ],
    );

    await client.query("COMMIT");
    res.json({
      ok: true,
      unlinkedListingId: id,
      previousProductId,
      newProductId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /api/listings/:id — permanently delete a store listing from the database
listingsRouter.delete("/:id", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");

    const listingResult = await client.query(
      `SELECT id, product_id, raw_title, store_id FROM store_listings WHERE id = $1`,
      [id],
    );
    if (listingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Listing not found" });
    }
    const listing = listingResult.rows[0];

    // 1. Delete associated price_history rows if any
    await client.query(
      `DELETE FROM price_history WHERE store_listing_id = $1`,
      [id],
    );

    // 2. Delete associated product_matches rows if any
    await client.query(
      `DELETE FROM product_matches WHERE store_listing_id = $1`,
      [id],
    );

    // 3. Delete the store listing
    await client.query(
      `DELETE FROM store_listings WHERE id = $1`,
      [id],
    );

    // 4. Log to audit_log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES ('listing_deleted', 'store_listings', $1, $2::jsonb)`,
      [
        id,
        JSON.stringify({
          listing_id: id,
          product_id: listing.product_id,
          raw_title: listing.raw_title,
          store_id: listing.store_id,
        }),
      ],
    );

    await client.query("COMMIT");
    res.json({ ok: true, deletedListingId: id });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});