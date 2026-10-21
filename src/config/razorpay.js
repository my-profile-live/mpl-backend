import crypto from "crypto";

/**
 * Razorpay test or live checkout.
 * The key secret stays on the server. The browser only receives the key id.
 * https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
 */

export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  const enabled = Boolean(keyId && secret);
  return { keyId, secret, enabled };
}

/**
 * live         — Razorpay keys are configured
 * dummy        — local development with Razorpay turned off
 * unavailable  — production, or Razorpay was requested but is not configured
 */
export function paymentMode() {
  if (razorpayConfig().enabled && process.env.RAZORPAY_ENABLED !== "false") return "live";
  if (process.env.NODE_ENV === "production" || process.env.RAZORPAY_ENABLED === "true") {
    return "unavailable";
  }
  return "dummy";
}

async function razorpayRequest(method, path, body) {
  const { keyId, secret, enabled } = razorpayConfig();
  if (!enabled) {
    const error = new Error("Razorpay is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.description || "Razorpay request failed.");
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return data;
}

export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const data = await razorpayRequest("POST", "/orders", {
    amount: amountPaise,
    currency: "INR",
    receipt: String(receipt || `mpl${Date.now()}`).slice(0, 40),
    notes: notes || {},
  });

  if (!data?.id) {
    const error = new Error("Razorpay did not return an order.");
    error.statusCode = 502;
    throw error;
  }
  return data;
}

export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const { secret } = razorpayConfig();
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function assertPaid({ orderId, paymentId, signature, expectedPaise }) {
  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    const error = new Error("Payment could not be verified.");
    error.statusCode = 400;
    throw error;
  }

  const payment = await razorpayRequest("GET", `/payments/${encodeURIComponent(paymentId)}`);
  const status = String(payment?.status || "");
  const captured = status === "captured" || status === "authorized";
  if (
    !captured ||
    payment?.order_id !== orderId ||
    String(payment?.currency || "").toUpperCase() !== "INR" ||
    Number(payment?.amount) !== expectedPaise
  ) {
    const error = new Error("Payment was not completed.");
    error.statusCode = 400;
    throw error;
  }
  return payment;
}
