import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validate.js";
import {
  createSignupOrder,
  verifySignupPayment,
} from "../controllers/paymentController.js";
import {
  createSignupOrderSchema,
  verifySignupPaymentSchema,
} from "../validators/paymentValidators.js";

const router = Router();

// Throttle order creation + verification to prevent abuse.
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  "/signup/create-order",
  paymentLimiter,
  validate(createSignupOrderSchema),
  createSignupOrder
);

router.post(
  "/signup/verify",
  paymentLimiter,
  validate(verifySignupPaymentSchema),
  verifySignupPayment
);

export default router;