/**
 * Cashfree Payments (hosted redirect checkout).
 * Orders are created and confirmed on the server. The secret never leaves this process.
 * https://www.cashfree.com/docs/payments/online/web/redirect
 */

const API_VERSION = "2025-01-01";

export function cashfreeConfig() {
  const appId = process.env.CASHFREE_APP_ID || "";
  const secret = process.env.CASHFREE_SECRET_KEY || "";
  const environment =
    String(process.env.CASHFREE_ENV || "sandbox").toLowerCase() === "production"
      ? "production"
      : "sandbox";
  const enabled = Boolean(appId && secret);
  const baseUrl =
    environment === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

  return { appId, secret, environment, enabled, baseUrl };
}

/**
 * live         — Cashfree keys are configured
 * dummy        — local development with Cashfree turned off
 * unavailable  — production, or Cashfree was requested but is not configured
 */
export function paymentMode() {
  const { enabled } = cashfreeConfig();
  if (enabled && process.env.CASHFREE_ENABLED !== "false") return "live";
  if (process.env.NODE_ENV === "production" || process.env.CASHFREE_ENABLED === "true") {
    return "unavailable";
  }
  return "dummy";
}

export function clientOrigin() {
  return String(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
}

/** Cashfree replaces {order_id} when it sends the customer back. */
export function checkoutReturnUrl(pathname) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const join = path.includes("?") ? "&" : "?";
  return `${clientOrigin()}${path}${join}order_id={order_id}`;
}

export function normalizeIndianPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  return ten;
}

async function cashfreeRequest(method, path, body) {
  const { appId, secret, baseUrl, enabled } = cashfreeConfig();
  if (!enabled) {
    const error = new Error("Cashfree is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": appId,
      "x-client-secret": secret,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || "Cashfree request failed.");
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return data;
}

export async function createCashfreeOrder({
  amountRupees,
  customerId,
  customerName,
  customerEmail,
  customerPhone,
  returnUrl,
  note,
}) {
  const data = await cashfreeRequest("POST", "/orders", {
    order_amount: Number(amountRupees),
    order_currency: "INR",
    customer_details: {
      customer_id: customerId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
    },
    order_meta: { return_url: returnUrl },
    order_note: note || "My Profile Live",
  });

  if (!data?.order_id || !data?.payment_session_id) {
    const error = new Error("Cashfree did not return a payment session.");
    error.statusCode = 502;
    throw error;
  }

  return data;
}

export async function fetchCashfreeOrder(orderId) {
  return cashfreeRequest("GET", `/orders/${encodeURIComponent(orderId)}`);
}

export function isPaidOrder(order, expectedPaise) {
  const status = String(order?.order_status || "").toUpperCase();
  const currency = String(order?.order_currency || "").toUpperCase();
  const paidPaise = Math.round(Number(order?.order_amount) * 100);
  return status === "PAID" && currency === "INR" && paidPaise === expectedPaise;
}
