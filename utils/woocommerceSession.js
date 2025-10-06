import { api } from "../server.js"; // WooCommerceRestApi instance

/**
 * Get or create a WooCommerce session.
 * This simulates the PHP session cookie WooCommerce uses on native sites.
 */
export const getWooSession = async (req, res, next) => {
  try {
    // If we already have a session cookie stored in Express, use it
    if (req.session.wc_session) {
      req.wooSession = req.session.wc_session;
      return next();
    }

    // Otherwise, create a new WooCommerce session
    const response = await api.post("customers", {
      email: `guest_${Date.now()}@example.com`,
      first_name: "Guest",
      role: "guest",
    });

    const sessionKey = `wc_session_${response.data.id}`;

    // Save in Express session
    req.session.wc_session = sessionKey;
    req.wooSession = sessionKey;

    console.log("🛍️ Created new WooCommerce session:", sessionKey);
    next();
  } catch (error) {
    console.error("Error creating WooCommerce session:", error.message);
    next();
  }
};
