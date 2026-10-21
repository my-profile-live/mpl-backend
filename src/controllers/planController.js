import Subscription from "../models/Subscription.js";
import PlanPayment from "../models/PlanPayment.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getPlansForUser, getPlanById, EXTRA_LEAD_PRICING } from "../data/plans.js";
import { planIsLive } from "../constants/plans.js";
import {
  cashfreeConfig,
  checkoutReturnUrl,
  createCashfreeOrder,
  fetchCashfreeOrder,
  isPaidOrder,
  normalizeIndianPhone,
  paymentMode,
} from "../config/cashfree.js";
import { sendInvoiceForPayment } from "./invoiceController.js";

async function emailPaidInvoice(user, userType, paymentId) {
  try {
    const paidRecord = await PlanPayment.findOne({
      paymentId,
      user: user._id,
      status: "paid",
    });
    if (paidRecord) await sendInvoiceForPayment(user, userType, paidRecord);
  } catch (err) {
    console.error("[invoice-email]", err.message);
  }
}

function payerFromUser(user, userType) {
  const phone = normalizeIndianPhone(user.mobileNumber);
  const email = String(user.email || user.companyEmail || "")
    .trim()
    .toLowerCase();
  const name = String(
    userType === "company"
      ? user.contactPersonName || user.companyName
      : user.fullName || ""
  )
    .trim()
    .slice(0, 100);

  if (!phone || !email || !name) {
    throw new ApiError(
      400,
      "Name, email, and a valid 10-digit mobile number are required to pay."
    );
  }

  return {
    phone,
    email,
    name,
    customerId: `mpl${String(user._id)}`,
  };
}

async function openCheckout({ amountPaise, customer, note }) {
  try {
    const data = await createCashfreeOrder({
      amountRupees: amountPaise / 100,
      customerId: customer.customerId,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      returnUrl: checkoutReturnUrl("/payment/return"),
      note,
    });
    return {
      id: data.order_id,
      paymentSessionId: data.payment_session_id,
      environment: cashfreeConfig().environment,
    };
  } catch (err) {
    throw new ApiError(err.statusCode || 502, err.message || "Could not start payment.");
  }
}

function checkoutPayload(order, extra) {
  return {
    dummy: false,
    provider: "cashfree",
    orderId: order.id,
    paymentSessionId: order.paymentSessionId,
    environment: order.environment,
    currency: "INR",
    ...extra,
  };
}

/** Returns true only for the request that first confirms a paid order. */
async function claimPaidRecord(record) {
  if (record.status === "paid") return false;

  let remote;
  try {
    remote = await fetchCashfreeOrder(record.orderId);
  } catch (err) {
    throw new ApiError(err.statusCode || 502, err.message || "Could not confirm payment.");
  }
  if (!isPaidOrder(remote, record.amount)) {
    throw new ApiError(400, "Payment was not completed.");
  }

  const won = await PlanPayment.findOneAndUpdate(
    { _id: record._id, status: "created" },
    { $set: { status: "paid" } },
    { new: true }
  );
  return Boolean(won);
}

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
  const mode = paymentMode();
  if (mode === "unavailable") {
    throw new ApiError(503, "Payments are temporarily unavailable.");
  }

  /* ─── Dummy mode ─── */
  if (mode === "dummy") {
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

  const payer = payerFromUser(req.userDoc, userType);
  const order = await openCheckout({
    amountPaise,
    customer: payer,
    note: plan.label,
  });

  await PlanPayment.create({
    userType,
    user: req.userDoc._id,
    userModel: userType === "company" ? "Company" : "JobSeeker",
    purpose: "plan",
    planId: plan.id,
    orderId: order.id,
    paymentId: order.id,
    amount: amountPaise,
    currency: "INR",
    status: "created",
    dummy: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  res.json(
    new ApiResponse(
      200,
      checkoutPayload(order, {
        amount: amountPaise,
        description: plan.label,
        planId: plan.id,
        planLabel: plan.label,
      }),
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
  const { planId, orderId } = req.body;

  const userType = req.user.role;
  const user = req.userDoc;
  const mode = paymentMode();
  if (mode === "unavailable") {
    throw new ApiError(503, "Payments are temporarily unavailable.");
  }

  let paymentId;
  let actualOrderId;
  let plan;
  let amountPaise;
  let alreadyPaid = false;

  /* ─── Dummy mode ─── */
  if (mode === "dummy") {
    plan = getPlanById(userType, planId);
    if (!plan) throw new ApiError(400, "Unknown plan.");
    amountPaise = plan.price * 100;
    actualOrderId = orderId || `dummy_plan_${Date.now()}`;
    paymentId = `dummy_pay_${Date.now()}`;
  } else {
    if (!orderId) throw new ApiError(400, "orderId is required.");

    const record = await PlanPayment.findOne({
      orderId,
      user: user._id,
      purpose: "plan",
    });
    if (!record) throw new ApiError(400, "Payment order was not found.");

    plan = getPlanById(userType, record.planId);
    if (!plan) throw new ApiError(400, "Unknown plan.");
    if (planId && planId !== record.planId) {
      throw new ApiError(400, "This payment does not match the selected plan.");
    }
    amountPaise = record.amount;
    alreadyPaid = !(await claimPaidRecord(record));
    actualOrderId = record.orderId;
    paymentId = record.paymentId;
  }

  if (alreadyPaid) {
    return res.json(
      new ApiResponse(
        200,
        {
          currentPlan: user.currentPlan,
          planExpiry: user.planExpiry,
          leadsRemaining: user.leadsRemaining,
          alreadyProcessed: true,
          purpose: "plan",
        },
        "Plan already activated."
      )
    );
  }

  if (mode === "dummy") {
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
      dummy: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  }

  /* ─── Activate the plan on the user ─── */
  const now = new Date();
  const expiresAt = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);
  const carryCredits = planIsLive(user);

  user.currentPlan = plan.id;
  user.planExpiry = expiresAt;
  user.leadsRemaining = carryCredits ? (user.leadsRemaining || 0) + plan.leads : plan.leads;
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

  await emailPaidInvoice(user, userType, paymentId);

  res.json(
    new ApiResponse(
      200,
      {
        currentPlan: user.currentPlan,
        planExpiry: user.planExpiry,
        leadsRemaining: user.leadsRemaining,
        paymentId,
        purpose: "plan",
        planLabel: plan.label,
      },
      `${plan.label} activated.`
    )
  );
}

/* ─────────────────────── EXTRA LEADS ─────────────────────── */

/**
 * POST /api/plans/extra-leads/checkout { count }
 * Creates a Razorpay order for an extra-leads top-up.
 */
export async function createExtraLeadsOrder(req, res) {
  const count = Number(req.body.count);
  const userType = req.user.role;
  const pricing = EXTRA_LEAD_PRICING[userType];

  if (!pricing) throw new ApiError(400, "Extra leads are not available for this account.");
  if (!planIsLive(req.userDoc)) {
    throw new ApiError(402, "Your plan has expired. Upgrade your plan before buying extra credits.");
  }
  if (!count || count < pricing.minimum) {
    throw new ApiError(400, `Minimum purchase is ${pricing.minimum} leads.`);
  }
  if (count > 500) {
    throw new ApiError(400, "Maximum purchase is 500 leads per order.");
  }

  const amountPaise = count * pricing.perLead * 100;
  const mode = paymentMode();
  if (mode === "unavailable") {
    throw new ApiError(503, "Payments are temporarily unavailable.");
  }

  if (mode === "dummy") {
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

  const payer = payerFromUser(req.userDoc, userType);
  const order = await openCheckout({
    amountPaise,
    customer: payer,
    note: `${count} extra leads`,
  });

  await PlanPayment.create({
    userType,
    user: req.userDoc._id,
    userModel: userType === "company" ? "Company" : "JobSeeker",
    purpose: "extra-leads",
    leadsCount: count,
    orderId: order.id,
    paymentId: order.id,
    amount: amountPaise,
    currency: "INR",
    status: "created",
    dummy: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  res.json(
    new ApiResponse(
      200,
      checkoutPayload(order, {
        amount: amountPaise,
        count,
        description: `${count} extra leads`,
      }),
      "Order created."
    )
  );
}

/**
 * POST /api/plans/extra-leads/verify-payment
 */
export async function verifyExtraLeadsPayment(req, res) {
  const { count, orderId } = req.body;

  const userType = req.user.role;
  const user = req.userDoc;
  const pricing = EXTRA_LEAD_PRICING[userType];

  if (!pricing) throw new ApiError(400, "Extra leads are not available for this account.");
  if (!planIsLive(user)) {
    throw new ApiError(402, "Your plan has expired. Upgrade your plan before buying extra credits.");
  }

  const mode = paymentMode();
  if (mode === "unavailable") {
    throw new ApiError(503, "Payments are temporarily unavailable.");
  }

  let paymentId;
  let leadsCount;
  let alreadyPaid = false;

  if (mode === "dummy") {
    leadsCount = Number(count);
    if (!leadsCount || leadsCount < pricing.minimum) {
      throw new ApiError(400, `Minimum purchase is ${pricing.minimum} leads.`);
    }
    const amountPaise = leadsCount * pricing.perLead * 100;
    const actualOrderId = orderId || `dummy_leads_${Date.now()}`;
    paymentId = `dummy_pay_${Date.now()}`;

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
      dummy: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  } else {
    if (!orderId) throw new ApiError(400, "orderId is required.");
    const record = await PlanPayment.findOne({
      orderId,
      user: user._id,
      purpose: "extra-leads",
    });
    if (!record) throw new ApiError(400, "Payment order was not found.");

    leadsCount = record.leadsCount;
    paymentId = record.paymentId;
    alreadyPaid = !(await claimPaidRecord(record));
  }

  if (alreadyPaid) {
    return res.json(
      new ApiResponse(
        200,
        {
          leadsRemaining: user.leadsRemaining,
          alreadyProcessed: true,
          purpose: "extra-leads",
        },
        "Extra leads already added."
      )
    );
  }

  user.leadsRemaining = (user.leadsRemaining || 0) + leadsCount;
  await user.save();

  await emailPaidInvoice(user, userType, paymentId);

  res.json(
    new ApiResponse(
      200,
      {
        leadsRemaining: user.leadsRemaining,
        paymentId,
        purpose: "extra-leads",
      },
      `${leadsCount} extra leads added.`
    )
  );
}

/**
 * POST /api/plans/confirm { orderId }
 * Confirms a Cashfree checkout. The stored order decides plan vs extra leads.
 */
export async function confirmCheckout(req, res) {
  const { orderId } = req.body || {};
  if (!orderId) throw new ApiError(400, "orderId is required.");

  const record = await PlanPayment.findOne({
    orderId,
    user: req.userDoc._id,
  });
  if (!record) throw new ApiError(404, "Payment order was not found.");

  if (record.purpose === "plan") {
    req.body.planId = record.planId;
    return verifyPlanPayment(req, res);
  }

  req.body.count = record.leadsCount;
  return verifyExtraLeadsPayment(req, res);
}