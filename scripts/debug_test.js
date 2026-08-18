import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query(`
    SELECT sl.id, sl.raw_title, sl.normalized_key, sl.cash_price, s.name as store_name, p.canonical_title
    FROM store_listings sl
    JOIN stores s ON s.id = sl.store_id
    JOIN products p ON p.id = sl.product_id
    WHERE sl.raw_title ILIKE '%Neo%' OR p.canonical_title ILIKE '%Neo%'
  `);
  console.log("Neo listings in DB:", res.rows);
  await pool.end();
}

main();
