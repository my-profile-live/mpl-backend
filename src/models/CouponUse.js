import mongoose from "mongoose";

const couponUseSchema = new mongoose.Schema(
  {
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: true },
    code: { type: String, required: true },
    userType: { type: String, enum: ["company", "jobseeker"], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    email: { type: String, default: "" },
    name: { type: String, default: "" },
    amountPaid: { type: Number, default: 0 },
    paymentId: { type: String, default: "" },
    affiliate: { type: mongoose.Schema.Types.ObjectId, ref: "Affiliate", default: null },
  },
  { timestamps: true }
);

couponUseSchema.index({ coupon: 1, userType: 1, user: 1 });
couponUseSchema.index({ coupon: 1, paymentId: 1 });

export default mongoose.model("CouponUse", couponUseSchema);
