/**
 * MSG91 client wrapper for mobile OTP — Widget API.
 *
 * Uses the MSG91 OTP Widget flow:
 *   POST /api/v5/widget/sendOtp     → returns { type: "success", reqId }
 *   POST /api/v5/widget/verifyOtp   → body { reqId, otp } → verifies
 *
 * Env vars required:
 *   MSG91_AUTH_KEY   — widget-scoped Auth Token or account-wide Auth Key
 *   MSG91_WIDGET_ID  — the widget id from the MSG91 dashboard
 *
 * IMPORTANT: env vars are read at call time (via getConfig), not at
 * module load time. ESM imports are hoisted, so if dotenv.config() runs
 * in server.js *after* the import chain reaches this file, destructuring
 * process.env at the top would capture undefined values that never
 * refresh — even after dotenv loads .env.
 */

const MSG91_BASE = "https://control.msg91.com/api/v5/widget";

/**
 * Read env vars lazily at call time.
 * Throws a clear error if not configured.
 */
function getConfig() {
  const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
  const MSG91_WIDGET_ID = process.env.MSG91_WIDGET_ID;

  if (!MSG91_AUTH_KEY) {
    throw new Error("MSG91 is not configured (MSG91_AUTH_KEY missing).");
  }
  if (!MSG91_WIDGET_ID) {
    throw new Error("MSG91 is not configured (MSG91_WIDGET_ID missing).");
  }

  return { MSG91_AUTH_KEY, MSG91_WIDGET_ID };
}

/** Strip + and country code → 10-digit local number MSG91 expects. */
function toLocalIndian(mobile) {
  const digits = String(mobile).replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

/* ─────────────────────────── SEND OTP ─────────────────────────── */

export async function sendMobileOtp(mobile) {
  const { MSG91_AUTH_KEY, MSG91_WIDGET_ID } = getConfig();

  const local = toLocalIndian(mobile);

  const res = await fetch(`${MSG91_BASE}/sendOtp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: MSG91_AUTH_KEY,
    },
    body: JSON.stringify({
      widgetId: MSG91_WIDGET_ID,
      identifier: `91${local}`,
    }),
  });

  const rawText = await res.text();

  let json = {};
  try {
    json = JSON.parse(rawText);
  } catch (_) {
    /* non-JSON response (HTML error page, etc.) */
  }

  if (!res.ok || json?.type === "error") {
    console.error("[msg91] sendOtp failed", res.status);
    throw new Error(`MSG91 send failed (${res.status})`);
  }

  /* Widget API returns the request id under `message`, not `reqId`.
     Classic API returns it under `reqId`. Support both. */
  const reqId = json?.reqId || json?.message;

  if (!reqId || typeof reqId !== "string") {
    console.error("[msg91] sendOtp missing request id", res.status);
    throw new Error("MSG91 did not return a request id.");
  }

  return reqId;
}

/* ────────────────────────── VERIFY OTP ────────────────────────── */

export async function checkMobileOtp(reqId, code) {
  const { MSG91_AUTH_KEY, MSG91_WIDGET_ID } = getConfig();

  if (!reqId) return false;

  const res = await fetch(`${MSG91_BASE}/verifyOtp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: MSG91_AUTH_KEY,
    },
    body: JSON.stringify({
      widgetId: MSG91_WIDGET_ID,
      reqId,
      otp: String(code),
    }),
  });

  const rawText = await res.text();

  let json = {};
  try {
    json = JSON.parse(rawText);
  } catch (_) { }

  return res.ok && json?.type === "success";
}

/* ────────────────────────── E164 HELPER ────────────────────────── */

/** Prefixes a 10-digit Indian mobile number with +91 if no country code is present. */
export function toE164(mobile) {
  const digits = String(mobile).replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (String(mobile).startsWith("+")) return mobile;
  return `+${digits}`;
}