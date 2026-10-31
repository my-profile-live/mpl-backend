import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    tag: { type: String, required: true, trim: true },
    discountPercent: { type: Number, required: true, min: 1, max: 100 },
    appliesTo: { type: String, enum: ["company", "jobseeker", "both"], default: "both" },
    usage: { type: String, enum: ["once", "repeat"], default: "once" },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    affiliate: { type: mongoose.Schema.Types.ObjectId, ref: "Affiliate", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Coupon", couponSchema);
