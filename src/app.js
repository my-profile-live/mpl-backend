import "express-async-errors"; // lets async route handlers throw without try/catch
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import path from "path";
import apiRoutes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import StoredImage from "./models/StoredImage.js";

const app = express();

/* Trust X-Forwarded-For only in production, behind one proxy.
   Enabling it locally lets clients pick a new rate-limit key per request. */
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/* ─────────── CORS ─────────── */

/* Static allow-list — always allowed regardless of env */
const STATIC_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "https://mpl-frontend-liart.vercel.app",
];

if (process.env.NODE_ENV !== "production") {
  STATIC_ALLOWED_ORIGINS.push("http://10.231.40.193:5173");
}

/* Also read from env — comma-separated list, e.g.
   CLIENT_URL="https://app.example.com,https://staging.example.com" */
const ENV_ALLOWED_ORIGINS = (process.env.CLIENT_URL || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))    // strip trailing slash
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  ...new Set([...STATIC_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS]),
];

console.log("[CORS] Allowed origins:", ALLOWED_ORIGINS);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: function (origin, callback) {
      /* Allow requests with no origin: curl, Postman, mobile apps, server-to-server */
      if (!origin) return callback(null, true);

      const cleanOrigin = origin.replace(/\/$/, "");

      if (ALLOWED_ORIGINS.includes(cleanOrigin)) {
        return callback(null, true);
      }

      /* Preview hosts are allowed only outside production.
         The deployed frontend is listed explicitly above. */
      if (
        process.env.NODE_ENV !== "production" &&
        (/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(cleanOrigin) ||
          /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(cleanOrigin))
      ) {
        return callback(null, true);
      }

      console.warn("[CORS] Blocked origin:", cleanOrigin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
if (process.env.NODE_ENV !== "test") app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/uploads/:name", async (req, res, next) => {
  const id = String(req.params.name || "").replace(/\.webp$/i, "");
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(id)) return next();
  const image = await StoredImage.findById(id).select("data contentType").lean();
  if (!image?.data) return next();
  const body = Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data.buffer);
  res.setHeader("Content-Type", image.contentType || "image/webp");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.send(body);
});

app.use(
  "/uploads",
  express.static(path.resolve("uploads"), {
    dotfiles: "deny",
    index: false,
    maxAge: "7d",
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
