import dotenv from "dotenv";
import pagesRouter from "./routes/pages.route.js";
import cartRouter from "./routes/cart.route.js";
import authRouter from "./routes/auth.route.js";
import sortRouter from "./routes/sort.route.js";
import searchRouter from "./routes/search.route.js";
import filterRouter from "./routes/filters.route.js";
import productsRouter from "./routes/products.route.js";
import singleProductRouter from "./routes/singleProduct.route.js";
import variationsRouter from "./routes/variations.route.js";
import attributesRouter from "./routes/attributes.route.js";
import attributeRouter from "./routes/attribute.route.js";
import categoriesRouter from "./routes/categories.route.js";
import tagsRouter from "./routes/tags.route.js";
import megamenuRouter from "./routes/megamenu.route.js";
import advancedSearchRouter from "./routes/advancedSearch.route.js";
import filteredProductsRouter from "./routes/filteredProducts.route.js";
import contentRouter from "./routes/content.route.js";

import bodyParser from "body-parser";
import session from "express-session";
import express from "express";
import cors from "cors";
import WooCommerceRestApiPkg from "@woocommerce/woocommerce-rest-api";


dotenv.config();

const WooCommerceRestApi =
  WooCommerceRestApiPkg.default || WooCommerceRestApiPkg;

const app = express();

/* ------------------------- 🧩 CORS CONFIG ------------------------- */

// Dynamic CORS origin check – allows both production and preview deployments
const corsOptions = {
  origin: (origin, callback) => {
    // Always allow same-origin requests (like SSR)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "http://localhost:5173", // Dev
      "https://authenticstone-frontend.pages.dev", // Production
    ];

    // Allow all Cloudflare preview deployments automatically
    const isCloudflarePreview = origin.endsWith(
      ".authenticstone-frontend.pages.dev"
    );

    if (allowedOrigins.includes(origin) || isCloudflarePreview) {
      callback(null, true);
    } else {
      console.warn("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // allow cookies
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));


/* ------------------------- 🍪 SESSION CONFIG ------------------------- */

app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      httpOnly: true, // not accessible via JS
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // cross-domain cookies allowed in prod
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

/* ------------------------- 🧰 MIDDLEWARES ------------------------- */

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



/* ------------------------- 🛒 WOOCOMMERCE CONFIG ------------------------- */

export const api = new WooCommerceRestApi({
  url: process.env.WC_SITE_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
});

/* ------------------------- ⚙️ HELPERS ------------------------- */

export const handleError = (res, error, message = "Internal server error") => {
  console.error(`Error: ${message}`, error.response?.data || error.message);
  res.status(500).json({
    success: false,
    message,
    error: error.response?.data || error.message,
  });
};

// Success response helper
export const successResponse = (res, data, message = "Success", meta = {}) => {
  res.status(200).json({
    success: true,
    message,
    data,
    meta,
  });
};

/* ------------------------- 🧭 ROUTES ------------------------- */

app.use("/api/pages", pagesRouter);
app.use("/api/cart", cartRouter);
app.use("/api/auth", authRouter);
app.use("/api/sort", sortRouter);
app.use("/api/suggestions", searchRouter);
app.use("/api/products/filters", filterRouter);
app.use("/api/products", productsRouter);
app.use("/api/product", singleProductRouter);
app.use("/api/variation", variationsRouter);
app.use("/api/attributes", attributesRouter);
app.use("/api/attribute", attributeRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/megamenu", megamenuRouter);
app.use("/api/search", advancedSearchRouter);
app.use("/api/filtered-products", filteredProductsRouter);
app.use("/api", contentRouter); // posts and clearance

/* ------------------------- SERVER ------------------------- */

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
