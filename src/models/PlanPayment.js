import mongoose from "mongoose";

/**
 * Records a Cashfree payment for a plan upgrade or an extra-leads top-up.
 * Separate from SignupPayment so we can audit the two flows independently.
 */
const planPaymentSchema = new mongoose.Schema(
  {
    userType: { type: String, enum: ["company", "jobseeker"], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "userModel" },
    userModel: { type: String, required: true, enum: ["JobSeeker", "Company"] },

    purpose: {
      type: String,
      enum: ["plan", "extra-leads"],
      required: true,
    },

    /* For purpose="plan" */
    planId: { type: String, default: null },   // "3m" | "6m" | "12m"

    /* For purpose="extra-leads" */
    leadsCount: { type: Number, default: 0 },

    orderId: { type: String, required: true },
    paymentId: { type: String, required: true },
    amount: { type: Number, required: true },   // in paise
    currency: { type: String, default: "INR" },

    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "paid",
    },
    dummy: { type: Boolean, default: false },

    /* Auto-expire unpaid records after 1 hour */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

planPaymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
planPaymentSchema.index({ paymentId: 1 }, { unique: true });
planPaymentSchema.index({ userType: 1, user: 1, purpose: 1 });

export default mongoose.model("PlanPayment", planPaymentSchema);