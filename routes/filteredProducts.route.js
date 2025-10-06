import express from "express";

const router = express.Router();

/**
 * GET /api/filtered-products
 * Returns selected category page products
 */
router.get("/", async (req, res) => {
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

    // Build the direct WooCommerce API URL
    const wcBaseUrl = process.env.WC_SITE_URL + "/wp-json/wc/v3";
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

export default router;

