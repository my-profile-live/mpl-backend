import bcrypt from "bcryptjs";
import Affiliate from "../models/Affiliate.js";
import AffiliateAttribution from "../models/AffiliateAttribution.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { signToken } from "../utils/jwt.js";
import { couponIsOpen } from "../utils/couponPricing.js";

export async function publicLink(req, res) {
  const code = String(req.params.code || "").trim().toLowerCase();
  const affiliate = await Affiliate.findOne({ shortCode: code }).populate("coupon");
  if (!affiliate) throw new ApiError(404, "This link is not active.");
  const coupon = affiliate.linkType !== "referral" && affiliate.coupon && couponIsOpen(affiliate.coupon)
    ? affiliate.coupon
    : null;
  res.json(new ApiResponse(200, {
    shortCode: affiliate.shortCode,
    couponCode: coupon?.code || null,
    discountPercent: coupon?.discountPercent || 0,
    appliesTo: coupon?.appliesTo || "both",
  }, "Link ready."));
}

export async function login(req, res) {
  const loginId = String(req.body.loginId || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const agent = await Affiliate.findOne({ loginId }).select("+passwordHash");
  if (!agent || !(await bcrypt.compare(password, agent.passwordHash))) {
    throw new ApiError(401, "Invalid agent login.");
  }
  const token = signToken({ id: agent._id.toString(), role: "agent" });
  res.json(new ApiResponse(200, {
    token,
    userType: "agent",
    profile: {
      id: agent._id,
      username: agent.username,
      loginId: agent.loginId,
      linkType: agent.linkType,
      shortCode: agent.shortCode,
      discountPercent: agent.discountPercent,
      commissionPercent: agent.commissionPercent,
    },
  }, "Agent login successful."));
}

function saleInRange(createdAt, query) {
  const time = new Date(createdAt).getTime();
  if (query.from && time < new Date(query.from).getTime()) return false;
  if (query.to) {
    const end = new Date(query.to);
    end.setHours(23, 59, 59, 999);
    if (time > end.getTime()) return false;
  }
  return true;
}

export async function dashboard(req, res) {
  const agent = await Affiliate.findById(req.userDoc._id).populate("coupon");
  const all = await AffiliateAttribution.find({ affiliate: agent._id }).sort({ createdAt: -1 }).lean();
  const rows = all.filter((row) => {
    if (!saleInRange(row.createdAt, req.query)) return false;
    if ((req.query.userType === "company" || req.query.userType === "jobseeker") && row.userType !== req.query.userType) return false;
    if (req.query.coupon && String(row.couponCode || "").toUpperCase() !== String(req.query.coupon).trim().toUpperCase()) return false;
    return true;
  });
  const paid = rows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
  const commission = agent.linkType === "coupon_commission";
  const earned = commission ? Math.round(paid * Number(agent.commissionPercent || 0)) / 100 : null;
  const byType = ["company", "jobseeker"].map((type) => ({
    label: type === "company" ? "Company" : "Job seeker",
    value: rows.filter((row) => row.userType === type).length,
  })).filter((row) => row.value > 0);
  const couponMap = new Map();
  rows.forEach((row) => {
    const label = row.couponCode || "No coupon";
    couponMap.set(label, (couponMap.get(label) || 0) + 1);
  });
  const linked = agent.coupon && typeof agent.coupon === "object" ? agent.coupon : null;
  res.json(new ApiResponse(200, {
    link: agent.shortCode,
    linkType: agent.linkType,
    discountPercent: linked?.discountPercent || 0,
    commissionPercent: commission ? agent.commissionPercent : null,
    coupons: linked ? [{
      code: linked.code,
      discountPercent: linked.discountPercent || 0,
      commissionPercent: commission ? agent.commissionPercent : null,
      appliesTo: linked.appliesTo,
      usage: linked.usage === "repeat" ? "repeat" : "once",
      active: linked.active !== false,
    }] : [],
    conversions: rows.length,
    couponUses: rows.filter((row) => row.couponCode).length,
    linkUsers: rows.length,
    paid,
    earned,
    byType,
    byCoupon: [...couponMap.entries()].map(([label, value]) => ({ label, value })),
    results: rows.map((row) => ({
      name: row.name,
      email: row.email,
      userType: row.userType,
      amountPaid: row.amountPaid,
      couponCode: row.couponCode,
      createdAt: row.createdAt,
      earned: commission ? Math.round(Number(row.amountPaid || 0) * Number(agent.commissionPercent || 0)) / 100 : null,
    })),
  }));
}
