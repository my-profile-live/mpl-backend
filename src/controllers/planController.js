import crypto from "crypto";
import Subscription from "../models/Subscription.js";
import PlanPayment from "../models/PlanPayment.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getPlansForUser, getPlanById, EXTRA_LEAD_PRICING } from "../data/plans.js";
import { getRazorpay, isRazorpayEnabled } from "../config/razorpay.js";

/* ─────────────────────── READ ─────────────────────── */

export async function getPlans(req, res) {
  res.json(
    new ApiResponse(200, {
      plans: getPlansForUser(req.user.role),
      extraLeadPricing: EXTRA_LEAD_PRICING[req.user.role],
    })
  );
}

export async function getMySubscription(req, res) {
  const sub = await Subscription.findOne({
    owner: req.user.id,
    status: "active",
  }).sort({ createdAt: -1 });

  res.json(
    new ApiResponse(200, {
      subscription: sub,
      leadsRemaining: req.userDoc.leadsRemaining,
      currentPlan: req.userDoc.currentPlan,
      planExpiry: req.userDoc.planExpiry,
    })
  );
}

/* ─────────────────────── PLAN UPGRADE ─────────────────────── */

/**
 * POST /api/plans/checkout { planId }
 * Creates a Razorpay order for the given plan.
 */
export async function createPlanOrder(req, res) {
  const { planId } = req.body;
  const userType = req.user.role;

  const plan = getPlanById(userType, planId);
  if (!plan) throw new ApiError(400, "Unknown plan.");
  if (!plan.price || plan.price <= 0) {
    throw new ApiError(400, "This plan is not purchasable.");
  }

  const amountPaise = plan.price * 100;

  /* ─── Dummy mode ─── */
  if (!isRazorpayEnabled()) {
    const orderId = `dummy_plan_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    return res.json(
      new ApiResponse(
        200,
        {
          dummy: true,
          orderId,
          amount: amountPaise,
          currency: "INR",
          planId: plan.id,
          planLabel: plan.label,
        },
        "Dummy order created."
      )
    );
  }

  /* ─── Real Razorpay ─── */
  const razorpay = getRazorpay();
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `plan_${userType}_${planId}_${Date.now()}`,
    notes: { userType, planId, purpose: "plan-upgrade" },
  });

  res.json(
    new ApiResponse(
      200,
      {
        dummy: false,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        planId: plan.id,
        planLabel: plan.label,
      },
      "Order created."
    )
  );
}

/**
 * POST /api/plans/verify-payment
 * Verifies signature, records PlanPayment, activates the plan on the user.
 * Idempotent — repeating with the same paymentId returns success without
 * double-charging or double-granting.
 */
export async function verifyPlanPayment(req, res) {
  const {
    planId,
    orderId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  const userType = req.user.role;
  const user = req.userDoc;

  const plan = getPlanById(userType, planId);
  if (!plan) throw new ApiError(400, "Unknown plan.");

  const amountPaise = plan.price * 100;

  let paymentId;
  let actualOrderId;

  /* ─── Dummy mode ─── */
  if (!isRazorpayEnabled()) {
    actualOrderId = orderId || `dummy_plan_${Date.now()}`;
    paymentId = `dummy_pay_${Date.now()}`;
  } else {
    /* ─── Real mode — HMAC check ─── */
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
      throw new ApiError(400, "Payment verification failed. Invalid signature.");
    }

    actualOrderId = razorpay_order_id;
    paymentId = razorpay_payment_id;
  }

  /* ─── Idempotency — has this paymentId been recorded already? ─── */
  const existing = await PlanPayment.findOne({ paymentId });
  if (existing && existing.status === "paid") {
    return res.json(
      new ApiResponse(
        200,
        {
          currentPlan: user.currentPlan,
          planExpiry: user.planExpiry,
          leadsRemaining: user.leadsRemaining,
          alreadyProcessed: true,
        },
        "Plan already activated."
      )
    );
  }

  /* ─── Record the payment ─── */
  await PlanPayment.create({
    userType,
    user: user._id,
    userModel: userType === "company" ? "Company" : "JobSeeker",
    purpose: "plan",
    planId: plan.id,
    orderId: actualOrderId,
    paymentId,
    amount: amountPaise,
    currency: "INR",
    status: "paid",
    dummy: !isRazorpayEnabled(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  /* ─── Activate the plan on the user ─── */
  const now = new Date();
  const expiresAt = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);

  user.currentPlan = plan.id;
  user.planExpiry = expiresAt;
  user.leadsRemaining = (user.leadsRemaining || 0) + plan.leads;   // stack
  await user.save();

  /* ─── Log the Subscription ─── */
  await Subscription.create({
    ownerType: userType,
    owner: user._id,
    ownerModel: userType === "company" ? "Company" : "JobSeeker",
    planId: plan.id,
    label: plan.label,
    price: plan.price,
    leadsGranted: plan.leads,
    startedAt: now,
    expiresAt,
    status: "active",
  });

  res.json(
    new ApiResponse(
      200,
      {
        currentPlan: user.currentPlan,
        planExpiry: user.planExpiry,
        leadsRemaining: user.leadsRemaining,
        paymentId,
      },
      `${plan.label} activated.`
    )
  );
}

/* ─────────────────────── EXTRA LEADS ─────────────────────── */

/**
 * POST /api/plans/extra-leads/checkout { count }
 * Creates a Razorpay order for extra-leads top-up.
 */
export async function createExtraLeadsOrder(req, res) {
  const count = Number(req.body.count);
  const userType = req.user.role;
  const pricing = EXTRA_LEAD_PRICING[userType];

  if (!pricing) throw new ApiError(400, "Extra leads are not available for this account.");
  if (!count || count < pricing.minimum) {
    throw new ApiError(400, `Minimum purchase is ${pricing.minimum} leads.`);
  }
  if (count > 500) {
    throw new ApiError(400, "Maximum purchase is 500 leads per order.");
  }

  const amountPaise = count * pricing.perLead * 100;

  if (!isRazorpayEnabled()) {
    const orderId = `dummy_leads_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    return res.json(
      new ApiResponse(
        200,
        {
          dummy: true,
          orderId,
          amount: amountPaise,
          currency: "INR",
          count,
        },
        "Dummy order created."
      )
    );
  }

  const razorpay = getRazorpay();
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `leads_${userType}_${count}_${Date.now()}`,
    notes: { userType, count, purpose: "extra-leads" },
  });

  res.json(
    new ApiResponse(
      200,
      {
        dummy: false,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        count,
      },
      "Order created."
    )
  );
}

/**
 * POST /api/plans/extra-leads/verify-payment
 */
export async function verifyExtraLeadsPayment(req, res) {
  const {
    count,
    orderId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  const userType = req.user.role;
  const user = req.userDoc;
  const pricing = EXTRA_LEAD_PRICING[userType];

  if (!pricing) throw new ApiError(400, "Extra leads are not available for this account.");

  const leadsCount = Number(count);
  if (!leadsCount || leadsCount < pricing.minimum) {
    throw new ApiError(400, `Minimum purchase is ${pricing.minimum} leads.`);
  }

  const amountPaise = leadsCount * pricing.perLead * 100;

  let paymentId;
  let actualOrderId;

  if (!isRazorpayEnabled()) {
    actualOrderId = orderId || `dummy_leads_${Date.now()}`;
    paymentId = `dummy_pay_${Date.now()}`;
  } else {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new ApiError(400, "Missing payment fields.");
    }
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (expected !== razorpay_signature) {
      throw new ApiError(400, "Payment verification failed. Invalid signature.");
    }
    actualOrderId = razorpay_order_id;
    paymentId = razorpay_payment_id;
  }

  /* Idempotency */
  const existing = await PlanPayment.findOne({ paymentId });
  if (existing && existing.status === "paid") {
    return res.json(
      new ApiResponse(
        200,
        {
          leadsRemaining: user.leadsRemaining,
          alreadyProcessed: true,
        },
        "Extra leads already added."
      )
    );
  }

  await PlanPayment.create({
    userType,
    user: user._id,
    userModel: userType === "company" ? "Company" : "JobSeeker",
    purpose: "extra-leads",
    leadsCount,
    orderId: actualOrderId,
    paymentId,
    amount: amountPaise,
    currency: "INR",
    status: "paid",
    dummy: !isRazorpayEnabled(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  user.leadsRemaining = (user.leadsRemaining || 0) + leadsCount;
  await user.save();

  res.json(
    new ApiResponse(
      200,
      {
        leadsRemaining: user.leadsRemaining,
        paymentId,
      },
      `${leadsCount} extra leads added.`
    )
  );
}