import { Router } from "express";
import { protect } from "../middleware/auth.js";
import * as plans from "../controllers/planController.js";
import * as invoices from "../controllers/invoiceController.js";

const router = Router();
router.use(protect);

router.get("/", plans.getPlans);
router.get("/my-subscription", plans.getMySubscription);
router.get("/invoices", invoices.listInvoices);
router.get("/invoice", invoices.latestInvoice);

/* Plan upgrade — Razorpay checkout */
router.post("/checkout", plans.createPlanOrder);
router.post("/verify-payment", plans.verifyPlanPayment);

/* Extra leads — Razorpay checkout */
router.post("/extra-leads/checkout", plans.createExtraLeadsOrder);
router.post("/extra-leads/verify-payment", plans.verifyExtraLeadsPayment);

/* Return page confirms whichever order this user started. */
router.post("/confirm", plans.confirmCheckout);

export default router;