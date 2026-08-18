import { Router } from "express";
import { pool } from "../db.js";

export const metaRouter = Router();

// GET /api/categories — for the category filter dropdown
metaRouter.get("/categories", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug FROM categories ORDER BY name`,
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/stores — for the store filter dropdown
metaRouter.get("/stores", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, is_own_store, is_active
       FROM stores
       ORDER BY is_own_store DESC, name`,
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});