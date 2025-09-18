import express from "express";
import { api } from "../server.js";

const router = express.Router();

// LIGHTNING FAST search - optimized for speed
router.get("/", async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 1) {
      return res.json([]);
    }

    const response = await api.get('products', {
      params: {
        search: query,
        per_page: 10,
        orderby: 'relevance',
        status: 'publish'
      }
    });

    const searchTerm = query.toLowerCase();
    
    // SUPER FAST relevance sorting - no complex scoring
    const suggestions = response.data
      // Quick filter: only products that actually contain the search term
      .filter(product => 
        product.name.toLowerCase().includes(searchTerm)
      )
      // Simple sort: exact matches first, then starts with, then contains
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        
        // Exact match wins
        if (aName === searchTerm) return -1;
        if (bName === searchTerm) return 1;
        
        // Starts with search term wins
        if (aName.startsWith(searchTerm) && !bName.startsWith(searchTerm)) return -1;
        if (bName.startsWith(searchTerm) && !aName.startsWith(searchTerm)) return 1;
        
        // Otherwise keep original order
        return 0;
      })
      // Take top 3 and format
      .slice(0, 3)
      .map(product => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
      }));

    res.json(suggestions);

  } catch (error) {
    res.json([]);
  }
});

export default router;