import { z } from "zod";

const userTypeEnum = z.enum(["company", "jobseeker"]);

/* NOTE: validate.js parses req.body directly (no { body } wrapper). */
export const createSignupOrderSchema = z.object({
  userType: userTypeEnum,
});

export const verifySignupPaymentSchema = z
  .object({
    userType: userTypeEnum,
    orderId: z.string().optional(),
    razorpay_order_id: z.string().optional(),
    razorpay_payment_id: z.string().optional(),
    razorpay_signature: z.string().optional(),
  })
  .refine(
    (v) =>
      v.orderId ||
      (v.razorpay_order_id &&
        v.razorpay_payment_id &&
        v.razorpay_signature),
    {
      message:
        "Provide either orderId (dummy mode) or razorpay_order_id + razorpay_payment_id + razorpay_signature.",
      path: ["orderId"],
    }
  );