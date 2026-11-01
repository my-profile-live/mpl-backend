/* ═══════════════════════════════════════════════════════════════
   PLAN CONFIGURATION
   - id "1m" is the welcome plan granted at signup.
     Company and job seeker: a free 3-month plan. Company: 15 leads. Job seeker: 10 credits.
   - "recommended" badge sits on the 6-Month plan for both roles
   - `days` is required by the backend for expiry math
   ═══════════════════════════════════════════════════════════════ */

export const COMPANY_PLANS = [
  {
    id: "1m",
    label: "3 Months",
    duration: "3 months",
    days: 90,
    price: 0,
    priceLabel: "Free",
    leads: 15,
    badge: null,
  },
  {
    id: "3m",
    label: "3 Months",
    duration: "3 months",
    days: 90,
    price: 2549,
    priceLabel: "₹2,549",
    leads: 50,
    badge: null,
  },
  {
    id: "6m",
    label: "6 Months",
    duration: "6 months",
    days: 180,
    price: 4549,
    priceLabel: "₹4,549",
    leads: 120,
    badge: "recommended",
  },
  {
    id: "12m",
    label: "12 Months",
    duration: "12 months",
    days: 365,
    price: 8549,
    priceLabel: "₹8,549",
    leads: 250,
    badge: null,
  },
  {
    id: "10k",
    label: "₹10,000 Plan",
    duration: "12 months",
    days: 365,
    price: 10000,
    priceLabel: "₹10,000",
    leads: 300,
    badge: null,
  },
];

export const CANDIDATE_PLANS = [
  {
    id: "1m",
    label: "3 Months",
    duration: "3 months",
    days: 90,
    price: 99,
    priceLabel: "₹99",
    leads: 10,
    badge: null,
  },
  {
    id: "3m",
    label: "3 Months",
    duration: "3 months",
    days: 90,
    price: 249,
    priceLabel: "₹249",
    leads: 35,
    badge: null,
  },
  {
    id: "6m",
    label: "6 Months",
    duration: "6 months",
    days: 180,
    price: 449,
    priceLabel: "₹449",
    leads: 75,
    badge: "recommended",
  },
  {
    id: "12m",
    label: "12 Months",
    duration: "12 months",
    days: 365,
    price: 849,
    priceLabel: "₹849",
    leads: 150,
    badge: null,
  },
];

export const EXTRA_LEAD_PRICING = {
  company: {
    perLead: 50,
    minimum: 25,
    label: "Extra Lead = ₹50 (minimum 25 leads purchase)",
  },
  jobseeker: {
    perLead: 10,
    minimum: 25,
    label: "Extra Lead = ₹10 (minimum 25 leads purchase)",
  },
};

export const getPlansForUser = (userType) =>
  userType === "company" ? COMPANY_PLANS : CANDIDATE_PLANS;

export const getPlanById = (userType, planId) =>
  getPlansForUser(userType).find((p) => p.id === planId);

/* 🎁 The free plan every new user gets on signup.
   Welcome plan id. Job seekers receive 90 days. Companies receive a free 90-day plan. */
export const DEFAULT_FREE_PLAN_ID = "1m";