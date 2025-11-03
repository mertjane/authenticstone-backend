import express from "express";
import { api } from "../server.js";

const router = express.Router();

/**
 * GET /api/posts
 * Get blog posts
 */
router.get("/posts", async (req, res) => {
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
 * GET /api/posts/:slug
 * Get a single blog post by slug
 */
router.get("/posts/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const wpUrl = process.env.WC_SITE_URL;

    const response = await fetch(
      `${wpUrl}/wp-json/wp/v2/posts?slug=${slug}&_embed`
    );

    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.status}`);
    }

    const posts = await response.json();

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = posts[0];

    const simplifiedPost = {
      id: post.id,
      date: post.date,
      slug: post.slug,
      link: post.link,
      title: post.title?.rendered || "",
      content: post.content?.rendered || "",
      excerpt: post.excerpt?.rendered || "",
      og_image: post.yoast_head_json?.og_image || [],
      author: {
        name: post._embedded?.author?.[0]?.name || "Unknown",
        avatar: post._embedded?.author?.[0]?.avatar_urls?.["96"] || null,
      },
      categories:
        post._embedded?.["wp:term"]?.[0]?.map((cat) => cat.name) || [],
      tags: post._embedded?.["wp:term"]?.[1]?.map((tag) => tag.name) || [],
    };

    res.json({
      success: true,
      message: "Post fetched successfully",
      post: simplifiedPost,
    });
  } catch (err) {
    console.error("Single post fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

/**
 * GET /api/clearance
 * Get clearance products
 */
router.get("/clearance", async (req, res) => {
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

export default router;

