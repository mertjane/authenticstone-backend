import dotenv from "dotenv";
import pagesRouter from "./routes/pages.route.js";
import cartRouter from "./routes/cart.route.js";
import authRouter from "./routes/auth.route.js";
import sortRouter from "./routes/sort.route.js";
import searchRouter from "./routes/search.route.js";
import filterRouter from "./routes/filters.route.js";

import bodyParser from "body-parser";
import session from "express-session";
import express from "express";
import cors from "cors";
import WooCommerceRestApiPkg from "@woocommerce/woocommerce-rest-api";

dotenv.config();

const WooCommerceRestApi =
  WooCommerceRestApiPkg.default || WooCommerceRestApiPkg;

const app = express();

const corsOptions = {
  origin: [
    /* "http://localhost:5173", */ // Development URL
    'https://a6726e9a.authenticstone-frontend.pages.dev', // Production URL
    process.env.FRONTEND_URL, // Use environment variable as fallback
  ].filter(Boolean), // Remove any undefined values
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Session configuration (using memory store - no database needed)
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/** WOOCOMMERCE API CONFIG */
export const api = new WooCommerceRestApi({
  url: process.env.WC_SITE_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
});

// Error handler middleware
export const handleError = (res, error, message = "Internal server error") => {
  console.error(`Error: ${message}`, error.response?.data || error.message);
  res.status(500).json({
    success: false,
    message,
    error: error.response?.data || error.message,
  });
};

// Success response helper
export const successResponse = (res, data, message = "Success", meta = {}) => {
  res.status(200).json({
    success: true,
    message,
    data,
    meta,
  });
};

// routes
app.use("/api/pages", pagesRouter);
app.use("/api/cart", cartRouter);
app.use("/api/auth", authRouter);
app.use("/api/sort", sortRouter);
app.use("/api/suggestions", searchRouter);
app.use("/api/products", filterRouter);

/**
 * GET /api/products
 * Fetch products with pagination (12 per page)
 */
app.get("/api/products", async (req, res) => {
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
 * Fetch products with pagination (12 per page)
 */

app.get("/api/products/new-arrivals", async (req, res) => {
  try {
    const perPage = parseInt(req.query.per_page) || 12;
    const page = parseInt(req.query.page) || 1;

    // Calculate ISO date for 6 months ago
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
app.get("/api/products/by-category", async (req, res) => {
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

    // console.log(`Found category ID: ${categoryId} for slug: ${category}`);
    // console.log(`Category total products: ${categoryTotalProducts}`);

    // 2. Fetch products filtered by category ID
    const params = {
      category: categoryId,
      page: parseInt(page),
      per_page: parseInt(per_page),
      orderby,
      order,
      status: "publish",
    };

    // console.log("API params:", params);

    // Fix: Pass params directly, not wrapped in { params }
    const response = await api.get("products", params);

    // console.log(`API returned ${response.data.length} products`);
    /* console.log(
      "Total products in response headers:",
      response.headers["x-wp-total"]
    );
    console.log(
      "Total pages in response headers:",
      response.headers["x-wp-totalpages"]
    ); */

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

    /* console.log(
      `After client-side filtering: ${filteredByCategory.length} products`
    ); */

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
      /* price_html: (() => {
        const match = product.price_html?.match(/>(£|\$|&pound;)?\s*([\d.,]+)/);
        return match ? match[2] : "";
      })(), */
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

// Alternative approach - using WooCommerce's category parameter format
app.get("/api/products/by-category-alt", async (req, res) => {
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
      // Try these different approaches:
      category: categoryId.toString(), // String format
      // OR: categories: categoryId.toString(), // Alternative parameter name
      // OR: product_cat: categoryId.toString(), // WordPress taxonomy name
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

/**
 * GET /api/product/:id
 * Fetch single product by ID
 */
app.get("/api/product/:id", async (req, res) => {
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

    // Debug log
    // console.log("Filtered product:", JSON.stringify(filtered, null, 2));

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
app.get("/api/product/by-name/:name", async (req, res) => {
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

app.get("/api/product/:id/variations", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, per_page = 100 } = req.query;
    const params = {
      page: parseInt(page),
      per_page: parseInt(per_page),
    };

    // Correct axios call with params inside object
    const response = await api.get(`products/${id}/variations`, { params });

    // Debug: Log the structure of response.data
    // console.log("Response data type:", typeof response.data);
    // console.log("Is array:", Array.isArray(response.data));
    // console.log("Response data length:", response.data?.length);
    // console.log("First item keys:", response.data[0] ? Object.keys(response.data[0]) : 'No first item');

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

    // Debug: Log filtered data
    //console.log("Filtered data:", JSON.stringify(filtered, null, 2));

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

/**
 * GET /api/variation/:productId/:variationId
 * Fetch single product variation
 */
app.get("/api/variation/:productId/:variationId", async (req, res) => {
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

/**
 * GET /api/attributes
 * Fetch all product attributes
 */
app.get("/api/attributes", async (req, res) => {
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

/**
 * GET /api/attribute/:id
 * Fetch single product attribute
 */
app.get("/api/attribute/:id", async (req, res) => {
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
app.get("/api/attribute/:id/terms", async (req, res) => {
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

/**
 * GET /api/megamenu
 * Fetch megamenu structure with urls
 */
app.get("/api/megamenu", async (req, res) => {
  try {
    // Fetch categories using native fetch
    const catRes = await fetch("http://localhost:4000/api/categories");
    if (!catRes.ok) throw new Error("Failed to fetch categories");
    const categories = await catRes.json();

    // console.log("Fetched categories:");
    /* categories.forEach((c) =>
      console.log(`slug: '${c.slug}', name: '${c.name}', og_url: '${c.og_url}'`)
    ); */

    // Normalize helper
    const normalize = (str) => str.toLowerCase().trim().replace(/\s+/g, "-");

    // Find matching og_url
    const findCategoryUrl = (title) => {
      if (!title || !categories?.length) return null;
      const normalizedTitle = normalize(title);

      let cat = categories.find(
        (c) =>
          normalize(c.slug) === normalizedTitle ||
          c.name.toLowerCase() === title.toLowerCase()
      );
      if (cat) return cat.og_url || null;

      cat = categories.find((c) => normalize(c.slug).includes(normalizedTitle));
      if (cat) return cat.og_url || null;

      return null;
    };

    // Attribute term IDs
    const attrIds = [6, 2, 8];
    const attrTermsMap = {};

    // Fetch attribute terms using fetch
    await Promise.all(
      attrIds.map(async (attrId) => {
        const response = await fetch(
          `http://localhost:4000/api/attribute/${attrId}/terms`
        );
        if (!response.ok)
          throw new Error(`Failed to fetch terms for attribute ${attrId}`);
        const json = await response.json();
        attrTermsMap[attrId] = json.data;
      })
    );

    // Map terms to menu items
    const mapTermsWithLink = (terms) =>
      (terms || []).map((term) => ({
        title: term.name,
        slug: term.slug,
        link: findCategoryUrl(term.name),
      }));

    // Define your grouping logic manually:
    const groupStoneColours = (terms) => {
      // Lowercase slug helper
      const slug = (t) => (t.slug || "").toLowerCase();

      // Define groups and which slugs belong where:
      const groups = {
        whites: ["white", "ivory", "ivory-cream", "whites"],
        blacks: ["black", "black-and-white", "blacks"],
        greys: ["grey", "greys", "slate"], // add "slate" if you want it in greys
        "beiges-browns": ["beige-brown", "brown", "beiges-browns"],
        "creams-yellows": ["cream-yellow", "cream", "yellow", "creams-yellows"],
        "blues-greens": ["blue-green", "green", "blues-greens"],
        "reds-pinks": ["red", "red-pink", "reds-pinks"],
        "multicolors-patterns": ["multicolor", "multicolors-patterns"],
      };

      // Build groups as children with slugs + titles and link=null
      const result = Object.entries(groups).map(([key, slugs]) => {
        // Find any matching terms for this group slugs to pick a display title (or fallback)
        const matchedTerm = terms.find((t) => slugs.includes(slug(t)));

        // Use a clean title from the groups key or matchedTerm
        let title;
        switch (key) {
          case "whites":
            title = "Whites";
            break;
          case "blacks":
            title = "Blacks";
            break;
          case "greys":
            title = "Greys";
            break;
          case "beiges-browns":
            title = "Beiges & Browns";
            break;
          case "creams-yellows":
            title = "Creams & Yellows";
            break;
          case "blues-greens":
            title = "Blues & Greens";
            break;
          case "reds-pinks":
            title = "Reds & Pinks";
            break;
          case "multicolors-patterns":
            title = "Multicolors & Patterns";
            break;
          default:
            title = matchedTerm?.name || key;
        }

        return {
          title,
          slug: key,
          link: null,
        };
      });

      return result;
    };

    // Build megamenu
    const megaMenu = [
      {
        title: "Stone Collection",
        link: findCategoryUrl("Stone Collection"),
        children: [
          {
            title: "Natural Stone Tiles",
            link: findCategoryUrl("Natural Stone Tiles"),
            children: [
              { title: "Marble Tiles", link: findCategoryUrl("Marble Tiles") },
              {
                title: "Limestone Tiles",
                link: findCategoryUrl("Limestone Tiles"),
              },
              {
                title: "Stone Mosaic Tiles",
                link: findCategoryUrl("Mosaic Tiles"),
              },
              {
                title: "Travertine Tiles",
                link: findCategoryUrl("Travertine Tiles"),
              },
              { title: "Slate Tiles", link: findCategoryUrl("Slate Tiles") },
              { title: "Stone Pavers", link: findCategoryUrl("Stone Pavers") },
              {
                title: "Granite Tiles",
                link: findCategoryUrl("Granite Tiles"),
              },
              {
                title: "Clay Brick Slips",
                link: findCategoryUrl("Clay Brick Slips"),
              },
            ],
          },
          {
            title: "Stone Slabs",
            link: findCategoryUrl("Stone Slabs"),
            children: [
              {
                title: "Bookmatch Slabs",
                link: findCategoryUrl("Bookmatch Slabs"),
              },
              { title: "Slabs", link: findCategoryUrl("Slabs") },
              { title: "Vanity Tops", link: findCategoryUrl("Vanity Tops") },
              {
                title: "Off Cut Granite & Quartz",
                link: findCategoryUrl("Off Cut Granite & Quartz"),
              },
            ],
          },
          {
            title: "Stone Colours",
            link: findCategoryUrl("Stone Colours"),
            children: groupStoneColours(attrTermsMap[6] || []),
          },
          {
            title: "Usage Areas",
            link: findCategoryUrl("Usage Areas"),
            children: mapTermsWithLink(attrTermsMap[8]),
          },
          {
            title: "Stone Finishes",
            link: findCategoryUrl("Stone Finishes"),
            children: mapTermsWithLink(attrTermsMap[2]),
          },
        ],
      },
      {
        title: "Custom Stonework",
        link: findCategoryUrl("Custom Stonework"),
        children: [
          { title: "Window Sills", link: findCategoryUrl("Window Sills") },
          { title: "Mouldings", link: findCategoryUrl("Mouldings") },
          { title: "Skirtings", link: findCategoryUrl("Skirtings") },
          { title: "Stone Sinks", link: findCategoryUrl("Stone Sinks") },
          { title: "Slate Hearths", link: findCategoryUrl("Slate Hearths") },
          { title: "Table Tops", link: findCategoryUrl("Table Tops") },
        ],
      },
      {
        title: "Design & Pattern Collection",
        link: findCategoryUrl("Design & Pattern Collection"),
        children: [
          {
            title: "Chequerboard Tiles",
            link: findCategoryUrl("Chequerboard Tiles"),
          },
          {
            title: "Herringbone Tiles",
            link: findCategoryUrl("Herringbone Tiles"),
          },
          { title: "Hexagon Tiles", link: findCategoryUrl("Hexagon Tiles") },
          { title: "Metro Tiles", link: findCategoryUrl("Metro Tiles") },
          {
            title: "Maxi Chequerboard Tiles",
            link: findCategoryUrl("Maxi Chequerboard Tiles"),
          },
          {
            title: "Octagon Cabochon Tiles",
            link: findCategoryUrl("Octagon Cabochon Tiles"),
          },
          { title: "Triangle Tiles", link: findCategoryUrl("Triangle Tiles") },
        ],
      },
      {
        title: "Stone Project",
        link: findCategoryUrl("Stone Project"),
        children: [
          {
            title: "Conventional Projects",
            link: findCategoryUrl("Conventional Projects"),
          },
          {
            title: "Residential Projects",
            link: findCategoryUrl("Residential Projects"),
          },
        ],
      },
    ];

    // Send response
    res.json({
      success: true,
      message: "Megamenu data fetched successfully",
      data: megaMenu,
    });
  } catch (error) {
    console.error("Failed to build megamenu", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch megamenu data",
    });
  }
});

/**
 * GET /api/categories
 * Fetch product categories
 */
app.get("/api/categories", async (req, res) => {
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

    // console.log("Categories fetched:", data.length);
    // console.log("Sample categories:", data.slice(0, 3));
    res.json(filtered);
  } catch (error) {
    console.error(
      "Categories fetch error:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

/**
 * GET /api/tags
 * Fetch product tags
 */
app.get("/api/tags", async (req, res) => {
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

/**
 * GET /api/search
 * Advanced product search with filters
 */
app.get("/api/search", async (req, res) => {
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

/**
 * API - /api/filtered-products
 * it returns selected category page products
 */
app.get("/api/filtered-products", async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 12,
      usage_area = "",
      stone_colour = "",
      stone_finish = "",
    } = req.query;

    // Determine which single filter is provided (only one allowed)
    const filterSlug = usage_area
      ? "pa_room-type-usage"
      : stone_colour
      ? "pa_colour"
      : stone_finish
      ? "pa_finish"
      : null;

    const filterValue = usage_area || stone_colour || stone_finish;

    if (!filterSlug || !filterValue) {
      return res.status(400).json({ message: "No valid filter provided." });
    }

    // Map attribute slug to WooCommerce attribute ID
    const slugToAttrId = {
      pa_colour: 6,
      pa_finish: 2,
      "pa_room-type-usage": 8,
    };

    const attrId = slugToAttrId[filterSlug];
    if (!attrId) {
      return res.status(400).json({ message: "Invalid attribute slug." });
    }

    // Fetch attribute terms for this attribute ID
    const termsResponse = await fetch(
      `http://localhost:4000/api/attribute/${attrId}/terms`
    );

    if (!termsResponse.ok) {
      throw new Error(`Failed to fetch terms for attribute ${attrId}`);
    }

    const termsJson = await termsResponse.json();
    const attrTerms = termsJson.data || [];

    // Find the term ID matching the provided slug (case-insensitive)
    const term = attrTerms.find(
      (t) => t.slug.toLowerCase() === filterValue.toLowerCase()
    );

    if (!term) {
      return res.status(400).json({
        message: "Invalid filter value.",
        availableTerms: attrTerms.map((t) => t.slug),
      });
    }

    /* console.log("Filter details:", {
      filterSlug,
      filterValue,
      termId: term.id,
      termSlug: term.slug,
    }); */

    // Build the direct WooCommerce API URL
    // Replace with your actual WooCommerce credentials
    const wcBaseUrl = "http://karakedi.xyz/wp-json/wc/v3";
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    const queryParams = new URLSearchParams({
      page: parseInt(page, 10).toString(),
      per_page: parseInt(per_page, 10).toString(),
      status: "publish",
      attribute: filterSlug,
      attribute_term: term.id.toString(),
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    });

    const wcUrl = `${wcBaseUrl}/products?${queryParams}`;
    // console.log("Direct WooCommerce URL:", wcUrl);

    // Make direct fetch call to WooCommerce
    const wcResponse = await fetch(wcUrl);

    if (!wcResponse.ok) {
      throw new Error(
        `WooCommerce API error: ${wcResponse.status} ${wcResponse.statusText}`
      );
    }

    const products = await wcResponse.json();

    // Get pagination info from headers
    const totalProducts =
      parseInt(wcResponse.headers.get("x-wp-total")) || products.length;
    const totalPages = parseInt(wcResponse.headers.get("x-wp-totalpages")) || 1;

    // console.log(`Direct API Response: ${products.length} products returned, ${totalProducts} total products`);

    // Format products for frontend
    const formattedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      permalink: product.permalink,
      date_created: product.date_created,
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
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      stock_status: product.stock_status,
      categories: product.categories || [],
      images: product.images || [],
      attributes: product.attributes || [],
      yoast_head_json: {
        og_image: product.yoast_head_json?.og_image || [],
      },
    }));

    // Pagination metadata
    const meta = {
      current_page: parseInt(page, 10),
      per_page: parseInt(per_page, 10),
      total_pages: totalPages,
      total_products: totalProducts,
      has_next_page: parseInt(page, 10) < totalPages,
      has_prev_page: parseInt(page, 10) > 1,
    };

    // Send success response
    res.status(200).json({
      success: true,
      message: "Filtered products fetched successfully",
      data: formattedProducts,
      meta,
    });
  } catch (error) {
    console.error("Error fetching filtered products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch filtered products",
      error: error.message || error,
    });
  }
});

/**
 * Get -> Blog Posts
 */
app.get("/api/posts", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const wpUrl = process.env.WC_SITE_URL;

    const response = await fetch(
      `${wpUrl}/wp-json/wp/v2/posts?_embed&per_page=${limit}`
    );

    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.status}`);
    }

    const posts = await response.json();

    const simplifiedPosts = posts.map((post) => ({
      id: post.id,
      date: post.date,
      slug: post.slug,
      link: post.link,
      title: post.title?.rendered || "",
      og_image: post.yoast_head_json?.og_image || [],
    }));

    res.json({
      success: true,
      message: "Posts fetched successfully",
      posts: simplifiedPosts,
    });
  } catch (err) {
    console.error("Posts fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

/**
 * GET CLEARENCE PRODUCTS
 */
app.get("/api/clearance", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 9;

    const response = await api.get("products", {
      params: {
        on_sale: true,
        per_page: limit,
        status: "publish",
      },
    });

    const data = response.data;

    const simplifiedClearances = data.map((product) => {
      // Extract price number from price_html string
      let cleanPrice = "";
      const match = product.price_html?.match(/[\d.,]+/);
      if (match) {
        cleanPrice = match[0]; // e.g., "79.00"
      }

      return {
        id: product.id,
        name: product.name,
        date: product.date_created,
        slug: product.slug,
        permalink: product.permalink,
        material:
          product.attributes?.find((attr) => attr.slug === "pa_material")
            ?.options || [],
        stock_status: product.stock_status,
        price_html: cleanPrice,
        imageURL: product.yoast_head_json?.og_image?.[0]?.url || null,
      };
    });

    res.json({
      success: true,
      message: "Clearance products fetched successfully",
      data: simplifiedClearances,
    });
  } catch (error) {
    console.error(
      "Clearance fetch error:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch clearance products" });
  }
});

app.listen(4000, () => {
  console.log("🚀 WooCommerce API server running at http://localhost:4000");
});
