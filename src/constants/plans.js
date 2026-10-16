/* ═══════════════════════════════════════════════════════════════
   PLAN LIFECYCLE CONSTANTS
   ═══════════════════════════════════════════════════════════════
   GRACE_DAYS   → soft period after planExpiry when user can still
                  use the app but sees warnings.
   REMINDER_DAYS_BEFORE → how many days before expiry the reminder
                  modal starts firing.
   ═══════════════════════════════════════════════════════════════ */

export const GRACE_DAYS = 7;
export const REMINDER_DAYS_BEFORE = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the full plan lifecycle state for a user document.
 *
 * Returns:
 *   status              "trial" | "active" | "grace" | "expired"
 *   daysLeft            days until planExpiry (can be negative during grace)
 *   graceDaysRemaining  days remaining in grace (0 if not in grace)
 *   expiredAt           Date of actual expiry (planExpiry)
 *   hardStopAt          Date when grace ends
 *   shouldShowReminder  true if <REMINDER_DAYS_BEFORE> days left and not yet expired
 */
export function computePlanState(userDoc) {
  const plan = userDoc.currentPlan;
  const expiry = userDoc.planExpiry;

  /* No plan at all → hard expired */
  if (!plan || !expiry) {
    return {
      status: "expired",
      daysLeft: 0,
      graceDaysRemaining: 0,
      expiredAt: null,
      hardStopAt: null,
      shouldShowReminder: false,
    };
  }

  const now = Date.now();
  const expiryMs = new Date(expiry).getTime();
  const diffMs = expiryMs - now;
  const daysLeft = Math.ceil(diffMs / MS_PER_DAY);
  const isFree = plan === "1m" || plan === "trial";

  /* ─── Case 1: Not expired yet ─── */
  if (diffMs > 0) {
    return {
      status: isFree ? "trial" : "active",
      daysLeft,
      graceDaysRemaining: 0,
      expiredAt: expiry,
      hardStopAt: null,
      shouldShowReminder: daysLeft <= REMINDER_DAYS_BEFORE,
    };
  }

  /* ─── Case 2: Expired — inside grace? ─── */
  const graceMs = GRACE_DAYS * MS_PER_DAY;
  const graceEndMs = expiryMs + graceMs;
  const graceDiffMs = graceEndMs - now;
  const graceDaysRemaining = Math.ceil(graceDiffMs / MS_PER_DAY);

  if (graceDiffMs > 0) {
    return {
      status: "grace",
      daysLeft,                             // negative
      graceDaysRemaining,
      expiredAt: expiry,
      hardStopAt: new Date(graceEndMs),
      shouldShowReminder: false,
    };
  }

  /* ─── Case 3: Grace over — hard expired ─── */
  return {
    status: "expired",
    daysLeft,
    graceDaysRemaining: 0,
    expiredAt: expiry,
    hardStopAt: new Date(graceEndMs),
    shouldShowReminder: false,
  };
}