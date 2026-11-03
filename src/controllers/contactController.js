import { z } from "zod";
import { emailLayout, sendEmail } from "../config/brevo.js";

const ADMIN_EMAIL = "info@myprofilelive.com";

const enquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email").max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  role: z.enum(["jobseeker", "company"]),
  city: z.string().trim().max(60).optional().default(""),
  companyName: z.string().trim().max(120).optional().default(""),
  message: z.string().trim().min(20, "Write at least 20 characters so the office can help").max(2000),
  website: z.string().optional().default(""),
});

function siteOrigin() {
  const raw = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://myprofilelive.com";
  return raw.split(",")[0].trim().replace(/\/$/, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function field(label, value) {
  return `<p style="margin:0 0 8px;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
}

export async function submitEnquiry(req, res) {
  const parsed = enquirySchema.safeParse(req.body || {});
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Check the form and try again.";
    return res.status(400).json({ success: false, message });
  }

  const data = parsed.data;
  if (data.website) {
    return res.json({ success: true, message: "Message received." });
  }

  const origin = siteOrigin();
  const roleLabel = data.role === "company" ? "Company" : "Job seeker";
  const safe = {
    name: data.name,
    email: data.email,
    phone: data.phone,
    city: data.city || "Not shared",
    companyName: data.companyName || "Not shared",
    message: data.message,
  };

  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      replyTo: { email: safe.email, name: safe.name },
      subject: `Website enquiry from ${safe.name}`,
      html: emailLayout({
        preheader: `${roleLabel} enquiry from ${safe.name}`,
        title: "New website enquiry",
        footerNote: "Reply to this email to write back to the person who submitted the form.",
        bodyHtml: `
          ${field("Name", safe.name)}
          ${field("Role", roleLabel)}
          ${field("Email", safe.email)}
          ${field("Mobile", safe.phone)}
          ${field("City", safe.city)}
          ${field("Company", safe.companyName)}
          <p style="margin:16px 0 8px;"><strong>Message</strong></p>
          <p style="margin:0;white-space:pre-wrap;">${escapeHtml(safe.message)}</p>
        `,
      }),
    });
  } catch (err) {
    console.error("[contact] admin mail failed:", err?.message || err);
    return res.status(503).json({
      success: false,
      message: "The message could not be sent just now. Call +91 7600688820 or email info@myprofilelive.com.",
    });
  }

  try {
    await sendEmail({
      to: safe.email,
      subject: "We received your message",
      html: emailLayout({
        preheader: "We have your message about My Profile Live.",
        title: "We received your message",
        footerNote: "Replies come from info@myprofilelive.com. You can also call +91 7600688820.",
        bodyHtml: `
          <p style="margin:0 0 12px;">Hello ${escapeHtml(safe.name)},</p>
          <p style="margin:0 0 12px;">NILKANTH ENTERPRISE has your message about My Profile Live. We will write back to this email address.</p>
          <p style="margin:0 0 12px;">If you are ready to start, register on the site. A job seeker trial is ₹1 including GST. A company trial is ₹99 including GST. Both run for 3 months.</p>
          <p style="margin:0;">
            <a href="${origin}/signup/jobseeker">Register as a job seeker</a><br />
            <a href="${origin}/signup/company">Register as a company</a>
          </p>
        `,
      }),
    });
  } catch (err) {
    console.error("[contact] reply mail failed:", err?.message || err);
  }

  return res.json({
    success: true,
    message: "Message received. A confirmation is on its way to your email.",
  });
}
