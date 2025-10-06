import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

/**
 * GET /api/attributes
 * Fetch all product attributes
 */
router.get("/", async (req, res) => {
  try {
    const { data } = await api.get("products/attributes");

    const allowedSlugs = [
      "pa_material",
      "pa_room-type-usage",
      "pa_finish",
      "pa_colour",
    ];

    const filtered = data
      .filter((attr) => allowedSlugs.includes(attr.slug))
      .map((attr) => ({
        id: attr.id,
        name: attr.name,
        slug: attr.slug,
        type: attr.type,
        order_by: attr.order_by,
        has_archives: attr.has_archives,
      }));

    res.json(filtered);
  } catch (error) {
    console.error(
      "Attributes fetch error:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch attributes" });
  }
});

export default router;

