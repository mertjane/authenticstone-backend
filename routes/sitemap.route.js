import express from 'express';
import { api } from "../server.js";

const router = express.Router();


// GET /api/sitemap - Generate sitemap XML
router.get('/', async (req, res) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || 'https://authenticstone-frontend.pages.dev';
    const currentDate = new Date().toISOString().split('T')[0];

    // Fetch all published products
    const productsResponse = await api.get('products', {
      per_page: 100,
      status: 'publish',
      _fields: 'id,slug,date_modified'
    });

    // Fetch all product categories
    const categoriesResponse = await api.get('products/categories', {
      per_page: 100,
      hide_empty: true,
      _fields: 'id,slug,count'
    });

    // Fetch all tags (if you use them for colour, finish, etc.)
    const tagsResponse = await api.get('products/tags', {
      per_page: 100,
      hide_empty: true,
      _fields: 'id,slug'
    });

    // Build sitemap XML
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Static pages
    const staticPages = [
      { path: '/', priority: '1.0', changefreq: 'daily' },
      { path: '/about-us', priority: '0.8', changefreq: 'monthly' },
      { path: '/stone-collection/all-products', priority: '0.9', changefreq: 'daily' },
      { path: '/stone-collection/stock-clearance', priority: '0.8', changefreq: 'weekly' },
      { path: '/new-arrivals', priority: '0.9', changefreq: 'weekly' },
      { path: '/adhevise-grout-advise', priority: '0.6', changefreq: 'monthly' },
      { path: '/faq', priority: '0.6', changefreq: 'monthly' },
      { path: '/delivery-information', priority: '0.6', changefreq: 'monthly' },
      { path: '/return-refund-policy', priority: '0.5', changefreq: 'monthly' },
      { path: '/privacy-policy', priority: '0.5', changefreq: 'monthly' },
      { path: '/terms-and-conditions', priority: '0.5', changefreq: 'monthly' },
      { path: '/contact-us', priority: '0.7', changefreq: 'monthly' },
      { path: '/sealing-and-maintenance', priority: '0.6', changefreq: 'monthly' },
      { path: '/installation', priority: '0.6', changefreq: 'monthly' },
      { path: '/reviews', priority: '0.7', changefreq: 'weekly' },
      { path: '/blog', priority: '0.8', changefreq: 'weekly' },
    ];

    staticPages.forEach(page => {
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}${page.path}</loc>\n`;
      sitemap += `    <lastmod>${currentDate}</lastmod>\n`;
      sitemap += `    <changefreq>${page.changefreq}</changefreq>\n`;
      sitemap += `    <priority>${page.priority}</priority>\n`;
      sitemap += `  </url>\n`;
    });

    // Product pages (SPP)
    productsResponse.data.forEach(product => {
      const lastmod = product.date_modified?.split('T')[0] || currentDate;
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}/product/${product.slug}</loc>\n`;
      sitemap += `    <lastmod>${lastmod}</lastmod>\n`;
      sitemap += `    <changefreq>weekly</changefreq>\n`;
      sitemap += `    <priority>0.8</priority>\n`;
      sitemap += `  </url>\n`;
    });

    // Category pages
    categoriesResponse.data.forEach(category => {
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}/collections/${category.slug}</loc>\n`;
      sitemap += `    <lastmod>${currentDate}</lastmod>\n`;
      sitemap += `    <changefreq>weekly</changefreq>\n`;
      sitemap += `    <priority>0.7</priority>\n`;
      sitemap += `  </url>\n`;
    });

    // Tag pages (colour, finish, room-type-usage)
    tagsResponse.data.forEach(tag => {
      // You can customize these based on your tag structure
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}/colour/${tag.slug}</loc>\n`;
      sitemap += `    <lastmod>${currentDate}</lastmod>\n`;
      sitemap += `    <changefreq>monthly</changefreq>\n`;
      sitemap += `    <priority>0.6</priority>\n`;
      sitemap += `  </url>\n`;
    });

    sitemap += '</urlset>';

    // Set proper headers
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);

  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sitemap'
    });
  }
});

export default router;