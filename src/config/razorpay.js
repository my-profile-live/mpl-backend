import Razorpay from "razorpay";

/**
 * Razorpay client.
 *
 * IMPORTANT: env vars are read lazily (inside getRazorpay() and
 * isRazorpayEnabled()) instead of at module load. ESM imports are
 * hoisted, so if dotenv.config() runs in server.js *after* the import
 * chain reaches this file, destructuring process.env at the top would
 * capture undefined values that never refresh — even after dotenv
 * loads .env. Same bug we fixed in msg91.js and brevo.js.
 *
 * Behaviour:
 *   RAZORPAY_ENABLED !== "true"  → dummy mode (no real Razorpay calls)
 *   RAZORPAY_ENABLED === "true"  → real Razorpay SDK client
 */

let _client = null;

function readConfig() {
  const enabled = process.env.RAZORPAY_ENABLED === "true";
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return { enabled, keyId, keySecret };
}

/**
 * Returns the Razorpay SDK client if enabled and configured,
 * else null (callers should fall back to dummy mode).
 */
export function getRazorpay() {
  if (_client) return _client;

  const { enabled, keyId, keySecret } = readConfig();
  if (!enabled) return null;

  if (!keyId || !keySecret) {
    console.warn(
      "[razorpay] RAZORPAY_ENABLED=true but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing. Falling back to dummy mode."
    );
    return null;
  }

  _client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  console.log("[razorpay] client initialised (key:", keyId.slice(0, 12) + "...)");
  return _client;
}

export function isRazorpayEnabled() {
  return !!getRazorpay();
}

/**
 * Backwards-compatible `razorpay` export. Using a getter means any
 * existing `import { razorpay } from "./razorpay.js"` still works —
 * it just resolves through getRazorpay() on first access.
 */
export const razorpay = new Proxy(
  {},
  {
    get(_t, prop) {
      const client = getRazorpay();
      if (!client) return undefined;
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
);