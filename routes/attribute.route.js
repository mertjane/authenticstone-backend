import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

/**
 * GET /api/attribute/:id
 * Fetch single product attribute
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await api.get(`products/attributes/${id}`);
    successResponse(
      res,
      response.data,
      "Product attribute fetched successfully"
    );
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Product attribute not found",
      });
    } else {
      handleError(res, error, "Failed to fetch product attribute");
    }
  }
});

/**
 * GET /api/attribute/:id/terms
 * Fetch attribute terms
 */
router.get("/:id/terms", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, per_page = 100, search = "" } = req.query;

    const params = {
      page: parseInt(page),
      per_page: parseInt(per_page),
    };

    if (search) params.search = search;

    const response = await api.get(`products/attributes/${id}/terms`, params);

    const totalPages = parseInt(response.headers["x-wp-totalpages"]) || 0;
    const totalTerms = parseInt(response.headers["x-wp-total"]) || 0;

    // Filter terms to only necessary fields
    const filteredTerms = response.data.map((term) => ({
      id: term.id,
      name: term.name,
      slug: term.slug,
      count: term.count,
      _links: {
        collection:
          term._links?.collection?.map((link) => ({
            href: link.href,
          })) || [],
      },
    }));

    const meta = {
      attribute_id: parseInt(id),
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total_pages: totalPages,
      total_terms: totalTerms,
    };

    successResponse(
      res,
      filteredTerms,
      "Attribute terms fetched successfully",
      meta
    );
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Attribute not found or no terms available",
      });
    } else {
      handleError(res, error, "Failed to fetch attribute terms");
    }
  }
});

export default router;

