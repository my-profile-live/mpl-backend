import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect, requireRole } from "../middleware/auth.js";
import * as agent from "../controllers/agentController.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, statusCode: 429, message: "Too many requests. Please try again later." },
});

router.post("/login", loginLimiter, agent.login);
router.get("/link/:code", agent.publicLink);
router.get("/dashboard", protect, requireRole("agent"), agent.dashboard);

export default router;
