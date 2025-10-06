import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

/**
 * GET /api/search
 * Advanced product search with filters
 */
router.get("/", async (req, res) => {
  try {
    const {
      q = "", // search query
      page = 1,
      per_page = 12,
      category = "",
      tag = "",
      min_price = "",
      max_price = "",
      featured = "",
      on_sale = "",
      in_stock = "",
      orderby = "date",
      order = "desc",
    } = req.query;

    const params = {
      search: q,
      page: parseInt(page),
      per_page: parseInt(per_page),
      orderby,
      order,
      status: "publish",
    };

    // Add filters
    if (category) params.category = category;
    if (tag) params.tag = tag;
    if (min_price) params.min_price = min_price;
    if (max_price) params.max_price = max_price;
    if (featured !== "") params.featured = featured === "true";
    if (on_sale !== "") params.on_sale = on_sale === "true";
    if (in_stock !== "")
      params.stock_status = in_stock === "true" ? "instock" : "outofstock";

    const response = await api.get("products", params);

    const totalPages = parseInt(response.headers["x-wp-totalpages"]) || 0;
    const totalProducts = parseInt(response.headers["x-wp-total"]) || 0;

    const meta = {
      search_query: q,
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total_pages: totalPages,
      total_products: totalProducts,
      applied_filters: {
        category,
        tag,
        min_price,
        max_price,
        featured: featured !== "" ? featured === "true" : null,
        on_sale: on_sale !== "" ? on_sale === "true" : null,
        in_stock: in_stock !== "" ? in_stock === "true" : null,
      },
    };

    const filteredProducts = response.data.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      type: product.type,
      permalink: product.permalink,
      date_created: product.date_created,
      date_created_gmt: product.date_created_gmt,
      date_modified: product.date_modified,
      date_modified_gmt: product.date_modified_gmt,
      price: product.price,
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      price_html: (() => {
        const match = product.price_html?.match(/>(£|\$|&pound;)?\s*([\d.,]+)/);
        return match ? match[2] : "";
      })(),
      stock_status: product.stock_status,
      categories: product.categories || [],
      images: product.images || [],
      attributes: product.attributes || [],
      variations: product.variations || [],
      yoast_head_json: {
        og_image: product.yoast_head_json?.og_image || [],
      },
    }));

    successResponse(
      res,
      filteredProducts,
      "Product search completed successfully",
      meta
    );
  } catch (error) {
    handleError(res, error, "Failed to search products");
  }
});

export default router;

