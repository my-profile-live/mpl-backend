import { ApiError } from "../utils/ApiError.js";
import { computePlanState } from "../constants/plans.js";

/**
 * Blocks the request with 402 Payment Required if the user's plan has
 * hard-expired (i.e., grace period is over).
 *
 * Attach AFTER `protect` on routes that should be blocked for expired users.
 * Examples:
 *   router.post("/:id/contact", protect, requireActivePlan, contactCandidate)
 *   router.get("/", protect, requireActivePlan, listCandidates)
 *
 * Not attached to:
 *   - GET /auth/me
 *   - GET /plans
 *   - POST /plans/checkout
 *   - GET /profile/me
 *   (so expired users can still see their account and upgrade)
 */
export function requireActivePlan(req, res, next) {
  const user = req.userDoc;
  if (!user) {
    throw new ApiError(401, "Not authenticated.");
  }

  const state = computePlanState(user);

  if (state.status === "expired") {
    throw new ApiError(
      402,
      "Your plan has expired. Please upgrade to continue using My Profile Live.",
      { code: "PLAN_EXPIRED", planState: state }
    );
  }

  /* Attach so downstream handlers can access without recomputing */
  req.planState = state;
  next();
}