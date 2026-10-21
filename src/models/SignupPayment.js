import mongoose from "mongoose";

const signupPaymentSchema = new mongoose.Schema(
  {
    userType: {
      type: String,
      enum: ["company", "jobseeker"],
      required: true,
    },
    orderId: { type: String, required: true },
    paymentId: { type: String, required: true },
    amount: { type: Number, required: true },
    /** 1m is the verification plan. 3m, 6m, and 12m are purchased at signup. */
    planId: { type: String, default: "1m" },
    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "paid",
    },
    dummy: { type: Boolean, default: false },
    /** Payer details captured when the Cashfree order was created. */
    customerEmail: { type: String, default: null },
    customerPhone: { type: String, default: null },
    /** Set once a user account consumes this payment, so it cannot be reused. */
    consumedBy: { type: mongoose.Schema.Types.ObjectId, default: null },

    /**
     * TTL — the payment record auto-expires after 1 hour.
     * Signup must happen within that window.
     */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

signupPaymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
signupPaymentSchema.index({ paymentId: 1 }, { unique: true });
signupPaymentSchema.index({ userType: 1, status: 1 });

export default mongoose.model("SignupPayment", signupPaymentSchema);