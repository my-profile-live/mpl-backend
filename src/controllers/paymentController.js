import {
  cashfreeConfig,
  checkoutReturnUrl,
  createCashfreeOrder,
  fetchCashfreeOrder,
  isPaidOrder,
  normalizeIndianPhone,
  paymentMode,
} from "../config/cashfree.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import SignupPayment from "../models/SignupPayment.js";
import { getPlanById } from "../data/plans.js";

/**
 * Signup verification fee, in paise.
 *
 *   ₹1  = 100   paise
 *   ₹99 = 9900  paise
 *
 * The frontend mirrors this in PaymentStep.jsx.
 */
const SIGNUP_FEE_PAISE = {
  company: 9900,
  jobseeker: 100,
};

function getSignupFeePaise(userType) {
  const amount = SIGNUP_FEE_PAISE[userType];
  if (!amount) {
    throw new ApiError(400, "userType must be 'company' or 'jobseeker'.");
  }
  return amount;
}

/** 1 month uses the verification fee. Longer plans use the catalog price. */
function signupCharge(userType, planId) {
  const id = planId || "1m";
  if (!["1m", "3m", "6m", "12m"].includes(id)) {
    throw new ApiError(400, "Unknown plan.");
  }
  if (id === "1m") {
    return { planId: id, amountPaise: getSignupFeePaise(userType) };
  }
  const plan = getPlanById(userType, id);
  if (!plan?.price) throw new ApiError(400, "Unknown plan.");
  return { planId: id, amountPaise: plan.price * 100 };
}

/* ─────────────────────── CREATE ORDER ─────────────────────── */

export const createSignupOrder = asyncHandler(async (req, res) => {
  const { userType, customerName, customerEmail, customerPhone, planId } = req.body;

  if (!["company", "jobseeker"].includes(userType)) {
    throw new ApiError(400, "userType must be 'company' or 'jobseeker'.");
  }

  const charge = signupCharge(userType, planId);
  const amountPaise = charge.amountPaise;
  const mode = paymentMode();
  if (mode === "unavailable") {
    throw new ApiError(503, "Payments are temporarily unavailable.");
  }

  if (mode === "dummy") {
    const orderId = `dummy_order_${Date.now()}_${Math.random()
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
          planId: charge.planId,
        },
        "Dummy order created."
      )
    );
  }

  const phone = normalizeIndianPhone(customerPhone);
  const email = String(customerEmail || "").trim().toLowerCase();
  const name = String(customerName || "").trim().slice(0, 100);
  if (!phone || !email || !name) {
    throw new ApiError(
      400,
      "Name, email, and a valid 10-digit mobile number are required to pay."
    );
  }

  let order;
  try {
    order = await createCashfreeOrder({
      amountRupees: amountPaise / 100,
      customerId: `mpl${userType}${phone}`.slice(0, 50),
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      returnUrl: checkoutReturnUrl("/complete-payment"),
      note: charge.planId === "1m" ? `${userType} verification` : `${userType} ${charge.planId}`,
    });
  } catch (err) {
    throw new ApiError(err.statusCode || 502, err.message || "Could not start payment.");
  }

  await SignupPayment.create({
    userType,
    planId: charge.planId,
    orderId: order.order_id,
    paymentId: order.order_id,
    amount: amountPaise,
    status: "created",
    dummy: false,
    customerEmail: email,
    customerPhone: phone,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  console.log("[cashfree] signup order created:", order.order_id, `₹${amountPaise / 100}`);

  return res.json(
    new ApiResponse(
      200,
      {
        dummy: false,
        provider: "cashfree",
        orderId: order.order_id,
        paymentSessionId: order.payment_session_id,
        environment: cashfreeConfig().environment,
        amount: amountPaise,
        currency: "INR",
        planId: charge.planId,
      },
      "Order created."
    )
  );
});

/* ─────────────────────── VERIFY PAYMENT ─────────────────────── */

export const verifySignupPayment = asyncHandler(async (req, res) => {
  const { userType, orderId } = req.body;

  if (!["company", "jobseeker"].includes(userType)) {
    throw new ApiError(400, "userType must be 'company' or 'jobseeker'.");
  }
  if (!orderId) {
    throw new ApiError(400, "orderId is required.");
  }

  const mode = paymentMode();
  if (mode === "unavailable") {
    throw new ApiError(503, "Payments are temporarily unavailable.");
  }

  if (mode === "dummy") {
    const charge = signupCharge(userType, req.body.planId);
    const dummyOrderId = orderId || `dummy_order_${Date.now()}`;
    const dummyPaymentId = `dummy_pay_${Date.now()}`;

    await SignupPayment.create({
      userType,
      planId: charge.planId,
      orderId: dummyOrderId,
      paymentId: dummyPaymentId,
      amount: charge.amountPaise,
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

  const record = await SignupPayment.findOne({ orderId, userType });
  if (!record) {
    throw new ApiError(400, "Payment order was not found.");
  }

  if (record.status !== "paid") {
    let remote;
    try {
      remote = await fetchCashfreeOrder(orderId);
    } catch (err) {
      throw new ApiError(err.statusCode || 502, err.message || "Could not confirm payment.");
    }
    if (!isPaidOrder(remote, record.amount)) {
      throw new ApiError(400, "Payment was not completed.");
    }
    record.status = "paid";
    await record.save();
    console.log("[cashfree] signup payment verified:", orderId);
  }

  return res.json(
    new ApiResponse(
      200,
      {
        signupPayment: true,
        paymentId: record.paymentId,
        orderId: record.orderId,
      },
      "Payment verified."
    )
  );
});

/* Finds a Cashfree signup payment that succeeded but was not applied
   because the browser left the confirmation page. */
export const resumeSignupPayment = asyncHandler(async (req, res) => {
  const user = req.userDoc;
  const userType = req.user?.role;
  if (!user || !userType) {
    throw new ApiError(401, "Not authenticated.");
  }
  if (user.paymentDone) {
    return res.json(
      new ApiResponse(200, { alreadyPaid: true }, "Payment already recorded.")
    );
  }

  const email = String(user.email || user.companyEmail || "").trim().toLowerCase();
  const phone = String(user.mobileNumber || "").replace(/\D/g, "").slice(-10);
  const payers = [
    ...(email ? [{ customerEmail: email }] : []),
    ...(phone ? [{ customerPhone: phone }] : []),
  ];
  if (!payers.length) {
    return res.json(new ApiResponse(200, { pending: false }, "No payment to resume."));
  }

  const record = await SignupPayment.findOne({
    userType,
    status: { $in: ["created", "paid"] },
    consumedBy: null,
    expiresAt: { $gt: new Date() },
    $or: payers,
  }).sort({ createdAt: -1 });

  if (!record) {
    return res.json(new ApiResponse(200, { pending: false }, "No payment to resume."));
  }

  if (record.status !== "paid") {
    let remote;
    try {
      remote = await fetchCashfreeOrder(record.orderId);
    } catch {
      return res.json(new ApiResponse(200, { pending: false }, "Payment is not confirmed yet."));
    }
    if (!isPaidOrder(remote, record.amount)) {
      return res.json(new ApiResponse(200, { pending: false }, "Payment was not completed."));
    }
    record.status = "paid";
    record.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await record.save();
  }

  return res.json(
    new ApiResponse(
      200,
      {
        pending: true,
        paymentId: record.paymentId,
        orderId: record.orderId,
      },
      "Payment ready."
    )
  );
});
