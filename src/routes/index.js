import { Router } from "express";
import authRoutes from "./authRoutes.js";
import profileRoutes from "./profileRoutes.js";
import candidateRoutes from "./candidateRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import activityRoutes from "./activityRoutes.js";
import planRoutes from "./planRoutes.js";
import paymentRoutes from "./paymentRoutes.js";
import companyRoutes from "./companyRoutes.js";

const router = Router();

router.get("/health", (req, res) => res.json({ success: true, message: "MPL API is healthy", time: new Date() }));

router.use("/auth", authRoutes);
router.use("/payment", paymentRoutes);
router.use("/profile", profileRoutes);
router.use("/candidates", candidateRoutes);
router.use("/companies", companyRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/plans", planRoutes);
router.use("/", activityRoutes); // exposes /activity and /company/activity directly

export default router;
