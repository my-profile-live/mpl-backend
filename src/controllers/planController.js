import Subscription from "../models/Subscription.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getPlansForUser, getPlanById, EXTRA_LEAD_PRICING } from "../data/plans.js";

/** GET /api/plans — plan list for the caller's role. */
export async function getPlans(req, res) {
  res.json(
    new ApiResponse(200, {
      plans: getPlansForUser(req.user.role),
      extraLeadPricing: EXTRA_LEAD_PRICING[req.user.role],
    })
  );
}

/** GET /api/plans/my-subscription */
export async function getMySubscription(req, res) {
  const sub = await Subscription.findOne({ owner: req.user.id, status: "active" }).sort({ createdAt: -1 });
  res.json(
    new ApiResponse(200, {
      subscription: sub,
      leadsRemaining: req.userDoc.leadsRemaining,
      currentPlan: req.userDoc.currentPlan,
      planExpiry: req.userDoc.planExpiry,
    })
  );
}

/**
 * POST /api/plans/subscribe { planId }
 * Dummy activation (mirrors the frontend's PlansModal, which has no real
 * payment gateway wired up yet). Plug a gateway (Razorpay/Stripe) in here
 * before charging real money — this just activates the plan immediately.
 */
export async function subscribeToPlan(req, res) {
  const { planId } = req.body;
  const plan = getPlanById(req.user.role, planId);
  if (!plan) throw new ApiError(400, "Unknown plan.");

  const user = req.userDoc;
  const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000);

  await Subscription.create({
    ownerType: req.user.role,
    owner: user._id,
    ownerModel: req.user.role === "company" ? "Company" : "JobSeeker",
    planId: plan.id,
    label: plan.label,
    price: plan.price,
    leadsGranted: plan.leads,
    expiresAt,
  });

  user.currentPlan = plan.id;
  user.planExpiry = expiresAt;
  user.leadsRemaining = (user.leadsRemaining || 0) + plan.leads;
  await user.save();

  res.json(
    new ApiResponse(200, {
      currentPlan: user.currentPlan,
      planExpiry: user.planExpiry,
      leadsRemaining: user.leadsRemaining,
    }, `${plan.label} activated.`)
  );
}

/**
 * POST /api/plans/buy-extra-leads { count }
 * Dummy top-up purchase at the per-lead rate from EXTRA_LEAD_PRICING.
 */
export async function buyExtraLeads(req, res) {
  const count = Number(req.body.count);
  const pricing = EXTRA_LEAD_PRICING[req.user.role];
  if (!count || count < pricing.minimum) {
    throw new ApiError(400, `Minimum purchase is ${pricing.minimum} leads.`);
  }

  const user = req.userDoc;
  user.leadsRemaining = (user.leadsRemaining || 0) + count;
  await user.save();

  res.json(
    new ApiResponse(200, {
      leadsRemaining: user.leadsRemaining,
      amountCharged: count * pricing.perLead,
    }, `${count} extra leads added.`)
  );
}
