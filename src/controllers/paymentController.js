import {
  createCashfreeOrder,
  fetchCashfreeOrder,
  isPaidOrder,
  paymentMode,
  checkoutReturnUrl,
  normalizeIndianPhone,
  cashfreeConfig,
} from "../config/cashfree.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import SignupPayment from "../models/SignupPayment.js";

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

function customerIdFromPhone(phone) {
  return `mpl${phone}`;
}

/* ─────────────────────── CREATE ORDER ─────────────────────── */

export const createSignupOrder = asyncHandler(async (req, res) => {
  const { userType, customerName, customerEmail, customerPhone } = req.body;

  if (!["company", "jobseeker"].includes(userType)) {
    throw new ApiError(400, "userType must be 'company' or 'jobseeker'.");
  }

  const amountPaise = getSignupFeePaise(userType);
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
        { dummy: true, orderId, amount: amountPaise, currency: "INR" },
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
      customerId: customerIdFromPhone(phone),
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      returnUrl: checkoutReturnUrl("/complete-payment"),
      note: `MPL ${userType} verification`,
    });
  } catch (err) {
    throw new ApiError(err.statusCode || 502, err.message || "Could not start payment.");
  }

  await SignupPayment.create({
    userType,
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
        orderId: order.order_id,
        paymentSessionId: order.payment_session_id,
        environment: cashfreeConfig().environment,
        amount: amountPaise,
        currency: "INR",
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

  const amountPaise = getSignupFeePaise(userType);
  const mode = paymentMode();
  if (mode === "unavailable") {
    throw new ApiError(503, "Payments are temporarily unavailable.");
  }

  if (mode === "dummy") {
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
