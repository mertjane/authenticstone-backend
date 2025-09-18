import express from 'express';
import { api } from "../server.js";

const router = express.Router();

// GET /api/sort/products - Sort products with various options
router.get('/products', async (req, res) => {
  try {
    const { 
      sortBy = 'newest', 
      page = 1, 
      category = null,
      categorySlug = null // Changed from categoryId to categorySlug
    } = req.query;
    
    const per_page = 12;
    
    // Map sortBy options to WooCommerce API parameters
    const getSortParams = (sortBy) => {
      switch (sortBy.toLowerCase()) {
        case 'popular':
        case 'most-popular':
          return { orderby: 'popularity', order: 'desc' };
        
        case 'newest':
        case 'newest-first':
          return { orderby: 'date', order: 'desc' };
        
        case 'oldest':
        case 'oldest-first':
          return { orderby: 'date', order: 'asc' };
        
        case 'name-az':
        case 'title-az':
          return { orderby: 'title', order: 'asc' };
        
        case 'name-za':
        case 'title-za':
          return { orderby: 'title', order: 'desc' };
        
        case 'price-low':
        case 'price-low-to-high':
          return { orderby: 'price', order: 'asc' };
        
        case 'price-high':
        case 'price-high-to-low':
          return { orderby: 'price', order: 'desc' };
        
        default:
          return { orderby: 'date', order: 'desc' }; // Default to newest
      }
    };

    // Get sort parameters
    const { orderby, order } = getSortParams(sortBy);
    
    // Build API parameters
    const apiParams = {
      per_page,
      page: parseInt(page),
      orderby,
      order,
      status: 'publish' // Only get published products
    };

    // Add category filter if provided
    // Use categorySlug instead of categoryId for WooCommerce slug filtering
    if (categorySlug) {
      // WooCommerce supports filtering by category slug using the 'category' parameter
      // But we need to get the category ID first, or use a different approach
      
      // Option 1: If WooCommerce supports slug filtering directly
      apiParams.category_slug = categorySlug;
      
      // Option 2: Convert slug to ID first (more reliable)
      // You might need to make a separate call to get category by slug first
      try {
        const categoriesResponse = await api.get('products/categories', {
          slug: categorySlug,
          per_page: 1
        });
        
        if (categoriesResponse.data && categoriesResponse.data.length > 0) {
          apiParams.category = categoriesResponse.data[0].id;
        }
      } catch (categoryError) {
        console.warn('Could not fetch category by slug:', categoryError);
        // Fallback: try using slug directly if your WooCommerce setup supports it
        apiParams.category_slug = categorySlug;
      }
    }

    // Make request to WooCommerce API
    const response = await api.get('products', apiParams);
    
    // Extract pagination info from headers
    const totalFromHeaders = parseInt(response.headers['x-wp-total']) || 0;
    const totalPagesFromHeaders = parseInt(response.headers['x-wp-totalpages']) || 1;
    
    // Build metadata
    const meta = {
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total_pages: totalPagesFromHeaders,
      total_products: totalFromHeaders,
      has_next_page: parseInt(page) < totalPagesFromHeaders,
      has_prev_page: parseInt(page) > 1,
      category_slug: categorySlug, // Return the slug instead of ID
      category: category,
      sort_by: sortBy,
      order_by: orderby,
      order: order
    };

    // Filter and format products
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

    // Send response
    res.json({
      success: true,
      data: filteredProducts,
      meta: meta
    });

  } catch (error) {
    console.error('Error fetching sorted products:', error);
    
    // Handle different types of errors
    if (error.response) {
      // WooCommerce API error
      res.status(error.response.status).json({
        success: false,
        message: 'WooCommerce API Error',
        error: error.response.data
      });
    } else if (error.request) {
      // Network error
      res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable'
      });
    } else {
      // Other errors
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
});

// GET /api/sort/options - Get available sorting options
router.get('/options', (req, res) => {
  const sortOptions = [
    { value: 'popular', label: 'Most Popular', orderby: 'popularity', order: 'desc' },
    { value: 'newest', label: 'Newest First', orderby: 'date', order: 'desc' },
    { value: 'oldest', label: 'Oldest First', orderby: 'date', order: 'asc' },
    { value: 'name-az', label: 'Name A-Z', orderby: 'title', order: 'asc' },
    { value: 'name-za', label: 'Name Z-A', orderby: 'title', order: 'desc' },
    { value: 'price-low', label: 'Price Low to High', orderby: 'price', order: 'asc' },
    { value: 'price-high', label: 'Price High to Low', orderby: 'price', order: 'desc' }
  ];

  res.json({
    success: true,
    data: sortOptions
  });
});

export default router;