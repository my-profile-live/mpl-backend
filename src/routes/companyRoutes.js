import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.js";
import * as companies from "../controllers/companyController.js";
import { requireActivePlan } from "../middleware/requireActivePlan.js";

const router = Router();
router.use(protect);

/* Job seeker only — unlock a company's contact */
router.post(
  "/:id/unlock-contact",
  requireRole("jobseeker"),
  requireActivePlan,
  companies.unlockCompanyContact
);

/* Any authenticated user can view a company profile */
router.get("/:id", companies.getCompanyById);

export default router;