import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.js";
import { jobSeekerActivity, companyActivity } from "../controllers/activityController.js";

const router = Router();

router.get("/activity", protect, requireRole("jobseeker"), jobSeekerActivity);
router.get("/company/activity", protect, requireRole("company"), companyActivity);

export default router;
