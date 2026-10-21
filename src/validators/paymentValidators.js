import { z } from "zod";

const userTypeEnum = z.enum(["company", "jobseeker"]);

/* NOTE: validate.js parses req.body directly (no { body } wrapper). */
export const createSignupOrderSchema = z.object({
  userType: userTypeEnum,
  planId: z.enum(["1m", "3m", "6m", "12m"]).optional(),
  customerName: z.string().trim().min(1).max(100).optional(),
  customerEmail: z.string().trim().email().max(200).optional(),
  customerPhone: z.string().trim().min(10).max(20).optional(),
});

export const verifySignupPaymentSchema = z.object({
  userType: userTypeEnum,
  orderId: z.string().trim().min(1),
});