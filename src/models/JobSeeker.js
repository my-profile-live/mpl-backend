import mongoose from "mongoose";

const educationSchema = new mongoose.Schema(
  {
    qualification: String,
    specialization: String,
    college: String,
    university: String,
    state: String,
    district: String,
    passingYear: String,
    percentage: String,
  },
  { _id: true }
);

const employmentSchema = new mongoose.Schema(
  {
    companyName: String,
    designation: String,
    joiningDate: String,
    leavingDate: String,
    experience: String,
    salary: String,
    responsibilities: String,
  },
  { _id: true }
);

const jobSeekerSchema = new mongoose.Schema(
  {
    // ── Personal ──────────────────────────────────────
    fullName: { type: String, required: true, trim: true },
    /** Public share handle, e.g. himanshu-kapuriya-k7m2. Never the database id. */
    publicSlug: { type: String, unique: true, sparse: true, index: true },
    photo: { type: String, default: null },
    mobileNumber: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    dob: String,
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    about: { type: String, maxlength: 1000 },
    address: String,
    state: String,
    district: String,
    city: String,
    pinCode: String,

    // ── Professional ──────────────────────────────────
    currentJobTitle: String,
    currentCompany: String,
    totalExperience: String,
    relevantExperience: String,
    currentSalary: String,
    expectedSalary: String,
    noticePeriod: String,
    preferredIndustry: String,
    preferredJobState: String,
    preferredJobCity: String,
    preferredJobLocation: String,
    jobType: String,
    wfh: { type: String, enum: ["Yes", "No", "Hybrid"] },
    languagesKnown: { type: [String], default: [] },

    // ── History ───────────────────────────────────────
    employmentHistory: { type: [employmentSchema], default: [] },
    education: { type: [educationSchema], default: [] },

    // ── Skills & preferences ──────────────────────────
    skills: { type: [String], default: [] },
    hobbies: { type: [String], default: [] },
    willingToTravel: { type: Boolean, default: false },
    readyToRelocate: { type: Boolean, default: false },
    immediateJoining: { type: Boolean, default: false },
    preferredSalary: String,
    preferredState: String,
    preferredDistrict: String,
    preferredCity: String,

    // ── Account / verification state ──────────────────
    isMobileVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    profileCompletion: { type: Number, default: 0 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },

    // ── Plan / leads ──────────────────────────────────
    currentPlan: { type: String, default: null },
    planExpiry: { type: Date, default: null },
    leadsRemaining: { type: Number, default: 0 },

    // ── Payment ───────────────────────────────────────
    paymentDone: { type: Boolean, default: false },
    paymentAmount: { type: Number, default: 0 },
    paymentAt: { type: Date, default: null },
    paymentId: { type: String, default: null },   /* ✅ NEW — mirrors Company */
     hasSeenWelcome: { type: Boolean, default: false },

    lastLoginAt: Date,
  },
  { timestamps: true }
);

jobSeekerSchema.index({
  fullName: "text",
  currentJobTitle: "text",
  skills: "text",
  currentCompany: "text",
});

export default mongoose.model("JobSeeker", jobSeekerSchema);