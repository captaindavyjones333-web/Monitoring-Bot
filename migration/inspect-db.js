import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'store_listings'
  `);
  for (const r of res.rows) {
    console.log(r);
  }
  await pool.end();
}

main();
