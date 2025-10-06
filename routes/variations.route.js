import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

/**
 * GET /api/variation/:productId/:variationId
 * Fetch single product variation
 */
router.get("/:productId/:variationId", async (req, res) => {
  try {
    const { productId, variationId } = req.params;
    const response = await api.get(
      `products/${productId}/variations/${variationId}`
    );
    successResponse(
      res,
      response.data,
      "Product variation fetched successfully"
    );
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Product variation not found",
      });
    } else {
      handleError(res, error, "Failed to fetch product variation");
    }
  }
});

export default router;

