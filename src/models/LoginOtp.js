import mongoose from "mongoose";

/**
 * Short-lived record for mobile-OTP login (no password).
 * MSG91 owns the actual OTP; this just remembers *who* is mid-login
 * plus the MSG91 reqId needed to verify the code.
 */
const loginOtpSchema = new mongoose.Schema(
  {
    userType: { type: String, enum: ["jobseeker", "company"], required: true },
    mobile: { type: String, required: true },
    mobileReqId: { type: String, default: null }, // ✅ NEW
    createdAt: { type: Date, default: Date.now, expires: 60 * 10 }, // 10 min TTL
  },
  { timestamps: false }
);

export default mongoose.model("LoginOtp", loginOtpSchema);