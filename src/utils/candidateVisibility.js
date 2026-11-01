/**
 * A job seeker profile is public only after payment.
 * The welcome plan is free for 3 months. A longer plan selected at signup is a paid amount.
 * ₹0, including the account created at email OTP, stays hidden.
 */
export const MIN_PUBLIC_PAYMENT_RUPEES = 1;

export function paidCandidateQuery(now = new Date()) {
  return {
    paymentDone: true,
    paymentAmount: { $gte: MIN_PUBLIC_PAYMENT_RUPEES },
    status: { $ne: "Inactive" },
    currentPlan: { $type: "string", $ne: "" },
    planExpiry: { $gt: now },
  };
}
