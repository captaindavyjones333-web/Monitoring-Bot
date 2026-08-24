import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const res = await pool.query(`
    SELECT p.id, p.canonical_title, s.name as store_name, sl.raw_title, sl.normalized_key, sl.cash_price
    FROM products p
    JOIN store_listings sl ON sl.product_id = p.id
    JOIN stores s ON s.id = sl.store_id
    WHERE p.canonical_title ILIKE '%iPhone 17 Pro Max%eSim%'
    ORDER BY p.canonical_title, s.name
  `);
  console.log("DB rows count:", res.rows.length);
  for (const r of res.rows) {
    console.log(r);
  }
  await pool.end();
}

main();
