import crypto from "crypto";
import { getRazorpay, isRazorpayEnabled } from "../config/razorpay.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import SignupPayment from "../models/SignupPayment.js";

const SIGNUP_AMOUNT_PAISE = 100; // ₹1

/* ─────────────────────── CREATE ORDER ─────────────────────── */

export const createSignupOrder = asyncHandler(async (req, res) => {
  const { userType } = req.body;

  if (!["company", "jobseeker"].includes(userType)) {
    throw new ApiError(400, "userType must be 'company' or 'jobseeker'.");
  }

  /* ─── Dummy mode ─── */
  if (!isRazorpayEnabled()) {
    const orderId = `dummy_order_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return res.json(
      new ApiResponse(
        200,
        { dummy: true, orderId, amount: SIGNUP_AMOUNT_PAISE, currency: "INR" },
        "Dummy order created."
      )
    );
  }

  /* ─── Real Razorpay order ─── */
  const razorpay = getRazorpay();

  const order = await razorpay.orders.create({
    amount: SIGNUP_AMOUNT_PAISE,
    currency: "INR",
    receipt: `signup_${userType}_${Date.now()}`,
    notes: { userType, purpose: "signup" },
  });

  console.log("[razorpay] order created:", order.id);

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

  /* ─── Dummy mode ─── */
  if (!isRazorpayEnabled()) {
    const dummyOrderId = orderId || `dummy_order_${Date.now()}`;
    const dummyPaymentId = `dummy_pay_${Date.now()}`;

    await SignupPayment.create({
      userType,
      orderId: dummyOrderId,
      paymentId: dummyPaymentId,
      amount: SIGNUP_AMOUNT_PAISE,
      status: "paid",
      dummy: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    return res.json(
      new ApiResponse(
        200,
        { signupPayment: true, paymentId: dummyPaymentId, orderId: dummyOrderId },
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
    amount: SIGNUP_AMOUNT_PAISE,
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