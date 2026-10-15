import crypto from "crypto";
import { getRazorpay, isRazorpayEnabled } from "../config/razorpay.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import SignupPayment from "../models/SignupPayment.js";

/**
 * Signup verification fee, in paise (Razorpay wants the smallest currency
 * unit — paise for INR).
 *
 *   ₹1  = 100   paise
 *   ₹99 = 9900  paise
 *
 * Keep this map as the single source of truth for the amount on the backend.
 * The frontend mirrors it in PaymentStep.jsx.
 */
const SIGNUP_FEE_PAISE = {
  company: 9900,    // ₹99
  jobseeker: 100,   // ₹1
};

function getSignupFeePaise(userType) {
  const amount = SIGNUP_FEE_PAISE[userType];
  if (!amount) {
    throw new ApiError(400, "userType must be 'company' or 'jobseeker'.");
  }
  return amount;
}

/* ─────────────────────── CREATE ORDER ─────────────────────── */

export const createSignupOrder = asyncHandler(async (req, res) => {
  const { userType } = req.body;

  if (!["company", "jobseeker"].includes(userType)) {
    throw new ApiError(400, "userType must be 'company' or 'jobseeker'.");
  }

  const amountPaise = getSignupFeePaise(userType);

  /* ─── Dummy mode ─── */
  if (!isRazorpayEnabled()) {
    const orderId = `dummy_order_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return res.json(
      new ApiResponse(
        200,
        { dummy: true, orderId, amount: amountPaise, currency: "INR" },
        "Dummy order created."
      )
    );
  }

  /* ─── Real Razorpay order ─── */
  const razorpay = getRazorpay();

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `signup_${userType}_${Date.now()}`,
    notes: { userType, purpose: "signup" },
  });

  console.log("[razorpay] order created:", order.id, `₹${amountPaise / 100}`);

  return res.json(
    new ApiResponse(
      200,
      {
        dummy: false,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
      "Order created."
    )
  );
});

/* ─────────────────────── VERIFY PAYMENT ─────────────────────── */

export const verifySignupPayment = asyncHandler(async (req, res) => {
  const {
    userType,
    orderId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!["company", "jobseeker"].includes(userType)) {
    throw new ApiError(400, "userType must be 'company' or 'jobseeker'.");
  }

  const amountPaise = getSignupFeePaise(userType);

  /* ─── Dummy mode ─── */
  if (!isRazorpayEnabled()) {
    const dummyOrderId = orderId || `dummy_order_${Date.now()}`;
    const dummyPaymentId = `dummy_pay_${Date.now()}`;

    await SignupPayment.create({
      userType,
      orderId: dummyOrderId,
      paymentId: dummyPaymentId,
      amount: amountPaise,
      status: "paid",
      dummy: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    return res.json(
      new ApiResponse(
        200,
        {
          signupPayment: true,
          paymentId: dummyPaymentId,
          orderId: dummyOrderId,
        },
        "Payment verified (dummy)."
      )
    );
  }

  /* ─── Real mode — HMAC signature check ─── */
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(
      400,
      "razorpay_order_id, razorpay_payment_id and razorpay_signature are required."
    );
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature) {
    console.error("[razorpay] signature mismatch", {
      expected,
      received: razorpay_signature,
    });
    throw new ApiError(400, "Payment verification failed. Invalid signature.");
  }

  await SignupPayment.create({
    userType,
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    amount: amountPaise,
    status: "paid",
    dummy: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  console.log("[razorpay] payment verified:", razorpay_payment_id);

  return res.json(
    new ApiResponse(
      200,
      {
        signupPayment: true,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      },
      "Payment verified."
    )
  );
});