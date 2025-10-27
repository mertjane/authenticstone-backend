import express from "express";
import axios from "axios";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/", async (req, res) => {
  const { billing, shipping, customer_note, shipping_lines } = req.body;
  const sessionId = req.headers['x-session-id'];

  if (!sessionId) {
    return res.status(400).json({ error: "Missing session ID" });
  }

  try {
  // ✅ Check if we already created an order for this session
      if (!req.app.locals.sessionOrders) {
        req.app.locals.sessionOrders = new Map();
      }

      const existingOrderId = req.app.locals.sessionOrders.get(sessionId);

      if (existingOrderId) {
            console.log(`♻️ Order ${existingOrderId} already exists for session ${sessionId}, returning existing order`);

               // ✅ Build update payload
                     const updateData = {};

                     if (billing) {
                             updateData.billing = {
                               first_name: billing.first_name || "",
                               last_name: billing.last_name || "",
                               company: billing.company || "",
                               address_1: billing.address_1 || "",
                               address_2: billing.address_2 || "",
                               city: billing.city || "",
                               state: billing.state || "",
                               postcode: billing.postcode || "",
                               country: billing.country || "",
                               email: billing.email || "",
                               phone: billing.phone || "",
                             };
                           }

                           if (shipping) {
                             updateData.shipping = {
                               first_name: shipping.first_name || "",
                               last_name: shipping.last_name || "",
                               company: shipping.company || "",
                               address_1: shipping.address_1 || "",
                               address_2: shipping.address_2 || "",
                               city: shipping.city || "",
                               state: shipping.state || "",
                               postcode: shipping.postcode || "",
                               country: shipping.country || "",
                             };
                           }

                           if (customer_note) {
                                   updateData.customer_note = customer_note;
                                 }

                // ✅ CRITICAL: Update shipping lines if provided
                      if (shipping_lines && shipping_lines.length > 0) {
                        updateData.shipping_lines = shipping_lines.map((line) => ({
                          method_id: line.method_id,
                          method_title: line.method_title,
                          total: line.total || "0",
                        }));
                        console.log("📦 Adding shipping lines to update:", updateData.shipping_lines);
                      }

             console.log("📤 Updating existing order with:", updateData);

            // ✅ UPDATE the existing order with proper auth
                  const { data: updatedOrder } = await axios.put(
                    `${process.env.WC_SITE_URL}/wp-json/wc/v3/orders/${existingOrderId}`,
                    updateData,
                    {
                      auth: {
                        username: process.env.WC_CONSUMER_KEY,
                        password: process.env.WC_CONSUMER_SECRET,
                      },
                    }
                  );

                  console.log("✅ Order updated successfully:", {
                    orderId: updatedOrder.id,
                    status: updatedOrder.status,
                    shipping_lines: updatedOrder.shipping_lines,
                  });

                  return res.json({
                    success: true,
                    message: "Order updated with new information",
                    order: {
                      id: updatedOrder.id,
                      order_key: updatedOrder.order_key,
                      status: updatedOrder.status,
                      total: updatedOrder.total,
                      currency: updatedOrder.currency,
                    }
                  });
                }


    // Optional: Get customer ID from auth token if provided
    let customerId = null;
    const authHeader = req.headers.authorization;

    if (authHeader) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        customerId = decoded.userId;
      } catch (jwtError) {
        console.warn("Invalid auth token, proceeding as guest:", jwtError.message);
      }
    }

    // Step 1: Get cart from session
    const storedCookies = req.app.locals.cartSessions?.get(sessionId);

    if (!storedCookies) {
      return res.status(400).json({ error: "Invalid or expired cart session" });
    }

    const cartResponse = await axios.get(
      `${process.env.WC_SITE_URL}/wp-json/wc/store/v1/cart`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Nonce': req.headers.nonce || req.headers['x-wc-store-api-nonce'] || '',
          'Cookie': storedCookies || ''
        }
      }
    );

    const cart = cartResponse.data;

    console.log("📦 Cart data received:", JSON.stringify(cart, null, 2));

    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Step 2: Build order data from cart - FIX THE LINE ITEMS MAPPING
    const lineItems = cart.items.map(item => {
      console.log("🔍 Processing cart item:", {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        prices: item.prices,
        variation: item.variation,
      });

      const lineItem = {
        product_id: item.id,
        quantity: item.quantity,
        subtotal: (item.prices.price / 100).toFixed(2),
        total: (item.totals.line_total / 100).toFixed(2),
      };

      // Check if it's a variation
      if (item.variation && item.variation.length > 0) {
        if (item.extensions?.parent_id) {
          lineItem.product_id = item.extensions.parent_id;
          lineItem.variation_id = item.id;
        } else {
          lineItem.variation_id = item.id;
        }

        // Add variation attributes
        lineItem.variation = item.variation.map(v => ({
          attribute: v.attribute,
          value: v.value
        }));
      }

      // ✅ ONLY add metadata that we explicitly want
      if (item.item_data && item.item_data.length > 0) {
        const allowedMetaKeys = ['Total m²', 'Dimensions', '_m2_quantity'];

        lineItem.meta_data = item.item_data
          .filter(meta => allowedMetaKeys.includes(meta.key))
          .map(meta => ({
            key: meta.key,
            value: meta.value
          }));
      }

      return lineItem;
    });

    console.log("📝 Prepared line items:", JSON.stringify(lineItems, null, 2));

    // Step 2.5: For variations, fetch parent product IDs
    const lineItemsWithParentIds = await Promise.all(
      lineItems.map(async (lineItem) => {
        if (lineItem.variation_id && !lineItem.product_id) {
          try {
            const variationResponse = await axios.get(
              `${process.env.WC_SITE_URL}/wp-json/wc/v3/products/${lineItem.variation_id}`,
              {
                auth: {
                  username: process.env.WC_CONSUMER_KEY,
                  password: process.env.WC_CONSUMER_SECRET,
                },
              }
            );

            if (variationResponse.data.parent_id) {
              lineItem.product_id = variationResponse.data.parent_id;
              console.log(`✅ Found parent product ${lineItem.product_id} for variation ${lineItem.variation_id}`);
            } else {
              lineItem.product_id = lineItem.variation_id;
              delete lineItem.variation_id;
            }
          } catch (error) {
            console.error(`❌ Error fetching parent for variation ${lineItem.variation_id}:`, error.message);
            lineItem.product_id = lineItem.variation_id;
            delete lineItem.variation_id;
          }
        }
        return lineItem;
      })
    );

    // Step 3: Build order data
    const orderData = {
      status: "pending",
      created_via: "checkout",
      customer_ip_address: req.ip || req.connection.remoteAddress || "",
      customer_user_agent: req.get("user-agent") || "",
      line_items: lineItemsWithParentIds,
      total: (cart.totals.total_price / 100).toFixed(2),
      subtotal: (cart.totals.total_items / 100).toFixed(2),
    };

    if (customerId) {
      orderData.customer_id = customerId;
    }

    if (billing) {
      orderData.billing = {
        first_name: billing.first_name || "",
        last_name: billing.last_name || "",
        company: billing.company || "",
        address_1: billing.address_1 || "",
        address_2: billing.address_2 || "",
        city: billing.city || "",
        state: billing.state || "",
        postcode: billing.postcode || "",
        country: billing.country || "",
        email: billing.email || "",
        phone: billing.phone || "",
      };
    }

    if (shipping) {
      orderData.shipping = {
        first_name: shipping.first_name || "",
        last_name: shipping.last_name || "",
        company: shipping.company || "",
        address_1: shipping.address_1 || "",
        address_2: shipping.address_2 || "",
        city: shipping.city || "",
        state: shipping.state || "",
        postcode: shipping.postcode || "",
        country: shipping.country || "",
      };
    }

    if (customer_note) {
      orderData.customer_note = customer_note;
    }

    if (shipping_lines && shipping_lines.length > 0) {
      orderData.shipping_lines = shipping_lines.map((line) => ({
        method_id: line.method_id,
        method_title: line.method_title,
        total: line.total || "0",
        instance_id: line.instance_id || 0, // ✅ include this
      }));
    }

    console.log("📤 Creating order with data:", JSON.stringify(orderData, null, 2));


    // Step 4: CREATE the order in WooCommerce
    const { data: createdOrder } = await axios.post(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/orders`,
      orderData,
      {
        auth: {
          username: process.env.WC_CONSUMER_KEY,
          password: process.env.WC_CONSUMER_SECRET,
        },
      }
    );

    console.log("✅ Order created:", {
      orderId: createdOrder.id,
      status: createdOrder.status,
      total: createdOrder.total,
    });

    const cleanedOrder = createdOrder;


    // ✅ Store the session -> order_id mapping to prevent duplicates
    req.app.locals.sessionOrders.set(sessionId, cleanedOrder.id);
    console.log(`📝 Mapped session ${sessionId} to order ${cleanedOrder.id}`);

    return res.json({
      success: true,
      message: "Order created with billing and shipping information",
      order: {
        id: cleanedOrder.id,
        order_key: cleanedOrder.order_key,
        status: cleanedOrder.status,
        total: cleanedOrder.total,
        currency: cleanedOrder.currency,
      }
    });
  } catch (error) {
    console.error(
      "❌ Checkout error:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Failed to process checkout",
      details: error.response?.data || error.message,
    });
  }
});


export default router;

