import mongoose from "mongoose";

/**
 * Holds a signup in progress until BOTH mobile and email are verified.
 * Once both are true, the controller creates the real JobSeeker/Company
 * document from `payload` and deletes this record.
 *
 * TTL index auto-expires abandoned signups after 30 minutes.
 * Additional indexes make the pre-create deleteMany fast.
 */
const pendingSignupSchema = new mongoose.Schema(
  {
    userType: { type: String, enum: ["jobseeker", "company"], required: true },
    mobile: { type: String, required: true, index: true },
    email: { type: String, required: true, index: true },
    payload: { type: Object, required: true },

    /* OTP tracking */
    mobileVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },

    /* MSG91 reqId from sendMobileOtp, used by checkMobileOtp */
    mobileReqId: { type: String, default: null },

    emailOtpHash: { type: String, default: null },
    emailOtpExpires: { type: Date, default: null },

    /* Payment tracking */
    paymentDone: { type: Boolean, default: false },
    paymentAmount: { type: Number, default: 0 },
    paymentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/* Auto-delete pending signups 30 minutes after creation. */
pendingSignupSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 60 });

export default mongoose.model("PendingSignup", pendingSignupSchema);