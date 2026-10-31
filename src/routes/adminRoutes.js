import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect, requireRole } from "../middleware/auth.js";
import * as admin from "../controllers/adminController.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, statusCode: 429, message: "Too many requests. Please try again later." },
});

router.post("/login", loginLimiter, admin.login);

router.use(protect, requireRole("admin"));
router.get("/companies", admin.companies);
router.get("/companies/export", admin.exportCompanies);
router.get("/jobseekers", admin.jobSeekers);
router.get("/jobseekers/export", admin.exportJobSeekers);
router.get("/coupons", admin.listCoupons);
router.post("/coupons", admin.createCoupon);
router.patch("/coupons/:id", admin.updateCoupon);
router.get("/coupons/:id/uses", admin.couponUses);
router.get("/sales", admin.listSales);
router.get("/sales/export", admin.exportSales);
router.get("/affiliates", admin.listAffiliates);
router.get("/affiliates/export", admin.exportAffiliates);
router.post("/affiliates", admin.createAffiliate);
router.patch("/affiliates/:id", admin.updateAffiliate);
router.delete("/affiliates/:id", admin.deleteAffiliate);

export default router;
