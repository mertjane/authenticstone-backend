import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

/**
 * GET /api/tags
 * Fetch product tags
 */
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 100,
      search = "",
      orderby = "name",
      order = "asc",
    } = req.query;

    const params = {
      page: parseInt(page),
      per_page: parseInt(per_page),
      orderby,
      order,
    };

    if (search) params.search = search;

    const response = await api.get("products/tags", params);

    const totalPages = parseInt(response.headers["x-wp-totalpages"]) || 0;
    const totalTags = parseInt(response.headers["x-wp-total"]) || 0;

    const meta = {
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total_pages: totalPages,
      total_tags: totalTags,
    };

    successResponse(
      res,
      response.data,
      "Product tags fetched successfully",
      meta
    );
  } catch (error) {
    handleError(res, error, "Failed to fetch product tags");
  }
});

export default router;

