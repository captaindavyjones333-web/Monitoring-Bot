import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rejected_matches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      raw_title text,
      url text,
      external_id text,
      rejected_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rejected_matches_url 
      ON rejected_matches (store_id, product_id, url) WHERE url IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rejected_matches_title 
      ON rejected_matches (store_id, product_id, raw_title) WHERE raw_title IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_rejected_matches_product 
      ON rejected_matches (product_id);
    CREATE INDEX IF NOT EXISTS idx_rejected_matches_store 
      ON rejected_matches (store_id);
  `);
  console.log("rejected_matches table initialized successfully.");
  await pool.end();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

