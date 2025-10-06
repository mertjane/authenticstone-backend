// routes/filters.route.js
import express from "express";
import { api } from "../server.js";

const router = express.Router();

// Caching for performance
const categoryCache = {};
const attributeCache = {};

/**
 * Get category ID from slug
 * Used for pa_material (single category filter)
 */
async function getCategoryId(slug) {
  if (categoryCache[slug]) return categoryCache[slug];
  
  try {
    const res = await api.get("products/categories", { 
      slug: slug,
      per_page: 100 
    });
    const id = res.data?.[0]?.id;
    if (id) {
      categoryCache[slug] = id;
      console.log(`✓ Category cached: ${slug} -> ID ${id}`);
    }
    return id || null;
  } catch (error) {
    console.error(`✗ Error fetching category for slug "${slug}":`, error.message);
    return null;
  }
}

/**
 * Get attribute term ID from slug/name
 * Used for multiple attribute filters (colour, finish, room-type-usage, etc.)
 */
async function getAttributeTermId(attrSlug, termName) {
  const cacheKey = `${attrSlug}_${termName}`;
  if (attributeCache[cacheKey]) return attributeCache[cacheKey];
  
  try {
    // Get attribute ID from slug
    const attrRes = await api.get("products/attributes");
    const attr = attrRes.data.find((a) => a.slug === attrSlug);
    
    if (!attr) {
      console.error(`✗ Attribute not found: ${attrSlug}`);
      return null;
    }
    
    // Get term ID from attribute
    const termRes = await api.get(`products/attributes/${attr.id}/terms`, {
      per_page: 100
    });
    
    const term = termRes.data.find(t => 
      t.slug.toLowerCase() === termName.toLowerCase() || 
      t.name.toLowerCase() === termName.toLowerCase()
    );
    
    if (term) {
      attributeCache[cacheKey] = term.id;
      console.log(`✓ Attribute term cached: ${attrSlug}/${termName} -> ID ${term.id}`);
      return term.id;
    }
    
    console.warn(`✗ Term not found: ${attrSlug}/${termName}`);
    return null;
  } catch (error) {
    console.error(`✗ Error fetching attribute term for ${attrSlug}/${termName}:`, error.message);
    return null;
  }
}

/**
 * Main filtering route
 * GET /api/products/filters
 * 
 * Query parameters:
 * - material: Single category filter (e.g., "marble-tiles")
 * - colour: Multiple attribute filter (e.g., "white,black")
 * - finish: Multiple attribute filter (e.g., "polished,honed")
 * - room-type-usage: Multiple attribute filter (e.g., "bathroom,kitchen")
 * - sizemm: Multiple attribute filter (e.g., "600x600,300x300")
 * - page: Page number (default: 1)
 * - per_page: Items per page (default: 20)
 */
router.get("/", async (req, res) => {
  try {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📥 FILTER REQUEST RECEIVED");
    console.log("Query params:", req.query);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // Base WooCommerce API setup
    const wcBaseUrl = process.env.WC_SITE_URL + "/wp-json/wc/v3";
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    // Initialize query parameters
    const queryParams = new URLSearchParams({
      page: parseInt(req.query.page) || 1,
      per_page: parseInt(req.query.per_page) || 12,
      status: "publish",
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    });

    // ═══════════════════════════════════════════════════════════
    // 1. CATEGORY FILTER (pa_material) - SINGLE SELECTION ONLY
    // ═══════════════════════════════════════════════════════════
    if (req.query.material) {
      console.log(`🏷️  Processing CATEGORY filter (material): "${req.query.material}"`);
      
      const catId = await getCategoryId(req.query.material);
      if (catId) {
        queryParams.append('category', catId.toString());
        console.log(`   ✓ Added category filter: ID ${catId}\n`);
      } else {
        console.warn(`   ✗ Category not found for: "${req.query.material}"\n`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. ATTRIBUTE FILTERS - MULTIPLE SELECTIONS ALLOWED
    // ═══════════════════════════════════════════════════════════
    const attributeMap = {
      colour: 'pa_colour',
      finish: 'pa_finish',
      'room-type-usage': 'pa_room-type-usage',
      sizemm: 'pa_sizemm'
    };

    // Process each attribute filter
    for (const [queryParam, attrSlug] of Object.entries(attributeMap)) {
      if (req.query[queryParam]) {
        console.log(`🎨 Processing ATTRIBUTE filter (${queryParam}): "${req.query[queryParam]}"`);
        
        // Split multiple values by comma
        const values = req.query[queryParam].split(',').map(v => v.trim()).filter(v => v);
        const termIds = [];
        
        // Get term ID for each value
        for (const value of values) {
          const termId = await getAttributeTermId(attrSlug, value);
          if (termId) {
            termIds.push(termId);
            console.log(`   ✓ ${value} -> ID ${termId}`);
          } else {
            console.warn(`   ✗ Term not found: "${value}"`);
          }
        }
        
        // Add to query if we found any valid terms
        if (termIds.length > 0) {
          queryParams.append('attribute', attrSlug);
          queryParams.append('attribute_term', termIds.join(','));
          console.log(`   ✓ Added filter: ${attrSlug} = [${termIds.join(', ')}]\n`);
        } else {
          console.warn(`   ✗ No valid terms found for ${queryParam}\n`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. FETCH PRODUCTS FROM WOOCOMMERCE
    // ═══════════════════════════════════════════════════════════
    const wcUrl = `${wcBaseUrl}/products?${queryParams}`;
    console.log("🌐 WooCommerce API URL:");
    console.log(wcUrl.replace(consumerKey, '***').replace(consumerSecret, '***'));
    console.log("");

    const wcResponse = await fetch(wcUrl);
    
    if (!wcResponse.ok) {
      const errorText = await wcResponse.text();
      throw new Error(`WooCommerce API error: ${wcResponse.status} ${wcResponse.statusText}\n${errorText}`);
    }

    const products = await wcResponse.json();
    
    // Get pagination info from headers
    const total = parseInt(wcResponse.headers.get("x-wp-total")) || products.length;
    const totalPages = parseInt(wcResponse.headers.get("x-wp-totalpages")) || 1;

    console.log(`✅ SUCCESS: Found ${products.length} products (Total: ${total})`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // ═══════════════════════════════════════════════════════════
    // 4. FORMAT RESPONSE
    // ═══════════════════════════════════════════════════════════
    const formattedProducts = products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      type: p.type,
      permalink: p.permalink,
      date_created: p.date_created,
      price: p.price,
      regular_price: p.regular_price,
      sale_price: p.sale_price,
      price_html: (() => {
        if (typeof p.price_html === "string") {
          const match = p.price_html.match(/>(£|\$|&pound;)?\s*([\d.,]+)/);
          return match ? match[2] : "";
        }
        return "";
      })(),
      stock_status: p.stock_status,
      categories: p.categories || [],
      images: p.images || [],
      attributes: p.attributes || [],
      variations: p.variations || [],
      yoast_head_json: {
        og_image: p.yoast_head_json?.og_image || [],
      },
    }));

    // Build metadata
    const currentPage = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 12;

    res.json({
      success: true,
      message: "Filtered products fetched successfully",
      data: formattedProducts,
      meta: {
        current_page: currentPage,
        per_page: perPage,
        total_pages: totalPages,
        total_products: total,
        has_next_page: currentPage < totalPages,
        has_prev_page: currentPage > 1,
        filters_applied: {
          material: req.query.material || null,
          colour: req.query.colour || null,
          finish: req.query.finish || null,
          room_type_usage: req.query['room-type-usage'] || null,
          sizemm: req.query.sizemm || null,
        }
      },
    });

  } catch (err) {
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("❌ FILTER ERROR:");
    console.error(err.message);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch filtered products", 
      error: err.message 
    });
  }
});

export default router;
