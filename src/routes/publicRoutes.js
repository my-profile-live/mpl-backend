import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as candidates from "../controllers/candidateController.js";
import * as seo from "../controllers/seoController.js";

const router = Router();

const publicProfileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many profile requests. Please wait a moment." },
});

/* No auth. Contact details are stripped in the controller. */
router.get("/sitemap.xml", seo.sitemapIndex);
router.get("/sitemap/:page", seo.sitemapPage);
router.get("/profile/:slug", publicProfileLimiter, candidates.getPublicProfile);

export default router;