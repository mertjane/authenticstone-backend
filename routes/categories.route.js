import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

/**
 * GET /api/categories
 * Fetch product categories
 */
router.get("/", async (req, res) => {
  try {
    const per_page = parseInt(req.query.per_page) || 100;
    const { data } = await api.get("products/categories", {
      per_page: per_page,
      hide_empty: false, // Set to true if you only want categories with products
    });

    // Filter to only the parts you want
    const filtered = data.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      count: category.count,
      og_url: category.yoast_head_json?.og_url || null,
    }));

    res.json(filtered);
  } catch (error) {
    console.error(
      "Categories fetch error:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

export default router;

