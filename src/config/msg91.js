/**
 * MSG91 mobile OTP.
 *
 * Live SMS uses the OTP API with the approved template, sender, and DLT id.
 * The widget API remains only for a verification that was already sent that way.
 *
 * Env vars are read at call time. A value captured at import would stay empty
 * if dotenv loads after this module is first imported.
 */

const WIDGET_BASE = "https://control.msg91.com/api/v5/widget";
const OTP_BASE = "https://control.msg91.com/api/v5/otp";

/**
 * Read env vars lazily at call time.
 * Throws a clear error if not configured.
 */
function getConfig() {
  const authKey = process.env.MSG91_AUTH_KEY;
  const widgetId = process.env.MSG91_WIDGET_ID || "";
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID || "";
  const senderId = process.env.MSG91_SENDER_ID || "";
  const dltTemplateId = process.env.MSG91_DLT_TEMPLATE_ID || "";

  if (!authKey) {
    throw new Error("MSG91 is not configured (MSG91_AUTH_KEY missing).");
  }
  if (!templateId && !widgetId) {
    throw new Error("MSG91 is not configured (template or widget id missing).");
  }

  return { authKey, widgetId, templateId, senderId, dltTemplateId };
}

function usesSmsTemplate(config) {
  return Boolean(config.templateId);
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
  const config = getConfig();
  const local = toLocalIndian(mobile);
  const fullMobile = `91${local}`;

  if (usesSmsTemplate(config)) {
    const params = new URLSearchParams({
      template_id: config.templateId,
      mobile: fullMobile,
      otp_length: "4",
      otp_expiry: "10",
      realTimeResponse: "1",
    });
    if (config.senderId) params.set("sender", config.senderId);
    if (config.dltTemplateId) params.set("DLT_TE_ID", config.dltTemplateId);

    const res = await fetch(`${OTP_BASE}?${params}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: config.authKey,
      },
      body: "{}",
    });
    const json = await readJson(res);
    if (!res.ok || json?.type === "error") {
      console.error("[msg91] sendOtp failed", res.status, json?.type || "");
      throw new Error(`MSG91 send failed (${res.status})`);
    }
    return fullMobile;
  }

  const res = await fetch(`${WIDGET_BASE}/sendOtp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: config.authKey,
    },
    body: JSON.stringify({
      widgetId: config.widgetId,
      identifier: fullMobile,
    }),
  });

  const json = await readJson(res);

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

async function readJson(res) {
  const rawText = await res.text();
  try {
    return JSON.parse(rawText);
  } catch {
    return {};
  }
}

export async function checkMobileOtp(reqId, code) {
  const config = getConfig();

  if (!reqId) return false;

  if (/^91\d{10}$/.test(String(reqId))) {
    const params = new URLSearchParams({
      mobile: String(reqId),
      otp: String(code),
    });
    const res = await fetch(`${OTP_BASE}/verify?${params}`, {
      method: "GET",
      headers: { authkey: config.authKey },
    });
    const json = await readJson(res);
    return res.ok && json?.type === "success";
  }

  const res = await fetch(`${WIDGET_BASE}/verifyOtp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: config.authKey,
    },
    body: JSON.stringify({
      widgetId: config.widgetId,
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