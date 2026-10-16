import { Router } from "express";
import { protect } from "../middleware/auth.js";
import * as plans from "../controllers/planController.js";

const router = Router();
router.use(protect);

router.get("/", plans.getPlans);
router.get("/my-subscription", plans.getMySubscription);

/* Plan upgrade — Cashfree redirect checkout */
router.post("/checkout", plans.createPlanOrder);
router.post("/verify-payment", plans.verifyPlanPayment);

/* Extra leads — Cashfree redirect checkout */
router.post("/extra-leads/checkout", plans.createExtraLeadsOrder);
router.post("/extra-leads/verify-payment", plans.verifyExtraLeadsPayment);

/* Return page confirms whichever order this user started. */
router.post("/confirm", plans.confirmCheckout);

export default router;