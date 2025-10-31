import express from 'express';
import { api } from "../server.js";

const router = express.Router();

// GET /api/similar/:productId - Get similar products
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    // Fetch the main product
    const productResponse = await api.get(`products/${productId}`);
    const product = productResponse.data;

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Extract product attributes for matching
    const productCategories = product.categories.map(cat => cat.id);
    const productTags = product.tags?.map(tag => tag.id) || [];
    
    // Get product attributes
    const finishAttr = product.attributes.find(attr => attr.slug === 'pa_finish');
    const colourAttr = product.attributes.find(attr => attr.slug === 'pa_colour');
    const finish = finishAttr?.options[0] || '';
    const colour = colourAttr?.options[0] || '';

    // Fetch potential similar products
    const similarProductsResponse = await api.get('products', {
      per_page: 50,
      status: 'publish',
      exclude: [productId], // Exclude the current product
      category: productCategories.join(','), // Same category
    });

    // Score and rank similar products
    const scoredProducts = similarProductsResponse.data.map(similarProduct => {
      let score = 0;

      // Category match (highest priority)
      const matchingCategories = similarProduct.categories.filter(cat => 
        productCategories.includes(cat.id)
      );
      score += matchingCategories.length * 10;

      // Same finish
      const similarFinish = similarProduct.attributes.find(attr => attr.slug === 'pa_finish');
      if (similarFinish?.options[0] === finish) {
        score += 8;
      }

      // Same colour
      const similarColour = similarProduct.attributes.find(attr => attr.slug === 'pa_colour');
      if (similarColour?.options[0] === colour) {
        score += 5;
      }

      // Tag match
      const matchingTags = similarProduct.tags?.filter(tag => 
        productTags.includes(tag.id)
      ) || [];
      score += matchingTags.length * 3;

      // Name similarity (basic check for common words)
      const productWords = product.name.toLowerCase().split(' ');
      const similarWords = similarProduct.name.toLowerCase().split(' ');
      const commonWords = productWords.filter(word => 
        similarWords.includes(word) && word.length > 3
      );
      score += commonWords.length * 2;

      // Price range similarity (within 20%)
      const productPrice = parseFloat(product.price) || 0;
      const similarPrice = parseFloat(similarProduct.price) || 0;
      if (productPrice > 0 && similarPrice > 0) {
        const priceDiff = Math.abs(productPrice - similarPrice) / productPrice;
        if (priceDiff <= 0.2) {
          score += 4;
        }
      }

      return {
        ...similarProduct,
        similarityScore: score
      };
    });

    // Sort by score and take top N
    const topSimilar = scoredProducts
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);

    // Format response
    const formattedProducts = topSimilar.map(product => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      permalink: product.permalink,
      price: product.price,
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      price_html: (() => {
        if (typeof product.price_html === "string") {
          const match = product.price_html.match(/>(£|\$|&pound;)?\s*([\d.,]+)/);
          return match ? match[2] : "";
        }
        return "";
      })(),
      stock_status: product.stock_status,
      categories: product.categories || [],
      images: product.images || [],
      attributes: product.attributes || [],
      variations: product.variations || [],
      similarityScore: product.similarityScore
    }));

    res.json({
      success: true,
      data: formattedProducts,
      meta: {
        product_id: productId,
        product_name: product.name,
        total_similar: formattedProducts.length,
        criteria: {
          categories: productCategories,
          finish,
          colour
        }
      }
    });

  } catch (error) {
    console.error('Error fetching similar products:', error);
    
    if (error.response) {
      res.status(error.response.status).json({
        success: false,
        message: 'WooCommerce API Error',
        error: error.response.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
});

export default router;