import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("Adding missing stores and categories...");

  // 1. Insert missing stores
  const storeRes = await pool.query(`
    INSERT INTO stores (name, is_active, is_own_store, scraper_config)
    VALUES 
      ('notebookcentre', true, false, '{}'::jsonb),
      ('dgcomp', true, false, '{}'::jsonb),
      ('notebookmall', true, false, '{}'::jsonb),
      ('miarmenia', true, false, '{}'::jsonb),
      ('smartbox', true, false, '{}'::jsonb)
    ON CONFLICT (name) DO NOTHING
    RETURNING *;
  `);
  console.log("Stores inserted:", storeRes.rows);

  // 2. Insert missing categories
  const catRes = await pool.query(`
    INSERT INTO categories (name, slug)
    VALUES 
      ('Camera', 'camera'),
      ('Cleaners', 'cleaners'),
      ('Printers', 'printers'),
      ('Monitors', 'monitors'),
      ('Drones', 'drones'),
      ('Projectors', 'projectors')
    ON CONFLICT (slug) DO NOTHING
    RETURNING *;
  `);
  console.log("Categories inserted:", catRes.rows);

  const allStores = await pool.query("SELECT id, name, is_active, is_own_store FROM stores ORDER BY name");
  console.log("=== All Stores in DB ===");
  console.table(allStores.rows);

  const allCats = await pool.query("SELECT id, name, slug FROM categories ORDER BY slug");
  console.log("=== All Categories in DB ===");
  console.table(allCats.rows);

  await pool.end();
}

main().catch(console.error);
