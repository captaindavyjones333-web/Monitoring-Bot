import express from "express";
import cors from "cors";
import { metaRouter } from "./routes/meta.js";
import { productsRouter } from "./routes/products.js";
import { reviewQueueRouter } from "./routes/reviewQueue.js";
import { listingsRouter } from "./routes/listings.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api", metaRouter);
app.use("/api/products", productsRouter);
app.use("/api/review-queue", reviewQueueRouter);
app.use("/api/listings", listingsRouter);

// Central error handler — keeps route handlers free of try/catch boilerplate
// duplication for the "something unexpected happened" case.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});