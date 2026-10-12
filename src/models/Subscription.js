import mongoose from "mongoose";

/**
 * A purchased/activated plan for either a Company or a JobSeeker.
 * `ownerType` + `owner` form a polymorphic reference.
 */
const subscriptionSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ["jobseeker", "company"], required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "ownerModel" },
    ownerModel: { type: String, required: true, enum: ["JobSeeker", "Company"] },

    planId: { type: String, required: true }, // e.g. "trial" | "1m" | "3m" | "6m" | "12m"
    label: String,
    price: Number,
    leadsGranted: Number,

    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.model("Subscription", subscriptionSchema);
