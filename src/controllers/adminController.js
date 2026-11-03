import bcrypt from "bcryptjs";
import AdminUser from "../models/AdminUser.js";
import Affiliate from "../models/Affiliate.js";
import Coupon from "../models/Coupon.js";
import CouponUse from "../models/CouponUse.js";
import AffiliateAttribution from "../models/AffiliateAttribution.js";
import Company from "../models/Company.js";
import JobSeeker from "../models/JobSeeker.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { signToken } from "../utils/jwt.js";
import { emailLayout, sendEmail } from "../config/brevo.js";

const HIDDEN = "-passwordHash";

function csvEscape(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function percentInRange(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 100;
}

function sendCsv(res, filename, rows) {
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`\uFEFF${body}`);
}

export async function login(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const admin = await AdminUser.findOne({ email }).select("+passwordHash");
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    throw new ApiError(401, "Invalid admin login.");
  }
  const token = signToken({ id: admin._id.toString(), role: "admin" });
  res.json(new ApiResponse(200, {
    token,
    userType: "admin",
    profile: { id: admin._id, name: admin.name, email: admin.email },
  }, "Admin login successful."));
}

const PAGE_SIZES = [10, 20, 50, 100];

function clean(value) {
  return String(value || "").trim().slice(0, 80);
}

function directoryFilter(query, company) {
  const filter = {};
  const state = clean(query.state);
  const city = clean(query.city);
  const area = clean(query.area);
  const industry = clean(query.industry);
  const plan = clean(query.plan);
  const title = clean(query.title);
  if (state) filter.state = state;
  if (city) filter.city = city;
  if (area) filter.district = area;
  if (plan) filter.currentPlan = plan;
  if (industry) filter[company ? "industry" : "preferredIndustry"] = industry;
  if (!company && title) filter.currentJobTitle = title;
  return filter;
}

function namedCounts(rows) {
  return (rows || [])
    .map((row) => ({ label: String(row._id || "").trim() || "Not set", value: row.value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function choiceList(rows) {
  return [...new Set((rows || []).map((row) => String(row._id || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

async function loadDirectory(Model, query, company) {
  const filter = directoryFilter(query, company);
  const limit = PAGE_SIZES.includes(Number(query.limit)) ? Number(query.limit) : 10;
  const requested = Math.max(parseInt(query.page, 10) || 1, 1);
  const industryField = company ? "$industry" : "$preferredIndustry";
  const optionMatch = { ...filter };
  delete optionMatch.state;
  delete optionMatch.city;
  delete optionMatch.district;
  const cityMatch = { ...optionMatch };
  if (filter.state) cityMatch.state = filter.state;
  const areaMatch = { ...cityMatch };
  if (filter.city) areaMatch.city = filter.city;

  const total = await Model.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requested, pages);

  const [results, chartDoc, collectedDoc, optionDoc] = await Promise.all([
    Model.find(filter).select(HIDDEN).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Model.aggregate([
      { $match: filter },
      {
        $facet: {
          states: [{ $group: { _id: { $ifNull: ["$state", ""] }, value: { $sum: 1 } } }],
          industries: [{ $group: { _id: { $ifNull: [industryField, ""] }, value: { $sum: 1 } } }],
          plans: [{ $group: { _id: { $ifNull: ["$currentPlan", ""] }, value: { $sum: 1 } } }],
        },
      },
    ]),
    Model.aggregate([
      { $match: { ...filter, paymentDone: true } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$paymentAmount", 0] } } } },
    ]),
    Model.aggregate([
      {
        $facet: {
          states: [{ $match: optionMatch }, { $group: { _id: "$state" } }],
          cities: [{ $match: cityMatch }, { $group: { _id: "$city" } }],
          areas: [{ $match: areaMatch }, { $group: { _id: "$district" } }],
          industries: [{ $match: optionMatch }, { $group: { _id: industryField } }],
          plans: [{ $match: optionMatch }, { $group: { _id: "$currentPlan" } }],
          ...(company ? {} : { titles: [{ $match: optionMatch }, { $group: { _id: "$currentJobTitle" } }] }),
        },
      },
    ]),
  ]);

  const charts = chartDoc[0] || {};
  const options = optionDoc[0] || {};
  return {
    results,
    page,
    limit,
    total,
    pages,
    collected: collectedDoc[0]?.total || 0,
    charts: {
      states: namedCounts(charts.states),
      industries: namedCounts(charts.industries),
      plans: namedCounts(charts.plans),
    },
    options: {
      states: choiceList(options.states),
      cities: choiceList(options.cities),
      areas: choiceList(options.areas),
      industries: choiceList(options.industries),
      plans: choiceList(options.plans),
      titles: choiceList(options.titles),
    },
  };
}

export async function companies(req, res) {
  const data = await loadDirectory(Company, req.query, true);
  res.json(new ApiResponse(200, data));
}

export async function exportCompanies(req, res) {
  const rows = await Company.find(directoryFilter(req.query, true)).select(HIDDEN).sort({ createdAt: -1 }).lean();
  sendCsv(res, "companies.csv", [
    ["Name", "Email", "Mobile", "Contact", "Designation", "Type", "Industry", "State", "City", "Area", "PIN", "Address", "PAN", "GST", "Website", "Employees", "Plan", "Leads", "Status", "Paid", "Amount", "Created"],
    ...rows.map((row) => [
      row.companyName, row.companyEmail, row.mobileNumber, row.contactPersonName, row.designation,
      row.companyType, row.industry, row.state, row.city, row.district, row.pinCode, row.officeAddress,
      row.panNumber, row.gstNumber, row.website, row.numberOfEmployees, row.currentPlan, row.leadsRemaining,
      row.status, row.paymentDone, row.paymentAmount, row.createdAt,
    ]),
  ]);
}

export async function jobSeekers(req, res) {
  const data = await loadDirectory(JobSeeker, req.query, false);
  res.json(new ApiResponse(200, data));
}

export async function exportJobSeekers(req, res) {
  const rows = await JobSeeker.find(directoryFilter(req.query, false)).select(HIDDEN).sort({ createdAt: -1 }).lean();
  sendCsv(res, "job-seekers.csv", [
    ["Name", "Email", "Mobile", "Title", "Company", "Skills", "Experience", "Industry", "State", "City", "Area", "Notice", "Expected salary", "Work mode", "Plan", "Credits", "Paid", "Amount", "Created"],
    ...rows.map((row) => [
      row.fullName, row.email, row.mobileNumber, row.currentJobTitle, row.currentCompany,
      (row.skills || []).join("; "), row.totalExperience, row.preferredIndustry, row.state, row.city, row.district,
      row.noticePeriod, row.expectedSalary, row.wfh, row.currentPlan, row.leadsRemaining,
      row.paymentDone, row.paymentAmount, row.createdAt,
    ]),
  ]);
}

export async function listCoupons(_req, res) {
  const coupons = await Coupon.find().populate("affiliate", "username shortCode").sort({ createdAt: -1 }).lean();
  const uses = await CouponUse.aggregate([
    { $group: { _id: "$coupon", uses: { $sum: 1 }, paid: { $sum: "$amountPaid" } } },
  ]);
  const byId = new Map(uses.map((row) => [String(row._id), row]));
  res.json(new ApiResponse(200, {
    results: coupons.map((coupon) => ({
      ...coupon,
      agent: coupon.affiliate?.username || "",
      agentId: coupon.affiliate?._id || "",
      uses: byId.get(String(coupon._id))?.uses || 0,
      paid: byId.get(String(coupon._id))?.paid || 0,
    })),
  }));
}

async function assignCouponAgent(coupon, affiliateId) {
  const nextId = affiliateId ? String(affiliateId) : "";
  if (nextId) {
    const agent = await Affiliate.findById(nextId);
    if (!agent) throw new ApiError(400, "Choose an agent from the list.");
    if (agent.coupon && String(agent.coupon) !== String(coupon._id)) {
      await Coupon.updateOne({ _id: agent.coupon }, { $set: { affiliate: null } });
    }
    agent.coupon = coupon._id;
    await agent.save();
  }
  if (coupon.affiliate && String(coupon.affiliate) !== nextId) {
    await Affiliate.updateOne({ _id: coupon.affiliate, coupon: coupon._id }, { $set: { coupon: null } });
  }
  coupon.affiliate = nextId || null;
}

export async function createCoupon(req, res) {
  const code = String(req.body.code || "").trim().toUpperCase();
  const tag = String(req.body.tag || "").trim();
  const discountPercent = Number(req.body.discountPercent);
  if (!code || !tag || !(discountPercent > 0) || discountPercent > 100) {
    throw new ApiError(400, "Code, tag, and a discount from 1 to 100 are required.");
  }
  const coupon = await Coupon.create({
    code,
    tag,
    discountPercent,
    appliesTo: req.body.appliesTo || "both",
    usage: req.body.usage === "repeat" ? "repeat" : "once",
    startsAt: req.body.startsAt || null,
    endsAt: req.body.noExpiry ? null : req.body.endsAt || null,
    active: true,
  });
  if (req.body.affiliate) await assignCouponAgent(coupon, req.body.affiliate);
  await coupon.save();
  res.status(201).json(new ApiResponse(201, { coupon }, "Coupon created."));
}

export async function updateCoupon(req, res) {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw new ApiError(404, "Coupon not found.");
  if (req.body.tag != null) coupon.tag = String(req.body.tag).trim();
  if (req.body.discountPercent != null) {
    if (!percentInRange(req.body.discountPercent)) {
      throw new ApiError(400, "Discount must be from 1 to 100.");
    }
    coupon.discountPercent = Number(req.body.discountPercent);
  }
  if (req.body.appliesTo) coupon.appliesTo = req.body.appliesTo;
  if (req.body.usage === "once" || req.body.usage === "repeat") coupon.usage = req.body.usage;
  if (req.body.active != null) coupon.active = Boolean(req.body.active);
  if (req.body.noExpiry) coupon.endsAt = null;
  else if (req.body.endsAt !== undefined) coupon.endsAt = req.body.endsAt || null;
  if (req.body.startsAt !== undefined) coupon.startsAt = req.body.startsAt || null;
  if (req.body.affiliate !== undefined) await assignCouponAgent(coupon, req.body.affiliate);
  await coupon.save();
  res.json(new ApiResponse(200, { coupon }, "Coupon updated."));
}

export async function couponUses(req, res) {
  const uses = await CouponUse.find({ coupon: req.params.id }).sort({ createdAt: -1 }).lean();
  res.json(new ApiResponse(200, { results: uses }));
}

function endOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function inRange(createdAt, query) {
  const time = new Date(createdAt).getTime();
  if (query.from) {
    const start = new Date(query.from).getTime();
    if (time < start) return false;
  }
  if (query.to) {
    const end = endOfDay(query.to);
    if (end && time > end.getTime()) return false;
  }
  return true;
}

export async function collectSales(query = {}) {
  const [attributions, couponUses, affiliates] = await Promise.all([
    AffiliateAttribution.find().sort({ createdAt: -1 }).lean(),
    CouponUse.find().sort({ createdAt: -1 }).lean(),
    Affiliate.find().select("username linkType shortCode discountPercent commissionPercent").lean(),
  ]);
  const agents = new Map(affiliates.map((row) => [String(row._id), row]));
  const seen = new Set();
  const rows = [];

  const push = (row) => {
    const key = `${row.userType}:${row.userId}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  attributions.forEach((row) => {
    const agent = agents.get(String(row.affiliate));
    const paid = Number(row.amountPaid || 0);
    const commissionPercent = agent?.linkType === "coupon_commission" ? Number(agent.commissionPercent || 0) : 0;
    push({
      id: String(row._id),
      createdAt: row.createdAt,
      name: row.name,
      email: row.email,
      userType: row.userType,
      userId: String(row.user),
      couponCode: row.couponCode || "",
      amountPaid: paid,
      agent: agent?.username || "",
      agentId: agent ? String(agent._id) : "",
      linkType: agent?.linkType || "referral",
      shortCode: row.shortCode || agent?.shortCode || "",
      discountPercent: agent?.discountPercent || 0,
      commissionPercent,
      earned: Math.round(paid * commissionPercent) / 100,
    });
  });

  couponUses.forEach((row) => {
    const agent = row.affiliate ? agents.get(String(row.affiliate)) : null;
    const paid = Number(row.amountPaid || 0);
    const commissionPercent = agent?.linkType === "coupon_commission" ? Number(agent.commissionPercent || 0) : 0;
    push({
      id: String(row._id),
      createdAt: row.createdAt,
      name: row.name,
      email: row.email,
      userType: row.userType,
      userId: String(row.user),
      couponCode: row.code || "",
      amountPaid: paid,
      agent: agent?.username || "",
      agentId: agent ? String(agent._id) : "",
      linkType: agent?.linkType || "",
      shortCode: agent?.shortCode || "",
      discountPercent: agent?.discountPercent || 0,
      commissionPercent,
      earned: Math.round(paid * commissionPercent) / 100,
    });
  });

  return rows.filter((row) => {
    if (!inRange(row.createdAt, query)) return false;
    if ((query.userType === "company" || query.userType === "jobseeker") && row.userType !== query.userType) return false;
    if (query.affiliate && row.agentId !== String(query.affiliate)) return false;
    if (query.linkType && row.linkType !== query.linkType) return false;
    if (query.coupon && row.couponCode !== String(query.coupon).trim().toUpperCase()) return false;
    return true;
  });
}

export async function listSales(req, res) {
  const results = await collectSales(req.query);
  const paid = results.reduce((sum, row) => sum + row.amountPaid, 0);
  const earned = results.reduce((sum, row) => sum + row.earned, 0);
  res.json(new ApiResponse(200, { results, paid, earned, count: results.length }));
}

export async function exportSales(req, res) {
  const results = await collectSales(req.query);
  sendCsv(res, "sales.csv", [
    ["Date", "Name", "Email", "Account", "Agent", "Link", "Link type", "Coupon", "Discount %", "Paid", "Commission %", "Earned"],
    ...results.map((row) => [
      row.createdAt, row.name, row.email, row.userType, row.agent, row.shortCode, row.linkType,
      row.couponCode, row.discountPercent, row.amountPaid, row.commissionPercent, row.earned,
    ]),
  ]);
}

function affiliateFilter(query) {
  const filter = {};
  if (query.affiliate) filter._id = query.affiliate;
  if (query.linkType) filter.linkType = query.linkType;
  return filter;
}

export async function listAffiliates(req, res) {
  const affiliates = await Affiliate.find(affiliateFilter(req.query)).populate("coupon", "code").sort({ createdAt: -1 }).lean();
  res.json(new ApiResponse(200, { results: await affiliateRows(affiliates, req.query) }));
}

async function affiliateRows(affiliates, query) {
  const ids = affiliates.map((row) => row._id);
  const match = { affiliate: { $in: ids } };
  if (query.userType === "company" || query.userType === "jobseeker") match.userType = query.userType;
  if (query.from || query.to) {
    match.createdAt = {};
    if (query.from) match.createdAt.$gte = new Date(query.from);
    if (query.to) match.createdAt.$lte = new Date(query.to);
  }
  if (query.coupon) match.couponCode = String(query.coupon).toUpperCase();
  const { default: AffiliateAttribution } = await import("../models/AffiliateAttribution.js");
  const uses = await AffiliateAttribution.find(match).lean();
  return affiliates.map((affiliate) => {
    const mine = uses.filter((row) => String(row.affiliate) === String(affiliate._id));
    const paid = mine.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
    const commission = affiliate.linkType === "coupon_commission"
      ? Math.round(paid * Number(affiliate.commissionPercent || 0)) / 100
      : 0;
    return {
      ...affiliate,
      conversions: mine.length,
      couponUses: mine.filter((row) => row.couponCode).length,
      couponCode: affiliate.coupon?.code || "",
      paid,
      commission,
    };
  });
}

export async function exportAffiliates(req, res) {
  const affiliates = await Affiliate.find(affiliateFilter(req.query)).sort({ createdAt: -1 }).lean();
  const rows = await affiliateRows(affiliates, req.query);
  sendCsv(res, "affiliates.csv", [
    ["Username", "Login", "Email", "Mobile", "State", "District", "Link", "Type", "Discount", "Commission %", "Conversions", "Coupon uses", "Paid", "Earned"],
    ...rows.map((row) => [
      row.username, row.loginId, row.email, row.mobileNumber || "", row.state || "", row.district || "",
      row.shortCode, row.linkType,
      row.discountPercent, row.commissionPercent, row.conversions, row.couponUses, row.paid, row.commission,
    ]),
  ]);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function linkCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split("@")[0]
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function agentLocation(body) {
  const stateRaw = String(body.state || "").trim();
  const districtRaw = String(body.district || "").trim();
  const stateOther = String(body.stateOther || "").trim();
  const districtOther = String(body.districtOther || "").trim();
  const state = stateRaw === "Other" ? stateOther : stateRaw;
  const district =
    stateRaw === "Other" || districtRaw === "Other" ? districtOther : districtRaw;
  return { state, district };
}

function agentMobile(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

export async function createAffiliate(req, res) {
  const username = String(req.body.username || "").trim();
  const loginId = String(req.body.loginId || "").trim().toLowerCase();
  const email = String(req.body.email || "").trim().toLowerCase();
  const mobileNumber = agentMobile(req.body.mobileNumber);
  const { state, district } = agentLocation(req.body);
  const password = String(req.body.password || "");
  const shortCode = linkCode(req.body.shortCode) || linkCode(loginId);
  const linkType = req.body.linkType;
  if (!username || !loginId || !email || password.length < 8 || shortCode.length < 3) {
    throw new ApiError(400, "Username, login id, email, an 8-character password, and a short link of at least 3 characters are required.");
  }
  if (!mobileNumber || mobileNumber.length !== 10) {
    throw new ApiError(400, "Mobile number must be exactly 10 digits.");
  }
  if (!state) throw new ApiError(400, "State is required.");
  if (!district) throw new ApiError(400, "District is required.");
  if (!["referral", "coupon", "coupon_commission"].includes(linkType)) {
    throw new ApiError(400, "Choose a link type.");
  }
  const discountPercent = Number(req.body.discountPercent) || 0;
  const commissionPercent = Number(req.body.commissionPercent) || 0;
  if (linkType !== "referral" && (discountPercent <= 0 || discountPercent > 100)) {
    throw new ApiError(400, "A coupon link needs a discount from 1 to 100.");
  }
  if (linkType === "coupon_commission" && (commissionPercent <= 0 || commissionPercent > 100)) {
    throw new ApiError(400, "A commission link needs a commission from 1 to 100.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const affiliate = await Affiliate.create({
    username,
    loginId,
    email,
    mobileNumber,
    state,
    district,
    passwordHash,
    shortCode,
    linkType,
    discountPercent: linkType === "referral" ? 0 : discountPercent,
    commissionPercent: linkType === "coupon_commission" ? commissionPercent : 0,
    appliesTo: req.body.appliesTo || "both",
  });

  let couponCode = "";
  if (linkType !== "referral") {
    couponCode = String(req.body.couponCode || shortCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const coupon = await Coupon.create({
      code: couponCode,
      tag: username,
      discountPercent,
      appliesTo: affiliate.appliesTo,
      active: true,
      affiliate: affiliate._id,
    });
    affiliate.coupon = coupon._id;
    await affiliate.save();
  }

  let emailed = false;
  try {
    const origin = String(process.env.CLIENT_URL || "http://127.0.0.1:5173").split(",")[0];
    const link = `${origin}/a/${shortCode}`;
    const who = affiliate.appliesTo === "company" ? "companies" : affiliate.appliesTo === "jobseeker" ? "job seekers" : "companies and job seekers";
    const offer = linkType === "referral"
      ? "<p>This link does not add a discount. The customer pays the normal price, and you do not earn a commission.</p>"
      : `<p>Coupon code: <strong>${esc(couponCode)}</strong></p><p>Discount: <strong>${discountPercent}%</strong> off the amount Cashfree charges.</p><p>Who can use it: ${who}. Each account can use it once. It has no expiry until an admin pauses it.</p>${
        linkType === "coupon_commission"
          ? `<p>Your commission: <strong>${commissionPercent}%</strong> of the amount the customer actually pays.</p>`
          : "<p>This link does not pay you a commission.</p>"
      }`;
    await sendEmail({
      to: email,
      subject: "Your My Profile Live agent login",
      html: emailLayout({
        preheader: "Your agent login, link, and offer",
        title: "Your agent login",
        bodyHtml: `<p>Hello ${esc(username)},</p><p>Login id: <strong>${esc(loginId)}</strong></p><p>Password: <strong>${esc(password)}</strong></p><p>Your link: <a href="${link}">${link}</a></p><p>Sign in at <a href="${origin}/agent">${origin}/agent</a></p>${offer}`,
      }),
    });
    affiliate.loginEmailedAt = new Date();
    await affiliate.save();
    emailed = true;
  } catch (err) {
    console.error("[affiliate-email]", err.message);
  }

  res.status(201).json(new ApiResponse(201, { affiliate, emailed }, "Affiliate created."));
}

export async function updateAffiliate(req, res) {
  const affiliate = await Affiliate.findById(req.params.id);
  if (!affiliate) throw new ApiError(404, "Affiliate not found.");
  if (req.body.username) affiliate.username = String(req.body.username).trim();
  if (req.body.email) affiliate.email = String(req.body.email).trim().toLowerCase();
  if (req.body.mobileNumber != null) {
    const mobileNumber = agentMobile(req.body.mobileNumber);
    if (!mobileNumber || mobileNumber.length !== 10) {
      throw new ApiError(400, "Mobile number must be exactly 10 digits.");
    }
    affiliate.mobileNumber = mobileNumber;
  }
  if (req.body.state != null || req.body.stateOther != null || req.body.district != null || req.body.districtOther != null) {
    const { state, district } = agentLocation({
      state: req.body.state != null ? req.body.state : affiliate.state,
      stateOther: req.body.stateOther,
      district: req.body.district != null ? req.body.district : affiliate.district,
      districtOther: req.body.districtOther,
    });
    if (!state) throw new ApiError(400, "State is required.");
    if (!district) throw new ApiError(400, "District is required.");
    affiliate.state = state;
    affiliate.district = district;
  }
  const nextType = req.body.linkType || affiliate.linkType;
  if (req.body.discountPercent != null && nextType !== "referral") {
    if (!percentInRange(req.body.discountPercent)) {
      throw new ApiError(400, "Discount must be from 1 to 100.");
    }
    affiliate.discountPercent = Number(req.body.discountPercent);
  }
  if (req.body.commissionPercent != null && nextType === "coupon_commission") {
    if (!percentInRange(req.body.commissionPercent)) {
      throw new ApiError(400, "Commission must be from 1 to 100.");
    }
    affiliate.commissionPercent = Number(req.body.commissionPercent);
  }
  if (req.body.linkType) affiliate.linkType = req.body.linkType;
  if (req.body.password) {
    affiliate.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    affiliate.passwordChangedAt = new Date();
  }
  if (affiliate.linkType === "referral") {
    affiliate.discountPercent = 0;
    affiliate.commissionPercent = 0;
  } else if (affiliate.linkType !== "coupon_commission") {
    affiliate.commissionPercent = 0;
  }
  if (affiliate.linkType !== "referral" && !affiliate.coupon) {
    const code = String(req.body.couponCode || affiliate.shortCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const coupon = await Coupon.create({
      code,
      tag: affiliate.username,
      discountPercent: affiliate.discountPercent || 1,
      appliesTo: affiliate.appliesTo,
      active: true,
      affiliate: affiliate._id,
    });
    affiliate.coupon = coupon._id;
  } else if (affiliate.coupon && affiliate.linkType !== "referral") {
    await Coupon.updateOne({ _id: affiliate.coupon }, { $set: { discountPercent: affiliate.discountPercent } });
  }
  await affiliate.save();
  res.json(new ApiResponse(200, { affiliate }, "Affiliate updated."));
}

export async function deleteAffiliate(req, res) {
  const affiliate = await Affiliate.findById(req.params.id);
  if (!affiliate) throw new ApiError(404, "Affiliate not found.");
  if (affiliate.coupon) await Coupon.deleteOne({ _id: affiliate.coupon });
  await affiliate.deleteOne();
  res.json(new ApiResponse(200, {}, "Affiliate deleted."));
}
