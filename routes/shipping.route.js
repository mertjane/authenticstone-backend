import express from "express";
import axios from "axios";

const router = express.Router();

router.post("/methods", async (req, res) => {
  const { country, state = "", postcode = "", city = "" } = req.body;

  try {
    const auth = {
      username: process.env.WC_CONSUMER_KEY,
      password: process.env.WC_CONSUMER_SECRET,
    };

    const orderId = req.body.orderId || req.headers["x-order-id"];

    if (!orderId) {
      return res.status(400).json({
        error: "Order ID is required to calculate shipping",
      });
    }

    console.log(`📦 Fetching shipping for order ${orderId}`);

    const { data: order } = await axios.get(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/orders/${orderId}`,
      { auth }
    );

    const { data: updatedOrder } = await axios.put(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/orders/${orderId}`,
      {
        shipping: {
          first_name: order.shipping.first_name || "Customer",
          last_name: order.shipping.last_name || "",
          address_1: order.shipping.address_1 || "Address",
          address_2: order.shipping.address_2 || "",
          city: city || order.shipping.city || "City",
          state: state || order.shipping.state || "",
          postcode: postcode || order.shipping.postcode || "",
          country: country || order.shipping.country || "",
        },
      },
      { auth }
    );

    console.log("📍 Shipping address:", {
      city: updatedOrder.shipping.city,
      postcode: updatedOrder.shipping.postcode,
      country: updatedOrder.shipping.country,
    });

    const lineItems = updatedOrder.line_items || [];
    let totalWeight = 0;
    const cartShippingClasses = new Set();
    const productCategories = new Set();
    const productSlugs = new Set();

    for (const item of lineItems) {
      try {
        const productId = item.variation_id || item.product_id;
        const { data: product } = await axios.get(
          `${process.env.WC_SITE_URL}/wp-json/wc/v3/products/${productId}`,
          { auth }
        );

        const weight = parseFloat(product.weight) || 0;
        totalWeight += weight * item.quantity;

        // ✅ Add shipping class if it exists and is not empty
        if (product.shipping_class && product.shipping_class.trim() !== "") {
          cartShippingClasses.add(product.shipping_class.toLowerCase());
        }

        // ✅ Add product slug for matching
        if (product.slug) {
          productSlugs.add(product.slug.toLowerCase());
        }

        // ✅ Add categories for additional filtering
        if (product.categories && product.categories.length > 0) {
          product.categories.forEach(cat => {
            productCategories.add(cat.name.toLowerCase());
            productCategories.add(cat.slug.toLowerCase());
          });
        }

        console.log(`📦 Item: ${item.name}`);
        console.log(`   Weight: ${weight}kg x ${item.quantity}`);
        console.log(`   Shipping Class: ${product.shipping_class || 'none'}`);
        console.log(`   Categories: ${product.categories?.map(c => c.name).join(', ') || 'none'}`);
      } catch (error) {
        console.warn(`⚠️ Could not fetch details for product ${item.product_id}`);
      }
    }

    const cartShippingClassesArray = Array.from(cartShippingClasses);

    console.log("⚖️ Total cart weight:", totalWeight, "kg");
    console.log("🏷️ Cart shipping classes:", cartShippingClassesArray);
    console.log("📂 Cart categories:", Array.from(productCategories));

    const { data: zones } = await axios.get(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/shipping/zones`,
      { auth }
    );

    const zonesWithLocations = await Promise.all(
      zones.map(async (zone) => {
        const { data: locations } = await axios.get(
          `${process.env.WC_SITE_URL}/wp-json/wc/v3/shipping/zones/${zone.id}/locations`,
          { auth }
        );
        return { ...zone, locations };
      })
    );

    const matchedZone = zonesWithLocations.find((zone) =>
      zone.locations.some((location) => {
        if (location.type === "country" && location.code === country) return true;
        if (location.type === "state" && location.code === `${country}:${state}`) return true;
        if (location.type === "postcode") {
          const locationCode = location.code.toLowerCase().replace(/\s/g, '');
          const userPostcode = postcode.toLowerCase().replace(/\s/g, '');
          return userPostcode.startsWith(locationCode);
        }
        return false;
      })
    );

    if (!matchedZone) {
      console.log("❌ No shipping zone found for location");
      return res.json({
        success: true,
        shipping_methods: [{
          title: "Collection",
          cost: "Free",
          method_id: "local_pickup",
          instance_id: 0,
        }],
      });
    }

    console.log(`✅ Matched zone: ${matchedZone.name}`);

    const { data: methods } = await axios.get(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/shipping/zones/${matchedZone.id}/methods`,
      { auth }
    );

    let shippingMethods = [];

    // ✅ Define special product type prefixes
    const specialPrefixes = [
      { prefix: "Moulding -", keywords: ["moulding", "molding"] },
      { prefix: "Jerusalem -", keywords: ["jerusalem"] },
      { prefix: "Vanity Tops -", keywords: ["vanity", "vanity-top", "vanity-tops"] },
      { prefix: "Brazilian -", keywords: ["brazilian"] },
      { prefix: "Slab -", keywords: ["slab"] },
      { prefix: "LTP -", keywords: ["ltp"] },
    ];

    for (const method of methods.filter(m => m.enabled)) {
      const title = (method.settings?.method_title?.value) || method.title || method.method_title || "Unnamed Method";

      console.log(`\n🔍 Evaluating method: ${title}`);
      console.log(`   Method ID: ${method.method_id}, Instance: ${method.instance_id}`);

      // ✅ Check if this is a special product-specific method
      const specialPrefix = specialPrefixes.find(sp => title.startsWith(sp.prefix));

      if (specialPrefix) {
        // This method is for specific products only
        const hasMatchingProduct =
          cartShippingClassesArray.some(cls =>
            specialPrefix.keywords.some(keyword => cls.includes(keyword))
          ) ||
          Array.from(productCategories).some(cat =>
            specialPrefix.keywords.some(keyword => cat.includes(keyword))
          ) ||
          Array.from(productSlugs).some(slug =>
            specialPrefix.keywords.some(keyword => slug.includes(keyword))
          );

        if (!hasMatchingProduct) {
          console.log(`⏭️ Skipping ${title} - cart doesn't contain matching products`);
          continue;
        }
        console.log(`✅ Cart contains products matching ${title}`);
      }

      // ✅ Check for shipping class restrictions
      const methodShippingClasses = method.settings?.class_cost_calculation_type?.value ||
                                     method.settings?.shipping_class?.value;

      if (methodShippingClasses && typeof methodShippingClasses === 'string' &&
          methodShippingClasses !== '' && methodShippingClasses !== 'per_order') {
        // Method has shipping class restrictions
        const requiredClasses = methodShippingClasses.split(',').map(c => c.trim().toLowerCase());
        const hasRequiredClass = requiredClasses.some(reqClass =>
          cartShippingClassesArray.includes(reqClass)
        );

        if (!hasRequiredClass && cartShippingClassesArray.length > 0) {
          console.log(`⏭️ Skipping ${title} - shipping class mismatch`);
          console.log(`   Required: ${requiredClasses.join(', ')}`);
          console.log(`   Cart has: ${cartShippingClassesArray.join(', ')}`);
          continue;
        }
      }

      // ✅ Calculate cost based on weight rules
      let calculatedCost = 0;
      let ruleMatched = false;

      if (method.settings?.method_rules?.value) {
        const rules = method.settings.method_rules.value;

        const matchingRule = rules
          .filter(rule => {
            const minWeight = parseFloat(rule.min || 0);
            const maxWeight = parseFloat(rule.max || Infinity);
            return totalWeight >= minWeight && totalWeight <= maxWeight;
          })
          .sort((a, b) => {
            const aMin = parseFloat(a.min || 0);
            const bMin = parseFloat(b.min || 0);
            return bMin - aMin;
          })[0];

        if (matchingRule) {
          if (matchingRule.cost_per_order) {
            calculatedCost = parseFloat(matchingRule.cost_per_order);
          } else if (matchingRule.cost_per_weight) {
            calculatedCost = parseFloat(matchingRule.cost_per_weight) * totalWeight;
          }
          ruleMatched = true;

          console.log(`💰 Applied rule for ${title}: £${calculatedCost}`);
          console.log(`   Weight: ${totalWeight}kg, Range: ${matchingRule.min || 0}-${matchingRule.max || '∞'}kg`);
        } else {
          console.log(`⏭️ Skipping ${title} - no matching weight rule for ${totalWeight}kg`);
          continue;
        }
      } else if (method.settings?.cost) {
        calculatedCost = parseFloat(method.settings.cost.value || method.settings.cost || 0);
        ruleMatched = true;
        console.log(`💰 Using fixed cost for ${title}: £${calculatedCost}`);
      } else {
        console.log(`⚠️ No cost rules found for ${title}, skipping`);
        continue;
      }

      if (!ruleMatched) {
        console.log(`⏭️ Skipping ${title} - no applicable rules`);
        continue;
      }

      const displayCost = calculatedCost === 0 ? "Free" : `£${calculatedCost.toFixed(2)}`;

      console.log(`✅ Including: ${title} - ${displayCost}`);

      shippingMethods.push({
        title,
        cost: displayCost,
        costNumeric: calculatedCost,
        method_id: method.method_id,
        instance_id: method.instance_id,
      });
    }

    // ✅ Remove exact duplicates by title AND cost
        const uniqueMethods = [];
        const seenMethods = new Map();

        for (const method of shippingMethods) {
          // Normalize title and create key with title + cost
          const normalizedTitle = method.title.replace(/\s+/g, ' ').trim();
          const methodKey = `${normalizedTitle}|${method.costNumeric}`;

          if (!seenMethods.has(methodKey)) {
            seenMethods.set(methodKey, true);
            // Remove costNumeric before sending to client
            const { costNumeric, ...clientMethod } = method;
            clientMethod.title = normalizedTitle;
            uniqueMethods.push(clientMethod);
          } else {
            console.log(`🗑️ Removing duplicate: ${method.title} - ${method.cost}`);
          }
        }

        // ✅ Add Collection method only if not already present
        const collectionKey = 'Collection|0';
        if (!seenMethods.has(collectionKey)) {
          uniqueMethods.push({
            title: "Collection",
            cost: "Free",
            method_id: "local_pickup",
            instance_id: 0,
          });
        }

    console.log("\n📋 Final shipping methods:", uniqueMethods.length);
    uniqueMethods.forEach(m => console.log(`   - ${m.title}: ${m.cost}`));

    return res.json({
      success: true,
      shipping_methods: uniqueMethods,
    });
  } catch (error) {
    console.error("❌ Shipping error:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch shipping methods",
      details: error.response?.data || error.message,
    });
  }
});

export default router;