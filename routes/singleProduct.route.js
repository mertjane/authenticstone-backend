import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

/**
 * GET /api/product/:id
 * Fetch single product by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await api.get(`products/${id}`);

    const product = response.data;

    // Helper function to extract price from price_html
    const extractPrice = (priceHtml) => {
      if (!priceHtml) return null;
      // Remove HTML tags and extract just the number
      const priceMatch = priceHtml.match(/[\d,]+\.?\d*/);
      return priceMatch ? priceMatch[0] : null;
    };

    // Filter only the fields you want
    const filtered = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      permalink: product.permalink,
      categories: product.categories,
      images: product.images,
      attributes: product.attributes,
      variations: product.variations,
      price: extractPrice(product.price_html),
    };

    // Send filtered data directly
    res.status(200).json(filtered);
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
    } else {
      handleError(res, error, "Failed to fetch product");
    }
  }
});

/**
 * GET /api/product/by-name/:name
 * Fetch single product by name/slug
 */
router.get("/by-name/:name", async (req, res) => {
  try {
    const { name } = req.params;
    
    // Search for products by slug or name
    const response = await api.get("products", {
      slug: name,
      per_page: 1,
      status: "publish"
    });

    if (!response.data || response.data.length === 0) {
      // If no product found by slug, try searching by name
      const nameSearchResponse = await api.get("products", {
        search: name,
        per_page: 1,
        status: "publish"
      });

      if (!nameSearchResponse.data || nameSearchResponse.data.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }
      
      // Use the first result from name search
      const product = nameSearchResponse.data[0];
      
      // Helper function to extract price from price_html
      const extractPrice = (priceHtml) => {
        if (!priceHtml) return null;
        // Remove HTML tags and extract just the number
        const priceMatch = priceHtml.match(/[\d,]+\.?\d*/);
        return priceMatch ? priceMatch[0] : null;
      };

      // Filter only the fields you want
      const filtered = {
        id: product.id,
        name: product.name,
        slug: product.slug,
        permalink: product.permalink,
        categories: product.categories,
        images: product.images,
        attributes: product.attributes,
        variations: product.variations,
        price: extractPrice(product.price_html),
      };

      return res.status(200).json(filtered);
    }

    // Product found by slug
    const product = response.data[0];

    // Helper function to extract price from price_html
    const extractPrice = (priceHtml) => {
      if (!priceHtml) return null;
      // Remove HTML tags and extract just the number
      const priceMatch = priceHtml.match(/[\d,]+\.?\d*/);
      return priceMatch ? priceMatch[0] : null;
    };

    // Filter only the fields you want
    const filtered = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      permalink: product.permalink,
      categories: product.categories,
      images: product.images,
      attributes: product.attributes,
      variations: product.variations,
      price: extractPrice(product.price_html),
    };

    // Send filtered data directly
    res.status(200).json(filtered);
  } catch (error) {
    handleError(res, error, "Failed to fetch product by name");
  }
});

/**
 * GET /api/product/:id/variations
 * Fetch product variations
 */
router.get("/:id/variations", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, per_page = 100 } = req.query;
    const params = {
      page: parseInt(page),
      per_page: parseInt(per_page),
    };

    // Correct axios call with params inside object
    const response = await api.get(`products/${id}/variations`, { params });

    // Ensure response.data is an array
    if (!Array.isArray(response.data)) {
      console.log("Response.data is not an array:", response.data);
      return res.status(500).json({
        success: false,
        message: "Unexpected response format from API",
      });
    }

    // Filter only the fields you want
    const filtered = response.data.map((v) => ({
      id: v.id,
      name: v.name,
      instock: v.stock_status === "instock",
      price: v.price,
      stock_quantity: v.stock_quantity,
      attributes: v.attributes,
    }));

    // Send filtered data ONLY
    res.status(200).json(filtered);
  } catch (error) {
    console.log("Error details:", error.response?.data || error.message);
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Product not found or no variations available",
      });
    } else {
      handleError(res, error, "Failed to fetch product variations");
    }
  }
});

export default router;

