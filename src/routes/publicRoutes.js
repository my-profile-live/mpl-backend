import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as candidates from "../controllers/candidateController.js";
import * as seo from "../controllers/seoController.js";

const router = Router();

const CRAWLER_AGENTS = /googlebot|google-inspectiontool|adsbot-google|storebot-google|bingbot|duckduckbot|gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|perplexitybot|perplexity-user|google-extended|applebot|amazonbot|bytespider|ccbot|meta-externalagent|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot/i;

const publicProfileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => CRAWLER_AGENTS.test(req.get("user-agent") || ""),
  message: { success: false, message: "Too many profile requests. Please wait a moment." },
});

/* No auth. Contact details are stripped in the controller. */
router.get("/llms.txt", seo.llmsTxt);
router.get("/sitemap.xml", seo.sitemapIndex);
router.get("/sitemap/:page", seo.sitemapPage);
router.get("/profile/:slug/share.jpg", seo.profileCardImage);
router.get("/profile/:slug", publicProfileLimiter, candidates.getPublicProfile);
router.get(["/social", "/social/"], seo.socialCard);
router.get("/social/:slug", seo.socialCard);

export default router;