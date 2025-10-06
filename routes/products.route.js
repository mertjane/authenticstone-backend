import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

/**
 * GET /api/products
 * Fetch products with pagination (9 per page default)
 */
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 9,
      search = "",
      category = "",
      status = "publish",
      featured = "",
      on_sale = "",
      orderby = "date",
      order = "desc",
    } = req.query;

    const params = {
      page: parseInt(page),
      per_page: parseInt(per_page),
      status,
      orderby,
      order,
    };

    // Add optional filters
    if (search) params.search = search;
    if (category) params.category = category;
    if (featured !== "") params.featured = featured === "true";
    if (on_sale !== "") params.on_sale = on_sale === "true";

    const response = await api.get("products", { params });

    // Get total pages from headers
    const totalPages = parseInt(response.headers["x-wp-totalpages"]) || 0;
    const totalProducts = parseInt(response.headers["x-wp-total"]) || 0;

    const meta = {
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total_pages: totalPages,
      total_products: totalProducts,
      has_next_page: parseInt(page) < totalPages,
      has_prev_page: parseInt(page) > 1,
    };

    const filteredProducts = response.data.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
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
      "Products fetched successfully",
      meta
    );
  } catch (error) {
    handleError(res, error, "Failed to fetch products");
  }
});

/**
 * GET /api/products/new-arrivals
 * Fetch new arrival products (from last 12 months)
 */
router.get("/new-arrivals", async (req, res) => {
  try {
    const perPage = parseInt(req.query.per_page) || 12;
    const page = parseInt(req.query.page) || 1;

    // Calculate ISO date for 12 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 12);
    const afterDate = sixMonthsAgo.toISOString();

    // Fetch products using WooCommerce API
    const response = await api.get("products", {
      per_page: perPage,
      page,
      orderby: "date",
      order: "desc",
      after: afterDate,
    });

    const products = response.data;

    // Get total pages and total count from headers
    const totalPages = parseInt(response.headers["x-wp-totalpages"]) || 0;
    const totalProducts = parseInt(response.headers["x-wp-total"]) || 0;

    // Pagination meta
    const meta = {
      current_page: page,
      per_page: perPage,
      total_pages: totalPages,
      total_products: totalProducts,
      has_next_page: page < totalPages,
      has_prev_page: page > 1,
    };

    // Filtered fields from product
    const filteredProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
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

    // Return response
    successResponse(
      res,
      filteredProducts,
      "New arrivals fetched successfully",
      meta
    );
  } catch (error) {
    handleError(res, error, "Failed to fetch new arrivals");
  }
});

/**
 * GET /api/products/by-category
 * Fetch products by category slug or ID
 */
router.get("/by-category", async (req, res) => {
  try {
    const {
      category = "",
      page = 1,
      per_page = 12,
      orderby = "date",
      order = "desc",
    } = req.query;

    if (!category) {
      return res.status(400).json({ error: "Category parameter is required" });
    }

    // 1. Fetch categories to find the ID from slug
    const categoriesResponse = await api.get("products/categories", {
      per_page: 100,
      slug: category,
    });

    if (!categoriesResponse.data.length) {
      return res.status(404).json({ error: "Category not found" });
    }

    const categoryId = categoriesResponse.data[0].id;
    const categoryTotalProducts = categoriesResponse.data[0].count || 0;

    // 2. Fetch products filtered by category ID
    const params = {
      category: categoryId,
      page: parseInt(page),
      per_page: parseInt(per_page),
      orderby,
      order,
      status: "publish",
    };

    // Pass params directly, not wrapped in { params }
    const response = await api.get("products", params);

    // Use headers if available, otherwise fall back to category count
    const totalFromHeaders =
      parseInt(response.headers["x-wp-total"]) || categoryTotalProducts;
    const totalPagesFromHeaders =
      parseInt(response.headers["x-wp-totalpages"]) ||
      Math.ceil(categoryTotalProducts / parseInt(per_page));

    // Double-check filtering on the server side as backup
    const filteredByCategory = response.data.filter((product) => {
      return (
        product.categories &&
        product.categories.some((cat) => cat.id === categoryId)
      );
    });

    const meta = {
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total_pages: totalPagesFromHeaders,
      total_products: totalFromHeaders,
      has_next_page: parseInt(page) < totalPagesFromHeaders,
      has_prev_page: parseInt(page) > 1,
      category_id: categoryId,
      category_slug: category,
    };

    const filteredProducts = filteredByCategory.map((product) => ({
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
        if (typeof product.price_html === "string") {
          const match = product.price_html.match(
            />(£|\$|&pound;)?\s*([\d.,]+)/
          );
          return match ? match[2] : "";
        } else {
          console.warn(
            `Unexpected price_html value for product ${product.id}:`,
            product.price_html
          );
        }
        return "";
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
      "Products by category fetched",
      meta
    );
  } catch (error) {
    console.error("Error fetching products by category:", error);
    console.error("Error details:", error.response?.data);
    handleError(res, error, "Failed to fetch products by category");
  }
});

/**
 * GET /api/products/by-category-alt
 * Alternative approach - using WooCommerce's category parameter format
 */
router.get("/by-category-alt", async (req, res) => {
  try {
    const {
      category = "",
      page = 1,
      per_page = 12,
      orderby = "date",
      order = "desc",
    } = req.query;

    if (!category) {
      return res.status(400).json({ error: "Category parameter is required" });
    }

    // 1. Fetch categories to find the ID from slug
    const categoriesResponse = await api.get("products/categories", {
      per_page: 100,
      slug: category,
    });

    if (!categoriesResponse.data.length) {
      return res.status(404).json({ error: "Category not found" });
    }

    const categoryId = categoriesResponse.data[0].id;

    // 2. Try different parameter formats for category filtering
    const params = {
      category: categoryId.toString(),
      page: parseInt(page),
      per_page: parseInt(per_page),
      orderby,
      order,
      status: "publish",
    };

    const response = await api.get("products", { params });

    // Manual filtering as backup
    const categoryFilteredProducts = response.data.filter((product) => {
      return (
        product.categories &&
        product.categories.some((cat) => cat.id === categoryId)
      );
    });

    const totalPages = Math.ceil(
      categoryFilteredProducts.length / parseInt(per_page)
    );
    const totalProducts = categoryFilteredProducts.length;

    // Paginate manually if API didn't filter correctly
    const startIndex = (parseInt(page) - 1) * parseInt(per_page);
    const endIndex = startIndex + parseInt(per_page);
    const paginatedProducts = categoryFilteredProducts.slice(
      startIndex,
      endIndex
    );

    const meta = {
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total_pages: totalPages,
      total_products: totalProducts,
      has_next_page: parseInt(page) < totalPages,
      has_prev_page: parseInt(page) > 1,
      category_id: categoryId,
      category_slug: category,
    };

    const filteredProducts = paginatedProducts.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
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
      "Products by category fetched",
      meta
    );
  } catch (error) {
    console.error("Error fetching products by category:", error);
    handleError(res, error, "Failed to fetch products by category");
  }
});

export default router;
