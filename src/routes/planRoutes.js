import { Router } from "express";
import { protect } from "../middleware/auth.js";
import * as plans from "../controllers/planController.js";

const router = Router();
router.use(protect);

router.get("/", plans.getPlans);
router.get("/my-subscription", plans.getMySubscription);

/* Plan upgrade — two-step Razorpay flow */
router.post("/checkout", plans.createPlanOrder);
router.post("/verify-payment", plans.verifyPlanPayment);

/* Extra leads — two-step Razorpay flow */
router.post("/extra-leads/checkout", plans.createExtraLeadsOrder);
router.post("/extra-leads/verify-payment", plans.verifyExtraLeadsPayment);

export default router;