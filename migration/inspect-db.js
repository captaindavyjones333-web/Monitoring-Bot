import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const storeCols = await pool.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'stores' ORDER BY ordinal_position"
  );
  console.log("=== STORES COLUMNS ===");
  console.table(storeCols.rows);

  const catCols = await pool.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'categories' ORDER BY ordinal_position"
  );
  console.log("=== CATEGORIES COLUMNS ===");
  console.table(catCols.rows);

  const stores = await pool.query("SELECT * FROM stores ORDER BY id");
  console.log("=== STORES ROWS ===");
  console.table(stores.rows);

  const categories = await pool.query("SELECT * FROM categories ORDER BY id");
  console.log("=== CATEGORIES ROWS ===");
  console.table(categories.rows);

  await pool.end();
}

main().catch(console.error);
