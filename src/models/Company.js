import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    // ── Basic Info ────────────────────────────────────
    companyName: { type: String, required: true, trim: true },
    companyLogo: { type: String, default: null },
    companyType: {
      type: String,
      enum: ["Private Limited", "LLP", "Proprietorship", "Partnership"],
    },
    industry: String,
    panNumber: { type: String, required: true, uppercase: true, unique: true },
    gstNumber: { type: String, uppercase: true },
    cinNumber: { type: String, uppercase: true },
    website: String,
    passwordHash: { type: String, required: true, select: false },

    // ── Contact & Location ────────────────────────────
    companyEmail: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    mobileNumber: { type: String, required: true, unique: true, index: true },
    contactPersonName: String,
    designation: String,
    officeAddress: String,
    state: String,
    district: String,
    city: String,
    pinCode: String,

    // ── Company Profile ───────────────────────────────
    companyDescription: String,
    yearOfEstablishment: String,
    numberOfEmployees: String,
    productsServices: String,
    workingDays: String,
    officeTiming: String,

    // ── Account / verification state ──────────────────
    isMobileVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    profileCompletion: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Pending Verification", "Verified", "Rejected", "Suspended"],
      default: "Pending Verification",
    },

    // ── Plan / leads ──────────────────────────────────
    currentPlan: { type: String, default: null },
    planExpiry: { type: Date, default: null },
    leadsRemaining: { type: Number, default: 0 },

    // ── Payment ───────────────────────────────────────
    paymentDone: { type: Boolean, default: false },
    paymentAmount: { type: Number, default: 0 },
    paymentAt: { type: Date, default: null },
    paymentId: { type: String, default: null },   /* ✅ NEW */

    lastLoginAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Company", companySchema);