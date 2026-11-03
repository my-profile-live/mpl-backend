import mongoose from "mongoose";

const affiliateSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    loginId: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    mobileNumber: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    district: { type: String, default: "", trim: true },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: { type: Date, default: null },
    shortCode: { type: String, required: true, unique: true, lowercase: true, trim: true },
    linkType: {
      type: String,
      enum: ["referral", "coupon", "coupon_commission"],
      required: true,
    },
    discountPercent: { type: Number, default: 0 },
    commissionPercent: { type: Number, default: 0 },
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
    appliesTo: { type: String, enum: ["company", "jobseeker", "both"], default: "both" },
    loginEmailedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Affiliate", affiliateSchema);
