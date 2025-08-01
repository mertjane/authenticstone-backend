import express from "express";
import { api, handleError, successResponse } from "../server.js";

const router = express.Router();

// Add to cart
router.post("/add", async (req, res) => {
  try {
    console.log("Add to cart request body:", req.body);

    if (!req.body || !req.body.product_id || req.body.quantity === undefined) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: product_id and quantity are required",
      });
    }

    const {
      product_id,
      variation_id,
      quantity,
      m2_quantity,
      is_sample,
      check_duplicates,
    } = req.body;

    // For variations, we need to get the parent product ID from WooCommerce
    let actualProductId = parseInt(product_id, 10);
    let actualVariationId = variation_id
      ? parseInt(variation_id, 10)
      : undefined;

    // If product_id equals variation_id, we need to fetch the parent product ID
    if (actualVariationId && actualProductId === actualVariationId) {
      try {
        console.log(
          `Fetching parent product ID for variation ${actualVariationId}`
        );
        const variationResponse = await api.get(
          `products/${actualVariationId}`
        );
        if (variationResponse.data.parent_id) {
          actualProductId = variationResponse.data.parent_id;
          console.log(
            `Updated product_id from ${product_id} to ${actualProductId}`
          );
        }
      } catch (error) {
        console.error("Error fetching variation details:", error.message);
        // Continue with original product_id if fetch fails
      }
    }

    // If we should check for duplicates
    if (check_duplicates) {
      // Get all orders in cart
      const cartResponse = await api.get("orders?status=pending");
      const existingOrders = cartResponse.data;

      console.log(
        `Found ${existingOrders.length} pending orders to check for duplicates`
      );
      console.log(
        `Looking for duplicates with product_id: ${actualProductId}, variation_id: ${actualVariationId}, is_sample: ${is_sample}`
      );
      existingOrders.forEach((order) => {
        console.log(
          `Order ${order.id} has ${order.line_items.length} line items`
        );
      });

      // Find matching item across all orders
      let existingItem = null;
      let existingOrderId = null;
      let existingOrder = null;

      for (const order of existingOrders) {
        const matchingItem = order.line_items.find((item) => {
          // Check product_id match (ensure both are numbers) - use corrected product ID
          const existingProductId = parseInt(item.product_id, 10);
          const productMatch = existingProductId === actualProductId;

          // Check variation_id match (handle undefined/null cases properly)
          const existingVariationId = item.variation_id
            ? parseInt(item.variation_id, 10)
            : null;
          const variationMatch = actualVariationId === existingVariationId;

          // Check sample status match
          /* const existingIsSample =
            item.meta_data?.some(
              (meta) => meta.key === "_is_sample" && meta.value === true
            ) || false; */

          // Improved sample status check
          const existingIsSample =
            item.meta_data?.some(
              (meta) =>
                meta.key === "_is_sample" &&
                (meta.value === true || meta.value === "1" || meta.value === 1)
            ) || false;

          const newIsSample = Boolean(is_sample);
          const sampleMatch = existingIsSample === newIsSample;

          // Additional check for sample items - they should match exactly
          if (newIsSample && existingIsSample) {
            // For samples, we want exact matches on product_id and variation_id
            return productMatch && variationMatch;
          }

          console.log(`Checking item ${item.id}:`, {
            productMatch,
            variationMatch,
            sampleMatch,
            actualProductId,
            existingProductId,
            actualVariationId,
            existingVariationId,
            existingIsSample,
            newIsSample,
          });

          return productMatch && variationMatch && sampleMatch;
        });

        if (matchingItem) {
          existingItem = matchingItem;
          existingOrderId = order.id;
          existingOrder = order;
          break;
        }
      }

      if (existingItem && existingOrderId) {
        console.log("Found duplicate item, updating quantities:", {
          existingOrderId,
          existingItemId: existingItem.id,
          currentQuantity: existingItem.quantity,
          addingQuantity: parseInt(quantity, 10),
          currentPrice: existingItem.price,
          preservingPrice: true,
        });

        // Calculate new quantities
        const newQuantity = existingItem.quantity + parseInt(quantity, 10);

        // Ensure m2_quantity is properly handled as numbers
        const existingM2Quantity =
          parseFloat(
            existingItem.meta_data.find((m) => m.key === "_m2_quantity")?.value
          ) || 0;
        const incomingM2Quantity =
          m2_quantity !== undefined ? parseFloat(m2_quantity) : 0;
        const newM2Quantity = existingM2Quantity + incomingM2Quantity;

        console.log("M2 Quantity calculation:", {
          existingM2Quantity,
          incomingM2Quantity,
          newM2Quantity,
          existingM2Raw: existingItem.meta_data.find(
            (m) => m.key === "_m2_quantity"
          )?.value,
          incomingM2Raw: m2_quantity,
        });

        // Update meta data
        const updatedMetaData = [...existingItem.meta_data];

        // Update or add m2_quantity (ensure it's stored as a number)
        const m2Index = updatedMetaData.findIndex(
          (m) => m.key === "_m2_quantity"
        );
        if (m2Index >= 0) {
          updatedMetaData[m2Index] = {
            ...updatedMetaData[m2Index],
            value: parseFloat(newM2Quantity.toFixed(3)),
          };
        } else if (incomingM2Quantity > 0) {
          updatedMetaData.push({
            key: "_m2_quantity",
            value: parseFloat(newM2Quantity.toFixed(3)),
          });
        }

        // Calculate correct totals to maintain price consistency
        const originalPrice = parseFloat(existingItem.price);
        const newSubtotal = (originalPrice * newM2Quantity).toFixed(2);
        const newTotal = newSubtotal; // Assuming no tax for now

        console.log("Price calculation for duplicate update:", {
          originalPrice,
          newQuantity,
          newM2Quantity,
          newSubtotal,
          newTotal,
        });

        // Prepare all line items for the order (keep existing ones and update the matched one)
        const updatedLineItems = existingOrder.line_items.map((lineItem) => {
          if (lineItem.id === existingItem.id) {
            return {
              id: lineItem.id,
              product_id: lineItem.product_id,
              variation_id: lineItem.variation_id,
              quantity: newQuantity,
              price: originalPrice, // Preserve original price per unit
              subtotal: newSubtotal, // Set correct subtotal
              total: newTotal, // Set correct total
              meta_data: updatedMetaData,
            };
          }
          return {
            id: lineItem.id,
            product_id: lineItem.product_id,
            variation_id: lineItem.variation_id,
            quantity: lineItem.quantity,
            price: lineItem.price,
            subtotal: lineItem.subtotal,
            total: lineItem.total,
            meta_data: lineItem.meta_data,
          };
        });

        // Create a completely new order with the combined item and delete the old order
        try {
          // Collect all items from the old order EXCEPT the duplicate
          const otherItems = existingOrder.line_items
            .filter((item) => item.id !== existingItem.id)
            .map((item) => ({
              product_id: item.product_id,
              variation_id: item.variation_id,
              quantity: item.quantity,
              meta_data: item.meta_data,
            }));

          // Create new line item with combined quantities
          const newCombinedItem = {
            product_id: actualProductId,
            variation_id: actualVariationId,
            quantity: newQuantity,
            meta_data: updatedMetaData,
          };

          // All line items for the new order
          const allLineItems = [...otherItems, newCombinedItem];

          console.log("Creating new order to replace duplicate:", {
            oldOrderId: existingOrderId,
            removingItemId: existingItem.id,
            otherItemsCount: otherItems.length,
            newCombinedItem,
            totalNewItems: allLineItems.length,
          });

          // Create completely new order
          const newOrderResponse = await api.post("orders", {
            payment_method: "bacs",
            payment_method_title: "Direct Bank Transfer",
            status: "pending",
            line_items: allLineItems,
          });

          // Delete the old order
          await api.delete(`orders/${existingOrderId}`, { force: true });

          console.log("Successfully replaced order:", {
            newOrderId: newOrderResponse.data.id,
            deletedOrderId: existingOrderId,
          });

          return successResponse(res, {
            line_items: newOrderResponse.data.line_items,
            order_id: newOrderResponse.data.id,
          });
        } catch (error) {
          console.error("Error creating new order:", error);
          // Fallback to the original update method
          const updateResponse = await api.put(`orders/${existingOrderId}`, {
            line_items: updatedLineItems,
          });

          return successResponse(res, {
            line_items: updateResponse.data.line_items,
            order_id: updateResponse.data.id,
          });
        }
      }
    }

    // If no duplicate found or check_duplicates is false, proceed with new item
    const parsedQuantity = parseInt(quantity, 10);
    const parsedM2Quantity =
      m2_quantity !== undefined ? parseFloat(m2_quantity) : undefined;

    /* const isSample =
      is_sample ||
      (variation_id &&
        (variation_id.toString().includes("free-sample") ||
          variation_id.toString().includes("full-size-sample"))); */
    const isSample =
      is_sample ||
      (variation_id &&
        (variation_id.toString().includes("free-sample") ||
          variation_id.toString().includes("full-size-sample") ||
          req.body.sku?.includes("SAMPLE"))); // Add any other sample identifiers

    const lineItem = {
      product_id: actualProductId,
      variation_id: actualVariationId,
      quantity: parsedQuantity,
      meta_data: [],
    };

    if (parsedM2Quantity !== undefined && !isSample) {
      lineItem.meta_data.push({
        key: "_m2_quantity",
        value: parsedM2Quantity,
      });
    }

    /* if (isSample) {
      lineItem.meta_data.push({
        key: "_is_sample",
        value: true,
      });
    } */
    // Add sample metadata consistently
    if (isSample) {
      lineItem.meta_data.push({
        key: "_is_sample",
        value: "1", // Use consistent value (string "1" instead of boolean true)
      });

      // For samples, we might want to add additional identifying metadata
      lineItem.meta_data.push({
        key: "sample_type",
        value: "free-sample", // or "full-size-sample" depending on your needs
      });
    }

    const response = await api.post("orders", {
      payment_method: "bacs",
      payment_method_title: "Direct Bank Transfer",
      status: "pending",
      line_items: [lineItem],
    });

    return successResponse(res, {
      line_items: response.data.line_items,
      order_id: response.data.id,
    });
  } catch (error) {
    console.error("Error in /api/cart/add:", error);
    handleError(res, error, "Failed to add to cart");
  }
});

// Update cart item
router.put("/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity, m2_quantity } = req.body;

    // First get the existing order
    const orderResponse = await api.get(`orders/${itemId}`);
    const existingItem = orderResponse.data.line_items[0];

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    // Update quantities
    const updatedQuantity = existingItem.quantity + parseInt(quantity, 10);

    let updatedM2Quantity = existingItem.meta_data.find(
      (m) => m.key === "_m2_quantity"
    )?.value;
    if (m2_quantity !== undefined) {
      updatedM2Quantity = (updatedM2Quantity || 0) + parseFloat(m2_quantity);
    }

    // Prepare updated meta data
    const updatedMetaData = existingItem.meta_data.map((meta) => {
      if (meta.key === "_m2_quantity") {
        return { ...meta, value: updatedM2Quantity };
      }
      return meta;
    });

    // If m2_quantity didn't exist before, add it
    if (
      m2_quantity !== undefined &&
      !updatedMetaData.some((m) => m.key === "_m2_quantity")
    ) {
      updatedMetaData.push({
        key: "_m2_quantity",
        value: updatedM2Quantity,
      });
    }

    const response = await api.put(`orders/${itemId}`, {
      line_items: [
        {
          ...existingItem,
          quantity: updatedQuantity,
          meta_data: updatedMetaData,
        },
      ],
    });

    successResponse(res, {
      line_items: response.data.line_items,
      order_id: response.data.id,
    });
  } catch (error) {
    console.error("Error in /api/cart/:itemId:", error);
    handleError(res, error, "Failed to update cart item");
  }
});

// Update the GET /cart endpoint
router.get("/", async (req, res) => {
  try {
    const response = await api.get("orders", {
      status: "pending",
      per_page: 10,
      orderby: "date",
      order: "desc",
    });

    // Process line items to include calculated data
    const processedItems = [];
    response.data.forEach((order) => {
      if (order.line_items && order.line_items.length > 0) {
        order.line_items.forEach((item) => {
          // Robust sample detection
          const isSample = item.meta_data.some(meta => 
            (meta.key === "_is_sample" && 
             (meta.value === true || meta.value === "1" || meta.value === 1)) ||
            item.sku?.includes("SAMPLE") ||
            item.name?.includes("Sample"))

          // Safely get m2_quantity with proper fallbacks
          const m2Meta = item.meta_data.find(m => m.key === "_m2_quantity");
          const m2Quantity = m2Meta ? 
            typeof m2Meta.value === 'string' ? 
              parseFloat(m2Meta.value) : 
              Number(m2Meta.value) :
            0;

          // Calculate display quantity
          const displayQuantity = isSample ? item.quantity : m2Quantity || item.quantity;

          // Calculate prices
          const displayPrice = item.price;
          const totalPrice = isSample ? 
            item.price * item.quantity : 
            item.price * (m2Quantity || item.quantity);

          processedItems.push({
            id: item.id,
            ...item,
            is_sample: isSample,
            m2_quantity: m2Quantity,
            display_quantity: displayQuantity,
            display_price: displayPrice,
            total: totalPrice.toFixed(2),
            parent_name: item.name.split(' - ')[0] // Extract parent name if needed
          });
        });
      }
    });

    successResponse(res, {
      line_items: processedItems,
      orders_found: response.data.length,
    });
  } catch (error) {
    console.error("Error in cart GET:", error);
    handleError(res, error, "Failed to fetch cart");
  }
});

/* Delete item by ID */
router.delete("/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;

    console.log(`Attempting to delete item ${itemId}`);

    // Get all pending orders
    const ordersResponse = await api.get("orders", {
      status: "pending",
      per_page: 10,
    });

    // Find the order containing our item
    const orderWithItem = ordersResponse.data.find((order) =>
      order.line_items?.some((item) => item.id === Number(itemId))
    );

    if (!orderWithItem) {
      console.log(`Item ${itemId} not found in any pending orders`);
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    console.log(`Found item ${itemId} in order ${orderWithItem.id}`);

    // Get the remaining items (excluding the one to delete)
    const remainingItems = orderWithItem.line_items.filter(
      (item) => item.id !== Number(itemId)
    );

    console.log(
      `Order has ${orderWithItem.line_items.length} items, ${remainingItems.length} will remain`
    );

    // If no items left, delete the entire order
    if (remainingItems.length === 0) {
      console.log(
        `Deleting entire order ${orderWithItem.id} as no items remain`
      );
      await api.delete(`orders/${orderWithItem.id}`, { force: true });

      return successResponse(res, {
        success: true,
        message: "Item removed from cart, order deleted",
      });
    } else {
      // Create a new order with remaining items and delete the old one
      console.log(
        `Creating new order with ${remainingItems.length} remaining items`
      );

      const newLineItems = remainingItems.map((item) => ({
        product_id: item.product_id,
        variation_id: item.variation_id,
        quantity: item.quantity,
        meta_data: item.meta_data,
      }));

      // Create new order
      const newOrderResponse = await api.post("orders", {
        payment_method: "bacs",
        payment_method_title: "Direct Bank Transfer",
        status: "pending",
        line_items: newLineItems,
      });

      // Delete old order
      await api.delete(`orders/${orderWithItem.id}`, { force: true });

      console.log(
        `Successfully replaced order ${orderWithItem.id} with ${newOrderResponse.data.id}`
      );

      return successResponse(res, {
        success: true,
        message: "Item removed from cart",
        new_order_id: newOrderResponse.data.id,
      });
    }
  } catch (error) {
    console.error("Error in /api/cart/:itemId DELETE:", error);
    handleError(res, error, "Failed to remove item from cart");
  }
});

export default router;