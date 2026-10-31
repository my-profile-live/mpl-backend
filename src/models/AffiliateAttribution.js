import mongoose from "mongoose";

const affiliateAttributionSchema = new mongoose.Schema(
  {
    affiliate: { type: mongoose.Schema.Types.ObjectId, ref: "Affiliate", required: true },
    shortCode: { type: String, required: true },
    userType: { type: String, enum: ["company", "jobseeker"], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    email: { type: String, default: "" },
    name: { type: String, default: "" },
    amountPaid: { type: Number, default: 0 },
    couponCode: { type: String, default: "" },
  },
  { timestamps: true }
);

affiliateAttributionSchema.index({ affiliate: 1, userType: 1, user: 1 }, { unique: true });

export default mongoose.model("AffiliateAttribution", affiliateAttributionSchema);
