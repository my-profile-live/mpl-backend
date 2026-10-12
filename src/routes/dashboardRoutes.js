import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.js";
import { jobSeekerDashboard, companyDashboard } from "../controllers/dashboardController.js";

const router = Router();
router.use(protect);

router.get("/jobseeker", requireRole("jobseeker"), jobSeekerDashboard);
router.get("/company", requireRole("company"), companyDashboard);

export default router;
