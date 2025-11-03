import express from "express";
import axios from "axios";

const router = express.Router();

// In-memory session storage (for development - use Redis in production)
// const cartSessions = new Map();

/**
 * GET /api/cart/nonce
 * Get a nonce for Store API authentication
 * This endpoint retrieves a nonce from WordPress
 */
router.get("/nonce", async (req, res) => {
  try {
    const WC_STORE_URL = process.env.WC_SITE_URL;

    // Request a nonce from WordPress
    const response = await axios.get(
      `${WC_STORE_URL}/wp-json/wc/store/v1/cart`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Extract nonce from response headers
    const nonce =
      response.headers["nonce"] || response.headers["x-wc-store-api-nonce"];

    // Store cookies for this session
    const cookies = response.headers["set-cookie"];
    /* const sessionId = Date.now().toString(); */
    let sessionId = req.headers["x-session-id"];

    if (!sessionId) {
      sessionId = Date.now().toString();
    }

    if (cookies) {
      // ✅ FIX: Merge cookies instead of replacing
      const existingCookies = req.app.locals.cartSessions.get(sessionId) || "";
      const newCookieString = cookies.join("; ");

      // Only update if new cookies are different
      if (newCookieString !== existingCookies) {
        req.app.locals.cartSessions.set(sessionId, newCookieString);
      }
    }

    res.json({
      success: true,
      nonce: nonce,
      session_id: sessionId,
      message: "Use this nonce and session_id in subsequent requests",
    });
  } catch (error) {
    console.error(
      "Error fetching nonce:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      error: "Failed to fetch nonce",
      details: error.response?.data,
    });
  }
});

/**
 * GET /api/cart
 * Retrieve the full cart object
 */
router.get("/", async (req, res) => {
  try {
    const WC_STORE_URL = process.env.WC_SITE_URL;
    const sessionId = req.headers["x-session-id"];
    const storedCookies = sessionId
      ? req.app.locals.cartSessions.get(sessionId)
      : null;

    const response = await axios.get(
      `${WC_STORE_URL}/wp-json/wc/store/v1/cart`,
      {
        headers: {
          "Content-Type": "application/json",
          Nonce: req.headers.nonce || req.headers["x-wc-store-api-nonce"] || "",
          Cookie: storedCookies || req.headers.cookie || "",
        },
      }
    );

    res.json({
      success: true,
      cart: response.data,
    });
  } catch (error) {
    console.error(
      "Error fetching cart:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || "Failed to fetch cart",
      details: error.response?.data,
    });
  }
});

/**
 * POST /api/cart/calculate-m2-price
 * Calculate total price based on m² quantity
 *
 * Body parameters:
 * - quantity: Number of tiles/items (required)
 * - dimensions: Size string like "305x305x10" (required)
 * - price_per_m2: Price per square meter (required)
 */
router.post("/calculate-m2-price", async (req, res) => {
  try {
    const { quantity, dimensions, price_per_m2 } = req.body;

    if (!quantity || !dimensions || !price_per_m2) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: quantity, dimensions, and price_per_m2 are required",
      });
    }

    // Parse dimensions (e.g., "305x305x10" -> [305, 305, 10])
    const dims = dimensions.split("x").map((d) => parseFloat(d));

    if (dims.length < 2) {
      return res.status(400).json({
        success: false,
        error:
          'Invalid dimensions format. Expected format: "widthxheightxdepth" (e.g., "305x305x10")',
      });
    }

    // Calculate m² from mm (width * height / 1,000,000)
    const m2PerTile = (dims[0] * dims[1]) / 1000000;
    const totalM2 = m2PerTile * parseInt(quantity);
    const totalPrice = totalM2 * parseFloat(price_per_m2);

    res.json({
      success: true,
      calculation: {
        quantity: parseInt(quantity),
        dimensions: dimensions,
        m2_per_tile: parseFloat(m2PerTile.toFixed(6)),
        total_m2: parseFloat(totalM2.toFixed(4)),
        price_per_m2: parseFloat(price_per_m2),
        total_price: parseFloat(totalPrice.toFixed(2)),
        currency: "GBP",
      },
    });
  } catch (error) {
    console.error("Error calculating m² price:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to calculate m² price",
      details: error.message,
    });
  }
});

/**
 * POST /api/cart/add-item
 * Add an item to the cart
 *
 * Headers:
 * - X-Session-Id: Session ID from /nonce endpoint (required)
 *
 * Body parameters:
 * - id: Product or variation ID (required)
 * - quantity: Quantity to add (required)
 * - m2_quantity: Square meters quantity for price calculation (optional)
 * - variation: Array of variation attributes (required for variable products)
 *   Example: [{ attribute: "pa_sizemm", value: "305x305x10" }]
 */
router.post("/add-item", async (req, res) => {
  try {
    const { id, quantity, m2_quantity, variation } = req.body;
    const WC_STORE_URL = process.env.WC_SITE_URL;
    const sessionId = req.headers["x-session-id"];

    // Validate required fields
    if (!id || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: id and quantity are required",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error:
          "Missing X-Session-Id header. Please call /nonce endpoint first.",
      });
    }

    // Get stored cookies for this session
    const storedCookies = req.app.locals.cartSessions.get(sessionId);

    // Calculate m2_quantity from dimensions if not provided
    let calculatedM2 = m2_quantity;

    if (!calculatedM2 && variation && Array.isArray(variation)) {
      // Find size attribute (e.g., "305x305x10")
      const sizeAttr = variation.find(
        (v) =>
          v.attribute === "pa_sizemm" ||
          v.attribute.toLowerCase().includes("size")
      );

      if (sizeAttr && sizeAttr.value) {
        // Parse dimensions (e.g., "305x305x10" -> [305, 305, 10])
        const dimensions = sizeAttr.value.split("x").map((d) => parseFloat(d));

        if (dimensions.length >= 2) {
          // Calculate m² from mm (width * height / 1,000,000)
          const m2PerTile = (dimensions[0] * dimensions[1]) / 1000000;
          calculatedM2 = m2PerTile * parseInt(quantity);
        }
      }
    }

    // Prepare request data
    const requestData = {
      id: parseInt(id),
      quantity: parseInt(quantity),
    };

    // Add variation data if provided
    if (variation && Array.isArray(variation)) {
      requestData.variation = variation;
    }

    // Make request to WooCommerce
    const response = await axios.post(
      `${WC_STORE_URL}/wp-json/wc/store/v1/cart/add-item`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
          Nonce: req.headers.nonce || req.headers["x-wc-store-api-nonce"] || "",
          Cookie: storedCookies || "",
        },
      }
    );

    // ✅ Update stored cookies if new ones are returned
    const newCookies = response.headers["set-cookie"];
    if (newCookies) {
      const newCookieString = newCookies.join("; ");
      // ✅ Merge with existing cookies, don't replace
      const existingCookies = storedCookies || "";
      const mergedCookies = existingCookies
        ? `${existingCookies}; ${newCookieString}`
        : newCookieString;
      req.app.locals.cartSessions.set(sessionId, mergedCookies);
    }

    // If m2_quantity was calculated, include it in response
    const responseData = {
      success: true,
      message: "Item added to cart successfully",
      cart: response.data,
      session_id: sessionId,
    };

    if (calculatedM2) {
      responseData.m2_quantity = calculatedM2.toFixed(3);
    }

    res.json(responseData);
  } catch (error) {
    console.error(
      "Error adding item to cart:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || "Failed to add item to cart",
      details: error.response?.data,
    });
  }
});

/**
 * POST /api/cart/update-item
 * Update cart item quantity
 *
 * Headers:
 * - X-Session-Id: Session ID from previous requests (required)
 *
 * Body parameters:
 * - key: Cart item key (required)
 * - quantity: New quantity (required)
 */
router.post("/update-item", async (req, res) => {
  try {
    const { key, quantity } = req.body;
    const WC_STORE_URL = process.env.WC_SITE_URL;
    const sessionId = req.headers["x-session-id"];

    if (!key || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: key and quantity are required",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "Missing X-Session-Id header",
      });
    }

    // Get stored cookies for this session
    const storedCookies = req.app.locals.cartSessions.get(sessionId);

    const response = await axios.post(
      `${WC_STORE_URL}/wp-json/wc/store/v1/cart/update-item`,
      {
        key,
        quantity: parseInt(quantity),
      },
      {
        headers: {
          "Content-Type": "application/json",
          Nonce: req.headers.nonce || req.headers["x-wc-store-api-nonce"] || "",
          Cookie: storedCookies || "",
        },
      }
    );

    // Update stored cookies if new ones are returned
    const newCookies = response.headers["set-cookie"];
    if (newCookies) {
      req.app.locals.cartSessions.set(sessionId, newCookies.join("; ")); // ✅ Changed
    }

    res.json({
      success: true,
      message: "Cart item updated successfully",
      cart: response.data,
    });
  } catch (error) {
    console.error(
      "Error updating cart item:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || "Failed to update cart item",
      details: error.response?.data,
    });
  }
});

/**
 * POST /api/cart/remove-item
 * Remove an item from the cart
 *
 * Headers:
 * - X-Session-Id: Session ID from previous requests (required)
 *
 * Body parameters:
 * - key: Cart item key (required)
 */
router.post("/remove-item", async (req, res) => {
  try {
    const { key } = req.body;
    const WC_STORE_URL = process.env.WC_SITE_URL;
    const sessionId = req.headers["x-session-id"];

    if (!key) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: key is required",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "Missing X-Session-Id header",
      });
    }

    const storedCookies = req.app.locals.cartSessions.get(sessionId);

    const response = await axios.post(
      `${WC_STORE_URL}/wp-json/wc/store/v1/cart/remove-item`,
      { key },
      {
        headers: {
          "Content-Type": "application/json",
          Nonce: req.headers.nonce || req.headers["x-wc-store-api-nonce"] || "",
          Cookie: storedCookies || "",
        },
      }
    );

    res.json({
      success: true,
      message: "Item removed from cart successfully",
      cart: response.data,
    });
  } catch (error) {
    console.error(
      "Error removing cart item:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || "Failed to remove cart item",
      details: error.response?.data,
    });
  }
});

/**
 * DELETE /api/cart
 * Clear the entire cart
 *
 * Headers:
 * - X-Session-Id: Session ID from previous requests (required)
 */
router.delete("/", async (req, res) => {
  try {
    const WC_STORE_URL = process.env.WC_SITE_URL;
    const sessionId = req.headers["x-session-id"];

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "Missing X-Session-Id header",
      });
    }

    const storedCookies = req.app.locals.cartSessions.get(sessionId);

    const response = await axios.delete(
      `${WC_STORE_URL}/wp-json/wc/store/v1/cart/items`,
      {
        headers: {
          "Content-Type": "application/json",
          Nonce: req.headers.nonce || req.headers["x-wc-store-api-nonce"] || "",
          Cookie: storedCookies || "",
        },
      }
    );

    // Clear session after cart is cleared
    req.app.locals.cartSessions.delete(sessionId);

    res.json({
      success: true,
      message: "Cart cleared successfully",
      cart: response.data,
    });
  } catch (error) {
    console.error(
      "Error clearing cart:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || "Failed to clear cart",
      details: error.response?.data,
    });
  }
});

/**
 * POST /api/cart/process-payment
 * Process payment for an order
 *
 * Body parameters:
 * - orderId: WooCommerce order ID (required)
 * - paymentMethod: Payment method ("bank", "apple_pay", "google_pay") (required)
 * - cardDetails: Card details object (required for "bank" payment method)
 *   - cardNumber: Card number (required)
 *   - cardHolder: Cardholder name (required)
 *   - expiryMonth: Expiry month (required)
 *   - expiryYear: Expiry year (required)
 *   - cvc: Security code (required)
 */
router.post("/process-payment", async (req, res) => {
  try {
    const { orderId, paymentMethod, cardDetails } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "Missing orderId",
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        error: "Missing payment method",
      });
    }

    console.log("Processing payment:", {
      orderId,
      paymentMethod,
      hasCardDetails: !!cardDetails,
    });

    // Verify the order exists
    const { data: existingOrder } = await axios.get(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/orders/${orderId}`,
      {
        auth: {
          username: process.env.WC_CONSUMER_KEY,
          password: process.env.WC_CONSUMER_SECRET,
        },
      }
    );

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    if (existingOrder.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: `Order is already ${existingOrder.status}`,
      });
    }

    // For card payments, validate card details
    if (paymentMethod === "bank") {
      if (!cardDetails) {
        return res.status(400).json({
          success: false,
          error: "Card details are required for card payments",
        });
      }

      const { cardNumber, cardHolder, expiryMonth, expiryYear, cvc } =
        cardDetails;

      if (!cardNumber || !cardHolder || !expiryMonth || !expiryYear || !cvc) {
        return res.status(400).json({
          success: false,
          error: "Incomplete card details",
        });
      }

      // Basic card number validation
      const cleanCardNumber = cardNumber.replace(/\s/g, "");
      if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
        return res.status(400).json({
          success: false,
          error: "Invalid card number",
        });
      }

      // Check expiry date
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const expYear = parseInt(expiryYear);
      const expMonth = parseInt(expiryMonth);

      if (
        expYear < currentYear ||
        (expYear === currentYear && expMonth < currentMonth)
      ) {
        return res.status(400).json({
          success: false,
          error: "Card has expired",
        });
      }
    }

    // TODO: Integrate with real payment gateway (Stripe, WooCommerce Payments, etc.)
    // For now, simulate payment processing

    console.log("⏳ Simulating payment processing (2 seconds)...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulate 95% success rate for testing
    const paymentSuccessful = Math.random() > 0.05;

    if (!paymentSuccessful) {
      return res.status(402).json({
        success: false,
        error: "Payment declined",
        message:
          "Your card was declined. Please try a different payment method.",
      });
    }

    // Update order status after successful payment
    const updatePayload = {
      status: "processing", // or "completed" depending on your workflow
      payment_method:
        paymentMethod === "bank" ? "woocommerce_payments" : paymentMethod,
      payment_method_title:
        paymentMethod === "bank" ? "Credit / Debit Card" : paymentMethod,
      set_paid: true,
      transaction_id: `sim_${Date.now()}`, // Replace with actual transaction ID from payment gateway
      date_paid: new Date().toISOString(),
      meta_data: [
        {
          key: "_payment_processor",
          value: "simulated", // Replace with "woocommerce_payments" or your gateway
        },
        {
          key: "_card_last4",
          value: cardDetails?.cardNumber?.slice(-4) || "****",
        },
      ],
    };

    const { data: updatedOrder } = await axios.put(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/orders/${orderId}`,
      updatePayload,
      {
        auth: {
          username: process.env.WC_CONSUMER_KEY,
          password: process.env.WC_CONSUMER_SECRET,
        },
      }
    );

    console.log("Payment processed successfully:", {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      total: updatedOrder.total,
      paid: updatedOrder.date_paid,
    });

    // Clear the cart session after successful payment
    const sessionId = req.headers["x-session-id"];
    /*if (sessionId && req.app.locals.cartSessions) {
      req.app.locals.cartSessions.delete(sessionId);
      console.log("🧹 Cleared cart session after successful payment");
    }*/
    if (sessionId) {
      if (req.app.locals.cartSessions) {
        req.app.locals.cartSessions.delete(sessionId);
        console.log("🧹 Cleared cart session");
      }
      if (req.app.locals.sessionOrders) {
        req.app.locals.sessionOrders.delete(sessionId);
        console.log("🧹 Cleared order mapping");
      }
    }

    return res.json({
      success: true,
      message: "Payment processed successfully",
      order: {
        id: updatedOrder.id,
        order_key: updatedOrder.order_key,
        status: updatedOrder.status,
        total: updatedOrder.total,
        currency: updatedOrder.currency,
        date_paid: updatedOrder.date_paid,
        payment_method: updatedOrder.payment_method_title,
      },
    });
  } catch (error) {
    console.error(
      "Payment processing error:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      error: "Payment processing failed",
      message: error.response?.data?.message || error.message,
    });
  }
});

export default router;
