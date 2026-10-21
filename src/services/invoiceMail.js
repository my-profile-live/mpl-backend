import { emailLayout, sendEmail } from "../config/brevo.js";
import { renderInvoicePdf } from "./invoicePdf.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fileName(invoice) {
  const number = String(invoice.invoiceNumber || "invoice").replace(/[^\w.-]+/g, "-");
  return `${number}.pdf`;
}

/** Branded payment email with the tax invoice attached as a PDF. */
export async function sendInvoiceEmail(to, invoice) {
  const pdf = await renderInvoicePdf(invoice);
  const buyerName = invoice.buyer?.contact || invoice.buyer?.name || "there";
  const safeName = escapeHtml(buyerName);
  const number = escapeHtml(invoice.invoiceNumber);
  const total = escapeHtml(money(invoice.total));
  const issued = escapeHtml(formatDateTime(invoice.invoiceDate));

  return sendEmail({
    to,
    subject: `Invoice ${invoice.invoiceNumber} · My Profile Live`,
    html: emailLayout({
      preheader: `Your invoice ${invoice.invoiceNumber} is attached.`,
      title: "Your invoice is ready",
      bodyHtml: `
        <p style="margin:0 0 12px;">Hi ${safeName},</p>
        <p style="margin:0 0 12px;">Thank you for your payment. Your tax invoice <strong>${number}</strong> for <strong>${total}</strong> is attached to this email.</p>
        <p style="margin:0 0 12px;">Issued on ${issued}. The PDF is the same invoice you can download from Plans &amp; Pricing.</p>
        <p style="margin:0;font-size:13px;color:#64748b;">Powered by NILKANTH ENTERPRISE</p>
      `,
    }),
    attachments: [
      {
        name: fileName(invoice),
        content: pdf.toString("base64"),
      },
    ],
  });
}
