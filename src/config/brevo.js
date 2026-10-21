import * as brevo from "@getbrevo/brevo";

/**
 * Brevo transactional email.
 * Templates: email OTP, password reset code, welcome, password reset link.
 * Env is read at send time so dotenv can load after this module is imported.
 */

const LOGO_URL = "https://myprofilelive.com/email-logo.jpg";
const SUPPORT_EMAIL = "myprofilelive5@gmail.com";

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailLayout({ preheader, title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="height:6px;background:#1e3b8c;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 32px 18px;">
              <img src="${LOGO_URL}" width="240" height="172" alt="My Profile Live" style="display:block;width:240px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="padding:4px 32px 0;font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#334155;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">
              <strong style="color:#1e3b8c;">My Profile Live</strong><br />
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#1e3b8c;text-decoration:none;">${SUPPORT_EMAIL}</a><br />
              This is a service message. Please do not reply to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function codeBlock(code) {
  return `<p style="margin:22px 0;text-align:center;">
    <span style="display:inline-block;background:#f8fafc;border:1px solid #dbe3ef;border-radius:12px;padding:14px 28px;font-size:30px;font-weight:700;letter-spacing:8px;color:#1e3b8c;">${escapeHtml(code)}</span>
  </p>`;
}

/**
 * Sends a branded HTML email through Brevo.
 * @param {{to: string, subject: string, html: string}} params
 */
export async function sendEmail({ to, subject, html, attachments }) {
  const email = new brevo.SendSmtpEmail();
  email.sender = getSender();
  email.to = [{ email: to }];
  email.subject = subject;
  email.htmlContent = html;
  if (attachments?.length) email.attachment = attachments;

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
    html: emailLayout({
      preheader: `Your verification code is ${otp}. It expires in 10 minutes.`,
      title: "Verify your email",
      bodyHtml: `
        <p style="margin:0 0 12px;">Use this code to confirm your email address on My Profile Live.</p>
        ${codeBlock(otp)}
        <p style="margin:0;font-size:13px;color:#64748b;">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
      `,
    }),
  });
}

export async function sendPasswordResetEmail(to, otp) {
  return sendEmail({
    to,
    subject: "Reset your My Profile Live password",
    html: emailLayout({
      preheader: `Your password reset code is ${otp}. It expires in 10 minutes.`,
      title: "Reset your password",
      bodyHtml: `
        <p style="margin:0 0 12px;">Use this code to set a new password for your My Profile Live account.</p>
        ${codeBlock(otp)}
        <p style="margin:0;font-size:13px;color:#64748b;">This code expires in 10 minutes. If you did not request a reset, you can ignore this email. Your password will stay the same.</p>
      `,
    }),
  });
}

export async function sendWelcomeEmail(to, name) {
  const safeName = escapeHtml(name || "there");
  return sendEmail({
    to,
    subject: "Welcome to My Profile Live",
    html: emailLayout({
      preheader: "Your My Profile Live account is ready.",
      title: `Welcome, ${name || "there"}`,
      bodyHtml: `
        <p style="margin:0 0 12px;">Hi ${safeName},</p>
        <p style="margin:0 0 12px;">Your account is ready. A complete profile helps the right company find you faster, and helps a company reach the right executive.</p>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b;">Sign in to My Profile Live to finish your profile and choose a plan.</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">You have agreed to the <a href="https://myprofilelive.com/privacy-policy" style="color:#64748b;text-decoration:underline;">Privacy Policy</a>.</p>
      `,
    }),
  });
}

export async function sendPasswordResetLink(to, name, resetUrl) {
  const safeName = escapeHtml(name || "there");
  const safeUrl = escapeHtml(resetUrl);
  return sendEmail({
    to,
    subject: "Reset your My Profile Live password",
    html: emailLayout({
      preheader: "Reset your My Profile Live password. This link is valid for 30 minutes.",
      title: "Reset your password",
      bodyHtml: `
        <p style="margin:0 0 12px;">Hi ${safeName},</p>
        <p style="margin:0 0 12px;">We received a request to reset your password. Use the button below to choose a new one. This link is valid for <strong>30 minutes</strong>.</p>
        <p style="margin:24px 0;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background:#1e3b8c;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;">Reset password</a>
        </p>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b;">If the button does not open, copy this link into your browser:<br />
          <a href="${safeUrl}" style="color:#1e3b8c;word-break:break-all;">${safeUrl}</a>
        </p>
        <p style="margin:0;font-size:13px;color:#64748b;">If you did not request this, you can ignore this email. Your password will not change.</p>
      `,
    }),
  });
}
