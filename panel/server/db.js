import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  // Unexpected error on an idle client — log and let the process keep running,
  // pg will create a new client for the next query.
  console.error("Unexpected Postgres pool error:", err);
});