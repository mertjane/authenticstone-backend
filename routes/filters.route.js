// routes/filters.route.js
import express from "express";
import { api } from "../server.js";

const router = express.Router();

const categoryCache = {};
const attributeCache = {};

// get category ID from slug
async function getCategoryId(slug) {
  if (categoryCache[slug]) return categoryCache[slug];
  try {
    const res = await api.get("products/categories", { 
      slug: slug,
      per_page: 100 
    });
    const id = res.data?.[0]?.id;
    if (id) categoryCache[slug] = id;
    return id;
  } catch (error) {
    console.error(`Error fetching category for slug ${slug}:`, error.message);
    return null;
  }
}

// get attribute term ID from name/slug
async function getAttributeTermId(attrSlug, termName) {
  const cacheKey = `${attrSlug}_${termName}`;
  if (attributeCache[cacheKey]) return attributeCache[cacheKey];
  
  try {
    // First get the attribute ID
    const attrRes = await api.get("products/attributes");
    const attr = attrRes.data.find((a) => a.slug === attrSlug);
    if (!attr) return null;
    
    // Then get the term ID
    const termRes = await api.get(`products/attributes/${attr.id}/terms`, {
      per_page: 100
    });
    
    const term = termRes.data.find(t => 
      t.slug.toLowerCase() === termName.toLowerCase() || 
      t.name.toLowerCase() === termName.toLowerCase()
    );
    
    if (term) {
      attributeCache[cacheKey] = term.id;
      return term.id;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching attribute term for ${attrSlug}/${termName}:`, error.message);
    return null;
  }
}

// build WooCommerce query parameters
async function buildParams(query) {
  const params = {
    status: "publish",
    page: parseInt(query.page) || 1,
    per_page: parseInt(query.per_page) || 20
  };

  // Handle category filtering (material parameter)
  // Use category OR material attribute, not both to avoid conflicts
  if (query.material) {
    const catId = await getCategoryId(query.material);
    if (catId) {
      params.category = catId;
      console.log(`Found category ID ${catId} for material: ${query.material}`);
    } else {
      console.log(`No category found for material: ${query.material}, trying material attribute instead`);
      // If no category found, try material attribute
      const termId = await getAttributeTermId('pa_material', query.material);
      if (termId) {
        params.pa_material = termId;
        console.log(`Found material attribute term ID ${termId} for: ${query.material}`);
      }
    }
  }

  // Handle other attribute filtering (excluding material since we handled it above)
  const attributeMap = {
    colour: 'pa_colour',
    finish: 'pa_finish',
    'room-type-usage': 'pa_room-type-usage',
    sizemm: 'pa_sizemm'
    // Removed material from here to avoid conflicts
  };

  // For WooCommerce REST API, we need to use specific attribute parameter format
  for (const [queryParam, attrSlug] of Object.entries(attributeMap)) {
    if (query[queryParam]) {
      const values = query[queryParam].split(',').map(v => v.trim());
      const termIds = [];
      
      for (const value of values) {
        const termId = await getAttributeTermId(attrSlug, value);
        if (termId) {
          termIds.push(termId);
          console.log(`Found term ID ${termId} for ${attrSlug}/${value}`);
        } else {
          console.log(`No term found for ${attrSlug}/${value}`);
        }
      }
      
      if (termIds.length > 0) {
        // Use the attribute slug as parameter name with term IDs as value
        params[attrSlug] = termIds.join(',');
      }
    }
  }

  return params;
}

// Main filtering route
router.get("/filters", async (req, res) => {
  try {
    console.log("Filter request query:", req.query);
    
    // Use direct WooCommerce API approach for better attribute filtering
    const wcBaseUrl = "http://karakedi.xyz/wp-json/wc/v3";
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    const queryParams = new URLSearchParams({
      page: parseInt(req.query.page) || 1,
      per_page: parseInt(req.query.per_page) || 20,
      status: "publish",
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    });

    // Handle category filtering (material parameter)
    if (req.query.material) {
      const catId = await getCategoryId(req.query.material);
      if (catId) {
        queryParams.append('category', catId.toString());
        console.log(`Added category filter: ${catId} for material: ${req.query.material}`);
      } else {
        console.log(`No category found for material: ${req.query.material}`);
      }
    }

    // Handle attribute filtering
    const attributeMap = {
      colour: 'pa_colour',
      finish: 'pa_finish',
      'room-type-usage': 'pa_room-type-usage',
      sizemm: 'pa_sizemm'
    };

    // For each attribute, add it as a separate filter
    for (const [queryParam, attrSlug] of Object.entries(attributeMap)) {
      if (req.query[queryParam]) {
        const values = req.query[queryParam].split(',').map(v => v.trim());
        const termIds = [];
        
        for (const value of values) {
          const termId = await getAttributeTermId(attrSlug, value);
          if (termId) {
            termIds.push(termId);
            console.log(`Found term ID ${termId} for ${attrSlug}/${value}`);
          } else {
            console.log(`No term found for ${attrSlug}/${value}`);
          }
        }
        
        if (termIds.length > 0) {
          // Add each attribute as separate parameter
          queryParams.append('attribute', attrSlug);
          queryParams.append('attribute_term', termIds.join(','));
          console.log(`Added attribute filter: ${attrSlug} = ${termIds.join(',')}`);
        }
      }
    }

    const wcUrl = `${wcBaseUrl}/products?${queryParams}`;
    console.log("Direct WooCommerce URL:", wcUrl);

    const wcResponse = await fetch(wcUrl);
    
    if (!wcResponse.ok) {
      throw new Error(`WooCommerce API error: ${wcResponse.status} ${wcResponse.statusText}`);
    }

    const products = await wcResponse.json();
    console.log(`Direct API returned ${products.length} products`);
    
    const total = parseInt(wcResponse.headers.get("x-wp-total")) || products.length;
    const totalPages = parseInt(wcResponse.headers.get("x-wp-totalpages")) || 1;

    console.log(`Total products found: ${total}`);

    const data = products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      permalink: p.permalink,
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
      categories: p.categories,
      images: p.images,
      attributes: p.attributes,
      variations: p.variations,
      stock_status: p.stock_status,
      yoast_head_json: {
        og_image: p.yoast_head_json?.og_image || [],
      },
    }));

    res.json({
      success: true,
      message: "Filtered products fetched successfully",
      data,
      meta: {
        current_page: parseInt(req.query.page) || 1,
        per_page: parseInt(req.query.per_page) || 20,
        total_pages: totalPages,
        total_products: total,
        has_next_page: (parseInt(req.query.page) || 1) < totalPages,
        has_prev_page: (parseInt(req.query.page) || 1) > 1,
      },
    });
  } catch (err) {
    console.error("Filter error:", err.response?.data || err.message);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch filtered products", 
      error: err.response?.data || err.message 
    });
  }
});

export default router;
