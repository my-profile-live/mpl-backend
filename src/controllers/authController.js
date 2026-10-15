import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import JobSeeker from "../models/JobSeeker.js";
import Company from "../models/Company.js";
import PendingSignup from "../models/PendingSignup.js";
import LoginOtp from "../models/LoginOtp.js";
import PasswordReset from "../models/PasswordReset.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signToken } from "../utils/jwt.js";
import { generateOtp, hashOtp, compareOtp } from "../utils/generateOtp.js";
import { sendMobileOtp, checkMobileOtp, toE164 } from "../config/msg91.js";
import {
  sendEmailOtp,
  sendPasswordResetLink,
  sendWelcomeEmail,
} from "../config/brevo.js";
import {
  calcCompanyCompletion,
  calcJobSeekerCompletion,
} from "../utils/profileCompletion.js";
import SignupPayment from "../models/SignupPayment.js";
import Subscription from "../models/Subscription.js";
import { getPlanById, DEFAULT_FREE_PLAN_ID } from "../data/plans.js";

/* ───────────────────────── CONSTANTS ───────────────────────── */
const MODEL = { jobseeker: JobSeeker, company: Company };
const EMAIL_FIELD = { jobseeker: "email", company: "companyEmail" };
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function otpVerificationEnabled() {
  return process.env.OTP_VERIFICATION_ENABLED !== "false";
}

function isDummyOtp(otp) {
  const dummy = process.env.OTP_DUMMY;
  return dummy && otp === dummy;
}

/* ───────────────────────── HELPERS ───────────────────────── */

function stripSensitive(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
}

/**
 * Computes the plan status for the login/session payload.
 *
 *   "trial"   → user is on the free welcome plan (1m or trial), not expired
 *   "active"  → user is on a paid plan, not expired
 *   "expired" → no plan, or the plan's expiry has passed
 *
 * The frontend uses this to render trial banner / active badge / expired warning.
 */
function getPlanStatus(userDoc) {
  const plan = userDoc.currentPlan;
  const expiry = userDoc.planExpiry;

  /* No plan on file → treat as expired */
  if (!plan || !expiry) return "expired";

  /* Expiry has passed */
  if (expiry <= new Date()) return "expired";

  /* Free welcome plans → trial */
  if (plan === "1m" || plan === "trial") return "trial";

  /* Paid plan, still valid */
  return "active";
}

function issueSession(userType, userDoc) {
  const token = signToken({ id: userDoc._id.toString(), role: userType });

  return {
    token,
    userType,
    user: {
      id: userDoc._id,
      email: userDoc.email || userDoc.companyEmail || null,
      mobileNumber: userDoc.mobileNumber || null,
    },
    plan: {
      currentPlan: userDoc.currentPlan || null,
      planExpiry: userDoc.planExpiry || null,
      leadsRemaining: userDoc.leadsRemaining ?? 0,
      status: getPlanStatus(userDoc),   // "trial" | "active" | "expired"
    },
    profile: stripSensitive(userDoc),
  };
}

async function verifyEmailOtp(otp, hash, expiry) {
  if (expiry && expiry < new Date()) {
    throw new ApiError(400, "OTP has expired. Please request a new one.");
  }
  const ok = await compareOtp(otp, hash);
  if (!ok) throw new ApiError(400, "Invalid OTP.");
  return true;
}

/**
 * 🎁 Grants the default free plan (currently "1m") to a newly-created user.
 * Mutates the plain payload object BEFORE Model.create() is called, so the
 * user doc already has currentPlan / planExpiry / leadsRemaining from the
 * very first save.
 *
 * No payment is charged — it's a welcome bonus on signup.
 */
function applyFreePlan(userType, payload) {
  const plan = getPlanById(userType, DEFAULT_FREE_PLAN_ID);
  if (!plan) return payload;

  const now = new Date();
  const expiry = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);

  return {
    ...payload,
    currentPlan: plan.id,
    planExpiry: expiry,
    leadsRemaining: plan.leads,
  };
}

/**
 * 🎁 Logs a Subscription record for the free plan so it shows up in
 * "My Subscription" (same shape as planController.subscribeToPlan).
 *
 * Must run AFTER the user doc is created (needs userDoc._id).
 * Fails soft — if the log fails, the user still has their plan because
 * the plan fields are already set on the user doc.
 */
async function logFreePlanSubscription(userType, userDoc) {
  try {
    const plan = getPlanById(userType, DEFAULT_FREE_PLAN_ID);
    if (!plan) return;

    /* Reuse whatever expiry the user doc already has, so the sub record
       stays in sync with the user fields. */
    const expiresAt =
      userDoc.planExpiry ||
      new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000);

    await Subscription.create({
      ownerType: userType,
      owner: userDoc._id,
      ownerModel: userType === "company" ? "Company" : "JobSeeker",
      planId: plan.id,
      label: plan.label,
      price: 0, // free welcome plan
      leadsGranted: plan.leads,
      startedAt: new Date(),
      expiresAt,
      status: "active",
    });
  } catch (err) {
    console.error("[free-plan] subscription log failed:", err.message);
    /* Do NOT rethrow — the user still has the plan on the user doc */
  }
}

/* ───────────────────────── SIGNUP ───────────────────────── */

export const signupCompany = asyncHandler(async (req, res) => {
  const body = req.body;

  if (!req.file) {
    throw new ApiError(400, "Validation failed.", [
      { path: "photo", message: "Passport size photo is required" },
    ]);
  }

  const upperPan = body.panNumber.toUpperCase();
  const lowerEmail = body.companyEmail.toLowerCase();
  const mobile = body.mobileNumber;

  const [byPan, coByEmail, jsByEmail, coByMobile, jsByMobile] =
    await Promise.all([
      Company.findOne({ panNumber: upperPan }).select("_id").lean(),
      Company.findOne({ companyEmail: lowerEmail }).select("_id").lean(),
      JobSeeker.findOne({ email: lowerEmail }).select("_id").lean(),
      Company.findOne({ mobileNumber: mobile }).select("_id").lean(),
      JobSeeker.findOne({ mobileNumber: mobile }).select("_id").lean(),
    ]);

  const emailTaken = !!(coByEmail || jsByEmail);
  const mobileTaken = !!(coByMobile || jsByMobile);

  if (byPan) {
    throw new ApiError(
      409,
      "A company with this PAN is already registered."
    );
  }
  if (emailTaken && mobileTaken) {
    throw new ApiError(
      409,
      "An account with this email and mobile number is already registered."
    );
  }
  if (emailTaken) {
    throw new ApiError(409, "This email is already registered.");
  }
  if (mobileTaken) {
    throw new ApiError(409, "This mobile number is already registered.");
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  const {
    password,
    profileCompletion,
    status,
    paymentId: _dropPaymentId,
    paymentDone: _dropPaymentDone,
    paymentAmount: _dropPaymentAmount,
    paymentAt: _dropPaymentAt,
    ...rest
  } = body;

  const payload = {
    ...rest,
    panNumber: body.panNumber.toUpperCase(),
    companyEmail: body.companyEmail.toLowerCase(),
    passwordHash,
    companyLogo: req.uploadedFileUrl || null,
    status: "Pending Verification",
    paymentDone: false,
    paymentAmount: 0,
    paymentAt: null,
  };

  if (!otpVerificationEnabled()) {
    const completion = calcCompanyCompletion(payload);
    const payloadWithPlan = applyFreePlan("company", payload);
    const company = await Company.create({
      ...payloadWithPlan,
      isMobileVerified: true,
      isEmailVerified: true,
      profileCompletion: completion,
      lastLoginAt: new Date(),
    });

    /* 🎁 Log the free plan as a Subscription record */
    await logFreePlanSubscription("company", company);

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          issueSession("company", company),
          "Account created. (OTP verification is currently disabled.)"
        )
      );
  }

  /* 🧹 Clear any stale pending signup for this mobile or email so the
     user never hits "Mobile number is already verified" when retrying. */
  await PendingSignup.deleteMany({
    $or: [
      { mobile: toE164(body.mobileNumber) },
      { email: body.companyEmail.toLowerCase() },
    ],
  });

  let mobileReqId = null;
  try {
    mobileReqId = await sendMobileOtp(toE164(body.mobileNumber));
  } catch (err) {
    console.error("[msg91] sendMobileOtp failed:", err.message);
    throw new ApiError(
      502,
      "Could not send OTP to your mobile right now. Please try again."
    );
  }

  const pending = await PendingSignup.create({
    userType: "company",
    mobile: toE164(body.mobileNumber),
    email: body.companyEmail.toLowerCase(),
    payload,
    mobileReqId,
    emailOtpHash: null,
    emailOtpExpires: null,
    paymentDone: false,
    paymentAmount: 0,
    paymentAt: null,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        pendingSignupId: pending._id,
        mobileSent: true,
        emailSent: false,
        email: body.companyEmail.toLowerCase(),
        mobile: body.mobileNumber,
      },
      "OTP sent to mobile. Verify mobile to continue."
    )
  );
});

export const signupJobSeeker = asyncHandler(async (req, res) => {
  const body = req.body;

  const lowerEmail = body.email.toLowerCase();
  const mobile = body.mobileNumber;

  const [jsByEmail, coByEmail, jsByMobile, coByMobile] = await Promise.all([
    JobSeeker.findOne({ email: lowerEmail }).select("_id").lean(),
    Company.findOne({ companyEmail: lowerEmail }).select("_id").lean(),
    JobSeeker.findOne({ mobileNumber: mobile }).select("_id").lean(),
    Company.findOne({ mobileNumber: mobile }).select("_id").lean(),
  ]);

  const emailTaken = !!(jsByEmail || coByEmail);
  const mobileTaken = !!(jsByMobile || coByMobile);

  if (emailTaken && mobileTaken) {
    throw new ApiError(
      409,
      "An account with this email and mobile number is already registered."
    );
  }
  if (emailTaken) {
    throw new ApiError(409, "This email is already registered.");
  }
  if (mobileTaken) {
    throw new ApiError(409, "This mobile number is already registered.");
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  const {
    password,
    paymentId: _dropPaymentId,
    paymentDone: _dropPaymentDone,
    paymentAmount: _dropPaymentAmount,
    paymentAt: _dropPaymentAt,
    ...rest
  } = body;

  const payload = {
    ...rest,
    email: body.email.toLowerCase(),
    passwordHash,
    photo: req.uploadedFileUrl || null,
    paymentDone: false,
    paymentAmount: 0,
    paymentAt: null,
  };

  if (!otpVerificationEnabled()) {
    const completion = calcJobSeekerCompletion(payload);
    const payloadWithPlan = applyFreePlan("jobseeker", payload);
    const userDoc = await JobSeeker.create({
      ...payloadWithPlan,
      isMobileVerified: true,
      isEmailVerified: true,
      profileCompletion: completion,
      lastLoginAt: new Date(),
    });

    /* 🎁 Log the free plan as a Subscription record */
    await logFreePlanSubscription("jobseeker", userDoc);

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          issueSession("jobseeker", userDoc),
          "Account created. (OTP verification is currently disabled.)"
        )
      );
  }

  /* 🧹 Clear any stale pending signup for this mobile or email so the
     user never hits "Mobile number is already verified" when retrying. */
  await PendingSignup.deleteMany({
    $or: [
      { mobile: toE164(body.mobileNumber) },
      { email: body.email.toLowerCase() },
    ],
  });

  let mobileReqId = null;
  try {
    mobileReqId = await sendMobileOtp(toE164(body.mobileNumber));
  } catch (err) {
    console.error("[msg91] sendMobileOtp failed:", err.message);
    throw new ApiError(
      502,
      "Could not send OTP to your mobile right now. Please try again."
    );
  }

  const pending = await PendingSignup.create({
    userType: "jobseeker",
    mobile: toE164(body.mobileNumber),
    email: body.email.toLowerCase(),
    payload,
    mobileReqId,
    emailOtpHash: null,
    emailOtpExpires: null,
    paymentDone: false,
    paymentAmount: 0,
    paymentAt: null,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        pendingSignupId: pending._id,
        mobileSent: true,
        emailSent: false,
        email: body.email.toLowerCase(),
        mobile: body.mobileNumber,
      },
      "OTP sent to mobile. Verify mobile to continue."
    )
  );
});

export const verifySignupOtp = asyncHandler(async (req, res) => {
  const { pendingSignupId, channel, otp } = req.body;

  if (!pendingSignupId || !channel || !otp) {
    throw new ApiError(400, "pendingSignupId, channel and otp are required.");
  }

  const pending = await PendingSignup.findById(pendingSignupId);
  if (!pending) {
    throw new ApiError(
      410,
      "This signup session has expired. Please sign up again."
    );
  }

  /* ─── Verify MOBILE ─── */
  if (channel === "mobile") {
    if (pending.mobileVerified) {
      throw new ApiError(400, "Mobile number is already verified.");
    }

    let ok = false;
    if (isDummyOtp(otp)) {
      ok = true;
    } else {
      try {
        ok = await checkMobileOtp(pending.mobileReqId, otp);
      } catch (err) {
        console.error("[msg91] checkMobileOtp failed:", err.message);
        throw new ApiError(
          502,
          "Could not verify OTP right now. Please try again."
        );
      }
    }

    if (!ok) throw new ApiError(400, "Invalid or expired mobile OTP.");

    pending.mobileVerified = true;

    const emailOtp = generateOtp();
    pending.emailOtpHash = await hashOtp(emailOtp);
    pending.emailOtpExpires = new Date(Date.now() + EMAIL_OTP_TTL_MS);
    await pending.save();

    await sendEmailOtp(pending.email, emailOtp);

    return res.json(
      new ApiResponse(
        200,
        {
          mobileVerified: true,
          emailVerified: false,
          emailSent: true,
          email: pending.email,
          complete: false,
        },
        "Mobile verified. Email OTP sent to your inbox."
      )
    );
  }

  /* ─── Verify EMAIL → create real account (unpaid) ─── */
  if (channel === "email") {
    if (!pending.mobileVerified) {
      throw new ApiError(
        400,
        "Please verify your mobile number before verifying email."
      );
    }
    if (pending.emailVerified) {
      throw new ApiError(400, "Email is already verified.");
    }

    if (!isDummyOtp(otp)) {
      await verifyEmailOtp(otp, pending.emailOtpHash, pending.emailOtpExpires);
    }

    pending.emailVerified = true;
    await pending.save();

    const Model = MODEL[pending.userType];
    const completion =
      pending.userType === "company"
        ? calcCompanyCompletion(pending.payload)
        : calcJobSeekerCompletion(pending.payload);

    /* 🎁 Grant the default free plan on account creation */
    const payloadWithPlan = applyFreePlan(pending.userType, pending.payload);

    const userDoc = await Model.create({
      ...payloadWithPlan,
      isMobileVerified: true,
      isEmailVerified: true,
      profileCompletion: completion,
      lastLoginAt: new Date(),
      paymentDone: false,
      paymentAmount: 0,
      paymentAt: null,
    });

    /* 🎁 Log the free plan as a Subscription record */
    await logFreePlanSubscription(pending.userType, userDoc);

    await PendingSignup.deleteOne({ _id: pending._id });

    const name =
      pending.userType === "company"
        ? userDoc.companyName
        : userDoc.fullName;
    const email =
      pending.userType === "company" ? userDoc.companyEmail : userDoc.email;
    sendWelcomeEmail(email, name).catch((e) =>
      console.error("[welcome email]", e.message)
    );

    const session = issueSession(pending.userType, userDoc);

    return res.json(
      new ApiResponse(
        200,
        { ...session, complete: true },
        "Account created and verified."
      )
    );
  }

  throw new ApiError(400, "channel must be 'mobile' or 'email'.");
});

export const resendSignupOtp = asyncHandler(async (req, res) => {
  const { pendingSignupId, channel } = req.body;

  if (!pendingSignupId || !channel) {
    throw new ApiError(400, "pendingSignupId and channel are required.");
  }

  const pending = await PendingSignup.findById(pendingSignupId);
  if (!pending) {
    throw new ApiError(
      410,
      "This signup session has expired. Please sign up again."
    );
  }

  if (channel === "mobile") {
    if (pending.mobileVerified) {
      throw new ApiError(400, "Mobile number is already verified.");
    }
    try {
      pending.mobileReqId = await sendMobileOtp(pending.mobile);
      await pending.save();
    } catch (err) {
      console.error("[msg91] resend sendMobileOtp failed:", err.message);
      throw new ApiError(502, "Could not resend OTP. Please try again.");
    }
  } else if (channel === "email") {
    if (!pending.mobileVerified) {
      throw new ApiError(
        400,
        "Please verify your mobile number before requesting an email OTP."
      );
    }
    if (pending.emailVerified) {
      throw new ApiError(400, "Email is already verified.");
    }

    const otp = generateOtp();
    pending.emailOtpHash = await hashOtp(otp);
    pending.emailOtpExpires = new Date(Date.now() + EMAIL_OTP_TTL_MS);
    await pending.save();
    await sendEmailOtp(pending.email, otp);
  } else {
    throw new ApiError(400, "channel must be 'mobile' or 'email'.");
  }

  return res.json(new ApiResponse(200, { channel }, "OTP resent."));
});

/* ───────────────────────── LOGIN ───────────────────────── */

export const requestMobileLoginOtp = asyncHandler(async (req, res) => {
  const { userType, mobileNumber } = req.body;

  if (!MODEL[userType]) throw new ApiError(400, "Invalid user type.");
  if (!/^[0-9]{10}$/.test(mobileNumber)) {
    throw new ApiError(400, "Mobile number must be 10 digits.");
  }

  const Model = MODEL[userType];
  const user = await Model.findOne({ mobileNumber });
  if (!user)
    throw new ApiError(404, "No account found with this mobile number.");

  const e164 = toE164(mobileNumber);

  let mobileReqId = null;
  try {
    mobileReqId = await sendMobileOtp(e164);
  } catch (err) {
    console.error("[msg91] login sendMobileOtp failed:", err.message);
    throw new ApiError(502, "Could not send OTP right now. Please try again.");
  }

  await LoginOtp.create({ userType, mobile: e164, mobileReqId });

  return res.json(
    new ApiResponse(200, { sent: true }, "OTP sent to your mobile number.")
  );
});

export const verifyMobileLoginOtp = asyncHandler(async (req, res) => {
  const { userType, mobileNumber, otp } = req.body;

  if (!MODEL[userType]) throw new ApiError(400, "Invalid user type.");
  if (!/^[0-9]{10}$/.test(mobileNumber)) {
    throw new ApiError(400, "Mobile number must be 10 digits.");
  }
  if (!otp) throw new ApiError(400, "OTP is required.");

  const e164 = toE164(mobileNumber);

  const pendingLogin = await LoginOtp.findOne({ userType, mobile: e164 });
  if (!pendingLogin) {
    throw new ApiError(400, "Please request an OTP first.");
  }

  let ok = false;
  if (isDummyOtp(otp)) {
    ok = true;
  } else {
    try {
      ok = await checkMobileOtp(pendingLogin.mobileReqId, otp);
    } catch (err) {
      console.error("[msg91] login checkMobileOtp failed:", err.message);
      throw new ApiError(
        502,
        "Could not verify OTP right now. Please try again."
      );
    }
  }

  if (!ok) throw new ApiError(400, "Invalid or expired OTP.");

  const Model = MODEL[userType];
  const user = await Model.findOne({ mobileNumber });
  if (!user)
    throw new ApiError(404, "No account found with this mobile number.");

  user.lastLoginAt = new Date();
  await user.save();

  await LoginOtp.deleteMany({ userType, mobile: e164 });

  return res.json(
    new ApiResponse(200, issueSession(userType, user), "Logged in.")
  );
});

export const loginWithEmail = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  const lower = email.toLowerCase();

  let userType = "jobseeker";
  let user = await JobSeeker.findOne({ email: lower }).select("+passwordHash");

  if (!user) {
    userType = "company";
    user = await Company.findOne({ companyEmail: lower }).select(
      "+passwordHash"
    );
  }

  if (!user) throw new ApiError(401, "Invalid email or password.");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new ApiError(401, "Invalid email or password.");

  user.lastLoginAt = new Date();
  await user.save();

  return res.json(
    new ApiResponse(200, issueSession(userType, user), "Logged in.")
  );
});

export const logout = asyncHandler(async (req, res) => {
  return res.json(new ApiResponse(200, null, "Logged out."));
});

/* ─────────────────────── PASSWORD RESET ─────────────────────── */

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function generateResetToken() {
  return randomBytes(32).toString("hex");
}

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const GENERIC_OK =
    "If an account exists with this email, a reset link has been sent.";

  if (!email) throw new ApiError(400, "Email is required.");

  const lowerEmail = email.toLowerCase().trim();

  /* Look up the user across BOTH collections — email is globally unique */
  let userType = null;
  let user = await JobSeeker.findOne({ email: lowerEmail });

  if (user) {
    userType = "jobseeker";
  } else {
    user = await Company.findOne({ companyEmail: lowerEmail });
    if (user) userType = "company";
  }

  /* Never leak whether the email exists */
  if (!user) {
    return res.json(new ApiResponse(200, null, GENERIC_OK));
  }

  /* Invalidate any previous unused resets for this user */
  await PasswordReset.deleteMany({ userId: user._id, userType });

  const rawToken = generateResetToken();
  const tokenHash = hashResetToken(rawToken);

  await PasswordReset.create({
    userId: user._id,
    userType,
    email: lowerEmail,
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  /* Build the clickable link */
  const frontendUrl =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5173";

  const resetUrl =
    `${frontendUrl.replace(/\/$/, "")}/reset-password` +
    `?token=${rawToken}` +
    `&uid=${user._id.toString()}` +
    `&type=${userType}`;

  const name = userType === "company" ? user.companyName : user.fullName;

  try {
    await sendPasswordResetLink(lowerEmail, name, resetUrl);
  } catch (err) {
    console.error("[forgotPassword] email send failed:", err.message);
  }

  return res.json(new ApiResponse(200, null, GENERIC_OK));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, uid, userType, newPassword } = req.body;

  if (!token || !uid || !userType || !newPassword) {
    throw new ApiError(
      400,
      "token, uid, userType and newPassword are required."
    );
  }

  if (!MODEL[userType]) throw new ApiError(400, "Invalid user type.");

  /* Password rules (must match frontend) */
  if (
    newPassword.length < 8 ||
    !/[A-Z]/.test(newPassword) ||
    !/[a-z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    throw new ApiError(
      400,
      "Password must be 8+ characters with uppercase, lowercase and a number."
    );
  }

  const tokenHash = hashResetToken(token);

  const reset = await PasswordReset.findOne({
    userId: uid,
    userType,
    tokenHash,
  });

  if (!reset) {
    throw new ApiError(
      400,
      "This reset link is invalid or has already been used."
    );
  }
  if (reset.usedAt) {
    throw new ApiError(400, "This reset link has already been used.");
  }
  if (reset.expiresAt < new Date()) {
    throw new ApiError(
      400,
      "This reset link has expired. Please request a new one."
    );
  }

  const Model = MODEL[userType];
  const user = await Model.findById(uid);
  if (!user) throw new ApiError(404, "Account not found.");

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  reset.usedAt = new Date();
  await reset.save();

  /* Optional: purge all reset records for this user */
  await PasswordReset.deleteMany({ userId: uid, userType });

  return res.json(
    new ApiResponse(200, null, "Password reset successfully. You can now log in.")
  );
});

/* ─────────────────────── UNIQUENESS ─────────────────────── */

/**
 * POST /api/v1/auth/check-company-uniqueness
 *
 * Body: { panNumber?, gstNumber?, cinNumber?, companyEmail?, mobileNumber? }
 *
 * Email and mobile are also checked against JobSeeker collection so
 * the same email/mobile can't be used for both profile types.
 */
export const checkCompanyUniqueness = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const details = [];
  const checked = [];
  const jobs = [];

  /* ─── PAN ─── */
  if (body.panNumber?.trim()) {
    const value = body.panNumber.trim().toUpperCase();
    checked.push("panNumber");
    jobs.push(
      Company.findOne({ panNumber: value })
        .select("_id")
        .lean()
        .then((doc) => {
          if (doc)
            details.push({
              path: "panNumber",
              message: "A company with this PAN is already registered.",
            });
        })
    );
  }

  /* ─── GST ─── */
  if (body.gstNumber?.trim()) {
    const value = body.gstNumber.trim().toUpperCase();
    checked.push("gstNumber");
    jobs.push(
      Company.findOne({ gstNumber: value })
        .select("_id")
        .lean()
        .then((doc) => {
          if (doc)
            details.push({
              path: "gstNumber",
              message: "A company with this GST number is already registered.",
            });
        })
    );
  }

  /* ─── CIN ─── */
  if (body.cinNumber?.trim()) {
    const value = body.cinNumber.trim().toUpperCase();
    checked.push("cinNumber");
    jobs.push(
      Company.findOne({ cinNumber: value })
        .select("_id")
        .lean()
        .then((doc) => {
          if (doc)
            details.push({
              path: "cinNumber",
              message: "A company with this CIN is already registered.",
            });
        })
    );
  }

  /* ─── EMAIL (cross-collection) ─── */
  if (body.companyEmail?.trim()) {
    const value = body.companyEmail.trim().toLowerCase();
    checked.push("companyEmail");
    jobs.push(
      Promise.all([
        Company.findOne({ companyEmail: value }).select("_id").lean(),
        JobSeeker.findOne({ email: value }).select("_id").lean(),
      ]).then(([co, js]) => {
        if (co || js) {
          details.push({
            path: "companyEmail",
            message: "This email is already registered.",
          });
        }
      })
    );
  }

  /* ─── MOBILE (cross-collection) ─── */
  if (body.mobileNumber?.trim()) {
    const value = body.mobileNumber.trim();
    checked.push("mobileNumber");
    jobs.push(
      Promise.all([
        Company.findOne({ mobileNumber: value }).select("_id").lean(),
        JobSeeker.findOne({ mobileNumber: value }).select("_id").lean(),
      ]).then(([co, js]) => {
        if (co || js) {
          details.push({
            path: "mobileNumber",
            message: "This mobile number is already registered.",
          });
        }
      })
    );
  }

  if (checked.length === 0) {
    throw new ApiError(
      400,
      "Provide at least one of: panNumber, gstNumber, cinNumber, companyEmail, mobileNumber."
    );
  }

  await Promise.all(jobs);

  /* ─── Both email AND mobile → combined message ─── */
  const emailHit = details.some((d) => d.path === "companyEmail");
  const mobileHit = details.some((d) => d.path === "mobileNumber");

  if (emailHit && mobileHit) {
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message:
        "An account with this email and mobile number is already registered.",
      details,
      checked,
    });
  }

  if (details.length > 0) {
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message: "Validation failed.",
      details,
      checked,
    });
  }

  return res.json(
    new ApiResponse(200, { ok: true, checked }, "Details are available.")
  );
});

/**
 * POST /api/v1/auth/check-jobseeker-uniqueness
 *
 * Body: { email?, mobileNumber? }
 *
 * Checks cross-collection — email and mobile must be unique across
 * BOTH JobSeeker and Company collections.
 *
 * Returns 200 { ok, checked } or 409 { details: [{path, message}] }
 */
export const checkJobSeekerUniqueness = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const details = [];
  const checked = [];

  const email = body.email?.trim().toLowerCase();
  const mobile = body.mobileNumber?.trim();

  if (!email && !mobile) {
    throw new ApiError(400, "Provide at least one of: email, mobileNumber.");
  }

  /* ─── EMAIL check ─── */
  if (email) {
    checked.push("email");

    const [jsByEmail, coByEmail] = await Promise.all([
      JobSeeker.findOne({ email }).select("_id").lean(),
      Company.findOne({ companyEmail: email }).select("_id").lean(),
    ]);

    if (jsByEmail || coByEmail) {
      details.push({
        path: "email",
        message: "This email is already registered.",
      });
    }
  }

  /* ─── MOBILE check ─── */
  if (mobile) {
    checked.push("mobileNumber");

    const [jsByMobile, coByMobile] = await Promise.all([
      JobSeeker.findOne({ mobileNumber: mobile }).select("_id").lean(),
      Company.findOne({ mobileNumber: mobile }).select("_id").lean(),
    ]);

    if (jsByMobile || coByMobile) {
      details.push({
        path: "mobileNumber",
        message: "This mobile number is already registered.",
      });
    }
  }

  /* ─── Both email AND mobile matched → combined message ─── */
  const emailHit = details.some((d) => d.path === "email");
  const mobileHit = details.some((d) => d.path === "mobileNumber");

  if (emailHit && mobileHit) {
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message:
        "An account with this email and mobile number is already registered.",
      details,
      checked,
    });
  }

  if (details.length > 0) {
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message: "Validation failed.",
      details,
      checked,
    });
  }

  return res.json(
    new ApiResponse(200, { ok: true, checked }, "Details are available.")
  );
});

/* ─────────────────── COMPLETE SIGNUP PAYMENT ─────────────────── */

export const completeSignupPayment = asyncHandler(async (req, res) => {
  const { paymentId, amount } = req.body;

  if (!paymentId) {
    throw new ApiError(400, "paymentId is required.");
  }

  const userType = req.user?.role;
  const userId = req.user?._id || req.user?.id;

  if (!userType || !userId || !MODEL[userType]) {
    console.error("[complete-payment] invalid session", {
      userType,
      userId,
      hasUser: !!req.user,
    });
    throw new ApiError(
      401,
      "Session is invalid. Please sign up or log in again."
    );
  }

  const Model = MODEL[userType];
  const user = await Model.findById(userId);

  if (!user) {
    console.error("[complete-payment] user not found", {
      userType,
      userId,
      model: Model.modelName,
    });
    throw new ApiError(
      401,
      "Your account could not be found. Please sign up again."
    );
  }

  /* ─── Verify the payment record ─── */
  const payment = await SignupPayment.findOne({
    paymentId,
    userType,
    status: "paid",
  });

  if (!payment) {
    console.error("[complete-payment] payment not found", {
      paymentId,
      userType,
    });
    throw new ApiError(
      400,
      "Payment could not be verified. Please complete the payment again."
    );
  }

  /* ─── Idempotent: if already recorded, return success ─── */
  if (user.paymentDone && user.paymentId === paymentId) {
    return res.json(
      new ApiResponse(
        200,
        { profile: stripSensitive(user), alreadyPaid: true },
        "Payment already recorded."
      )
    );
  }

  /* ─── Record the payment on the user ─── */
  user.paymentDone = true;
  user.paymentAmount = amount || payment.amount || 100;
  user.paymentAt = new Date();
  user.paymentId = paymentId;
  await user.save();

  console.log("[complete-payment] payment recorded", {
    userType,
    userId,
    paymentId,
  });

  return res.json(
    new ApiResponse(
      200,
      { profile: stripSensitive(user) },
      "Payment recorded. Account fully activated."
    )
  );
});

/* ───────────────────────── SESSION ───────────────────────── */

export const getMe = asyncHandler(async (req, res) => {
  return res.json(
    new ApiResponse(200, {
      userType: req.user.role,
      profile: stripSensitive(req.userDoc),
    })
  );
});