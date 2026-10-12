import * as brevo from "@getbrevo/brevo";

/**
 * Brevo (formerly Sendinblue) transactional email wrapper.
 * Used for: email OTP verification, welcome emails, password reset.
 * https://developers.brevo.com/docs/send-a-transactional-email
 *
 * NOTE: env vars are read lazily at call time (not at module load time).
 * ESM imports are hoisted, so if dotenv.config() runs after the import
 * chain reaches this file, process.env would still be empty and the
 * SDK would authenticate with `undefined` → 401.
 */

let _apiInstance = null;

function getApiInstance() {
  if (_apiInstance) return _apiInstance;

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("Brevo is not configured (BREVO_API_KEY missing).");
  }

  const instance = new brevo.TransactionalEmailsApi();
  instance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
  _apiInstance = instance;
  return _apiInstance;
}

function getSender() {
  const email = process.env.BREVO_SENDER_EMAIL;
  const name = process.env.BREVO_SENDER_NAME || "My Profile Live";

  if (!email) {
    throw new Error("Brevo is not configured (BREVO_SENDER_EMAIL missing).");
  }

  return { email, name };
}

/**
 * Sends a simple HTML transactional email through Brevo.
 * @param {{to: string, subject: string, html: string}} params
 */
export async function sendEmail({ to, subject, html }) {
  const email = new brevo.SendSmtpEmail();
  email.sender = getSender();
  email.to = [{ email: to }];
  email.subject = subject;
  email.htmlContent = html;

  try {
    return await getApiInstance().sendTransacEmail(email);
  } catch (err) {
    console.error("[brevo] sendTransacEmail failed:", {
      status: err?.response?.statusCode,
      body: err?.response?.body,
      message: err.message,
    });
    throw err;
  }
}

export async function sendEmailOtp(to, otp) {
  return sendEmail({
    to,
    subject: "Your My Profile Live verification code",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#1e3b8c">My Profile Live</h2>
        <p>Your email verification code is:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#1e3b8c">${otp}</p>
        <p style="color:#64748b;font-size:13px">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>`,
  });
}

export async function sendPasswordResetEmail(to, otp) {
  return sendEmail({
    to,
    subject: "Reset your My Profile Live password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#1e3b8c">Reset your password</h2>
        <p>Use the code below to reset your password:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#1e3b8c">${otp}</p>
        <p style="color:#64748b;font-size:13px">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>`,
  });
}

export async function sendWelcomeEmail(to, name) {
  return sendEmail({
    to,
    subject: "Welcome to My Profile Live",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#1e3b8c">Welcome, ${name}!</h2>
        <p>Your profile is live. Complete it fully to get discovered faster.</p>
      </div>`,
  });
}


// config/brevo.js  — ADD this function
export async function sendPasswordResetLink(to, name, resetUrl) {
  return sendEmail({
    to,
    subject: "Reset your My Profile Live password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
        <h2 style="color:#1e3b8c;margin-bottom:8px">Reset your password</h2>
        <p>Hi ${name || "there"},</p>
        <p>We received a request to reset your password. Click the button below to set a new one. This link is valid for <strong>30 minutes</strong>.</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${resetUrl}"
             style="display:inline-block;background:#1e3b8c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Reset Password
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">
          If the button doesn't work, copy this URL into your browser:<br/>
          <a href="${resetUrl}" style="color:#1e3b8c;word-break:break-all">${resetUrl}</a>
        </p>
        <p style="color:#64748b;font-size:13px">
          Didn't request this? You can safely ignore this email — your password won't change.
        </p>
      </div>
    `,
  });
}