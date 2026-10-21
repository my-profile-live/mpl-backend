import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

const execFileAsync = promisify(execFile);

const LOGO_CANDIDATES = [
  "/var/www/MPL-FRONTEND/public/brand-logo.jpg",
  "/var/www/MPL-FRONTEND/dist/brand-logo.jpg",
  "d:/MPL/MPL-FRONTEND/public/brand-logo.jpg",
];

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

function row(label, value) {
  if (!value) return "";
  return `<p><span>${escapeHtml(label)}</span> ${escapeHtml(value)}</p>`;
}

async function logoSrc() {
  for (const path of LOGO_CANDIDATES) {
    try {
      const bytes = await readFile(path);
      return `data:image/jpeg;base64,${bytes.toString("base64")}`;
    } catch {
      /* Try the next copy of the logo. */
    }
  }
  return "https://myprofilelive.com/brand-logo.jpg";
}

function invoiceDocument(invoice, logo) {
  const seller = invoice.seller || {};
  const buyer = invoice.buyer || {};
  const taxRows = [
    invoice.cgst
      ? `<tr><td>CGST @ ${invoice.cgstRate}%</td><td class="right">${money(invoice.cgst)}</td></tr>`
      : "",
    invoice.sgst
      ? `<tr><td>SGST @ ${invoice.sgstRate}%</td><td class="right">${money(invoice.sgst)}</td></tr>`
      : "",
    invoice.igst
      ? `<tr><td>IGST @ ${invoice.igstRate}%</td><td class="right">${money(invoice.igst)}</td></tr>`
      : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.invoiceNumber || "Invoice")}</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .invoice-host, .invoice-host * { box-sizing: border-box; }
    .invoice-host { width: 794px; margin: 0; background: white; color: #0f172a; font-family: Inter, Arial, sans-serif; }
    .sheet { width: 794px; margin: 0; background: white; }
    .top { display: flex; justify-content: space-between; gap: 24px; padding: 28px 32px 20px; border-bottom: 4px solid #1e3b8c; }
    .logo { width: 210px; height: auto; }
    .tag { margin: 6px 0 0; color: #64748b; font-size: 12px; }
    .badge { text-align: right; }
    .badge h1 { margin: 0; color: #1e3b8c; font-size: 28px; letter-spacing: 0.04em; }
    .badge p { margin: 4px 0 0; font-size: 13px; color: #334155; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 22px 32px; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
    .card h2 { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #1e3b8c; }
    .card p { margin: 3px 0; font-size: 13px; line-height: 1.45; }
    .card span { color: #64748b; }
    table { width: calc(100% - 64px); margin: 0 32px 8px; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: white; background: #1e3b8c; padding: 10px 12px; }
    td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .right { text-align: right; }
    .totals { width: 280px; margin: 8px 32px 24px auto; }
    .totals td { border: 0; padding: 5px 0; font-size: 14px; }
    .totals tr:last-child td { border-top: 2px solid #1e3b8c; font-weight: 700; font-size: 16px; color: #1e3b8c; padding-top: 8px; }
    .foot { padding: 0 32px 28px; color: #64748b; font-size: 12px; line-height: 1.5; }
    .green { color: #047857; font-weight: 600; }
  </style>
</head>
<body>
  <div class="invoice-host">
    <div class="sheet">
      <div class="top">
        <div>
          <img class="logo" src="${logo}" alt="My Profile Live" />
          <p class="tag">${escapeHtml(seller.tagline || "")}</p>
        </div>
        <div class="badge">
          <h1>TAX INVOICE</h1>
          <p>${escapeHtml(invoice.invoiceNumber)}</p>
          <p>${escapeHtml(formatDateTime(invoice.invoiceDate))}</p>
        </div>
      </div>
      <div class="grid">
        <div class="card">
          <h2>Supplier</h2>
          <p><strong>${escapeHtml(seller.legalName)}</strong></p>
          ${row("Trade name:", seller.tradeName)}
          ${row("GSTIN:", seller.gstin)}
          ${row("PAN:", seller.pan)}
          ${row("Address:", seller.address)}
          ${row("Phone:", seller.phone)}
          ${row("Email:", seller.email)}
        </div>
        <div class="card">
          <h2>Bill to · ${escapeHtml(buyer.role)}</h2>
          <p><strong>${escapeHtml(buyer.name)}</strong></p>
          ${row("GSTIN:", buyer.gstin)}
          ${row("PAN:", buyer.pan)}
          ${row("Contact:", buyer.contact)}
          ${row("Address:", buyer.address)}
          ${row("Email:", buyer.email)}
          ${row("Phone:", buyer.phone)}
          ${row("Place of supply:", invoice.placeOfSupply)}
          ${row("Supply:", invoice.supplyType)}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>SAC</th>
            <th class="right">Taxable value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(invoice.line?.description || "My Profile Live plan")}<br><span style="color:#64748b;font-size:12px">${escapeHtml(seller.sacLabel || "")}</span></td>
            <td>${escapeHtml(seller.sac || "")}</td>
            <td class="right">${money(invoice.taxableValue)}</td>
          </tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Taxable value</td><td class="right">${money(invoice.taxableValue)}</td></tr>
        ${taxRows}
        <tr><td>Total paid</td><td class="right">${money(invoice.total)}</td></tr>
      </table>
      <div class="foot">
        <p class="green">Amount received. Reverse charge: ${escapeHtml(invoice.reverseCharge || "No")}.</p>
        <p>Payment reference ${escapeHtml(invoice.paymentId)}. Prices include GST at 18%. This invoice is issued by ${escapeHtml(seller.tradeName)} for the ${escapeHtml((buyer.role || "account").toLowerCase())} named above.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function chromePath() {
  return process.env.MPL_CHROME_PATH || "/usr/bin/google-chrome-stable";
}

/** Render the same invoice sheet used for Download Invoice. */
export async function renderInvoicePdf(invoice) {
  const logo = await logoSrc();
  const html = invoiceDocument(invoice, logo);
  const dir = await mkdtemp(join(tmpdir(), "mpl-inv-"));
  const htmlPath = join(dir, "invoice.html");
  const pdfPath = join(dir, "invoice.pdf");
  await writeFile(htmlPath, html);
  try {
    await execFileAsync(chromePath(), [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ], { timeout: 30000 });
    const pdf = await readFile(pdfPath);
    if (!pdf.slice(0, 5).toString("ascii").startsWith("%PDF")) {
      throw new Error("Invoice PDF was not created.");
    }
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
