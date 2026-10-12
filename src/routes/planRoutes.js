import { Router } from "express";
import { protect } from "../middleware/auth.js";
import * as plans from "../controllers/planController.js";

const router = Router();
router.use(protect);

router.get("/", plans.getPlans);
router.get("/my-subscription", plans.getMySubscription);
router.post("/subscribe", plans.subscribeToPlan);
router.post("/buy-extra-leads", plans.buyExtraLeads);

export default router;
