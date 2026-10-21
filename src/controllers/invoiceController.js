import mongoose from "mongoose";
import PlanPayment from "../models/PlanPayment.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getPlanById } from "../data/plans.js";
import { sellerProfile } from "../config/seller.js";
import { sendInvoiceEmail } from "../services/invoiceMail.js";

const STATE_CODES = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  orissa: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  gujarat: "24",
  "dadra and nagar haveli and daman and diu": "26",
  maharashtra: "27",
  karnataka: "29",
  goa: "30",
  kerala: "32",
  "tamil nadu": "33",
  puducherry: "34",
  telangana: "36",
  "andhra pradesh": "37",
};

const seqSchema = new mongoose.Schema({ _id: String, seq: Number });
const InvoiceSeq = mongoose.models.InvoiceSeq || mongoose.model("InvoiceSeq", seqSchema);

function rupeesFromPaise(paise) {
  return Math.round(Number(paise) || 0) / 100;
}

function stateCodeFrom(value) {
  const text = String(value || "").trim().toLowerCase();
  if (/^\d{2}$/.test(text)) return text;
  return STATE_CODES[text] || "";
}

function splitTax(amountPaise, sameState) {
  const taxablePaise = Math.round(amountPaise / 1.18);
  const taxPaise = amountPaise - taxablePaise;
  if (sameState) {
    const cgstPaise = Math.floor(taxPaise / 2);
    return {
      taxablePaise,
      cgstPaise,
      sgstPaise: taxPaise - cgstPaise,
      igstPaise: 0,
    };
  }
  return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
}

function lineFor(payment) {
  if (payment.purpose === "extra-leads") {
    const count = payment.leadsCount || 0;
    const noun = payment.userType === "company" ? "lead" : "credit";
    return {
      description: `${count} extra ${noun}${count === 1 ? "" : "s"}`,
      quantity: count || 1,
    };
  }
  const plan = getPlanById(payment.userType, payment.planId);
  const label = plan?.label || "Plan";
  const credits = plan?.leads;
  const unit = payment.userType === "company" ? "leads" : "credits";
  return {
    description: credits
      ? `${label} plan · ${credits} ${unit}`
      : `${label} plan`,
    quantity: 1,
  };
}

async function nextInvoiceNumber(issuedAt) {
  const counter = await InvoiceSeq.findOneAndUpdate(
    { _id: "invoice" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const year = issuedAt.getFullYear();
  return `MPL/${year}/${String(counter.seq).padStart(5, "0")}`;
}

async function ensureInvoiceNumber(payment) {
  if (payment.invoiceNumber) return payment;
  const issuedAt = payment.invoiceIssuedAt || payment.createdAt || new Date();
  const invoiceNumber = await nextInvoiceNumber(issuedAt);
  payment.invoiceNumber = invoiceNumber;
  payment.invoiceIssuedAt = issuedAt;
  await payment.save();
  return payment;
}

function buyerFrom(user, userType) {
  if (userType === "company") {
    return {
      role: "Company",
      name: user.companyName || "Company",
      gstin: user.gstNumber || "",
      pan: user.panNumber || "",
      email: user.companyEmail || "",
      phone: user.mobileNumber || "",
      contact: user.contactPersonName || "",
      address: [user.officeAddress, user.city, user.district, user.state, user.pinCode]
        .filter(Boolean)
        .join(", "),
      state: user.state || "",
      stateCode: stateCodeFrom(user.gstNumber?.slice(0, 2) || user.state),
    };
  }
  return {
    role: "Job seeker",
    name: user.fullName || "Job seeker",
    gstin: "",
    pan: "",
    email: user.email || "",
    phone: user.mobileNumber || "",
    contact: "",
    address: [user.address, user.city, user.district, user.state, user.pinCode]
      .filter(Boolean)
      .join(", "),
    state: user.state || "",
    stateCode: stateCodeFrom(user.state),
  };
}

function presentInvoice(payment, buyer) {
  const seller = sellerProfile();
  const sameState = Boolean(seller.stateCode && buyer.stateCode && seller.stateCode === buyer.stateCode);
  const tax = splitTax(payment.amount, sameState);
  const line = lineFor(payment);
  return {
    id: String(payment._id),
    invoiceNumber: payment.invoiceNumber,
    invoiceDate: payment.invoiceIssuedAt || payment.createdAt,
    orderId: payment.orderId,
    paymentId: payment.paymentId,
    currency: payment.currency || "INR",
    seller,
    buyer,
    placeOfSupply: buyer.state || "India",
    supplyType: sameState ? "Intra-state" : "Inter-state",
    reverseCharge: "No",
    line,
    taxableValue: rupeesFromPaise(tax.taxablePaise),
    cgstRate: sameState ? 9 : 0,
    cgst: rupeesFromPaise(tax.cgstPaise),
    sgstRate: sameState ? 9 : 0,
    sgst: rupeesFromPaise(tax.sgstPaise),
    igstRate: sameState ? 0 : 18,
    igst: rupeesFromPaise(tax.igstPaise),
    total: rupeesFromPaise(payment.amount),
  };
}

/** GET /api/plans/invoice — latest completed payment for this account. */
export async function latestInvoice(req, res) {
  let payment = await PlanPayment.findOne({
    user: req.user.id,
    userType: req.user.role,
    status: "paid",
  }).sort({ createdAt: -1 });

  const user = req.userDoc;
  if (!user) throw new ApiError(404, "Account not found.");

  if (!payment) {
    payment = await invoiceFromAccount(user, req.user.role);
  }
  if (!payment) {
    throw new ApiError(404, "An invoice is available after a completed payment.");
  }

  await ensureInvoiceNumber(payment);
  res.json(new ApiResponse(200, { invoice: presentInvoice(payment, buyerFrom(user, req.user.role)) }));
}

/** GET /api/plans/invoices — every paid invoice on this account. */
export async function listInvoices(req, res) {
  const user = req.userDoc;
  if (!user) throw new ApiError(404, "Account not found.");
  const role = req.user.role;

  await invoiceFromAccount(user, role);
  const payments = await PlanPayment.find({
    user: user._id,
    userType: role,
    status: "paid",
  }).sort({ invoiceIssuedAt: -1, createdAt: -1 });

  for (const payment of payments) {
    await ensureInvoiceNumber(payment);
  }

  const buyer = buyerFrom(user, role);
  res.json(
    new ApiResponse(200, {
      invoices: payments.map((payment) => presentInvoice(payment, buyer)),
    })
  );
}

function accountEmail(user) {
  return String(user.companyEmail || user.email || "").trim();
}

/** Send the tax invoice once. Payment still stands if email delivery fails. */
export async function sendInvoiceForPayment(user, role, payment, options = {}) {
  if (!payment) return { sent: false, reason: "no-payment" };
  await ensureInvoiceNumber(payment);
  if (!options.force && payment.invoiceEmailedAt) {
    return { sent: false, reason: "already-sent", invoiceNumber: payment.invoiceNumber };
  }
  const to = accountEmail(user);
  if (!to) return { sent: false, reason: "no-email" };

  const invoice = presentInvoice(payment, buyerFrom(user, role));
  await sendInvoiceEmail(to, invoice);
  payment.invoiceEmailedAt = new Date();
  await payment.save();
  return { sent: true, invoiceNumber: invoice.invoiceNumber };
}

/** Build the account's signup invoice, if one is due, and email it. */
export async function sendInvoiceForAccount(user, role, options = {}) {
  const payment = await invoiceFromAccount(user, role);
  if (!payment) return { sent: false, reason: "no-payment" };
  return sendInvoiceForPayment(user, role, payment, options);
}

/**
 * A completed plan can live on the account after the checkout row expired.
 * Cashfree is checked when the saved id is one of its order ids.
 */
async function invoiceFromAccount(user, role) {
  if (!user.paymentDone && !user.paymentId) return null;

  const plan = getPlanById(role, user.currentPlan);
  const paidPlan = plan && plan.price > 0 && plan.id !== "1m";
  let amountPaise = paidPlan ? plan.price * 100 : Math.round(Number(user.paymentAmount || 0) * 100);
  let paymentId = user.paymentId || `account-${user._id}`;

  if (user.paymentId && !String(user.paymentId).startsWith("pay_")) {
    try {
      const { fetchCashfreeOrder, isPaidOrder } = await import("../config/cashfree.js");
      const remote = await fetchCashfreeOrder(user.paymentId);
      if (isPaidOrder(remote, Math.round(Number(remote.order_amount) * 100))) {
        amountPaise = Math.round(Number(remote.order_amount) * 100);
        paymentId = remote.order_id || paymentId;
      }
    } catch {
      /* Saved id is not a Cashfree order; the account payment still stands. */
    }
  }

  if (!amountPaise) return null;

  const existing = await PlanPayment.findOne({
    user: user._id,
    userType: role,
    status: "paid",
    paymentId,
  });
  if (existing) return existing;

  return PlanPayment.create({
    userType: role,
    user: user._id,
    userModel: role === "company" ? "Company" : "JobSeeker",
    purpose: "plan",
    planId: paidPlan ? plan.id : user.currentPlan || null,
    orderId: paymentId,
    paymentId,
    amount: amountPaise,
    currency: "INR",
    status: "paid",
    dummy: false,
    expiresAt: new Date("2099-01-01"),
    invoiceIssuedAt: user.paymentAt || new Date(),
  });
}
