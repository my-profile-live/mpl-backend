/** Mirrors src/data/plans.js from the MPL frontend exactly. */

export const COMPANY_PLANS = [
  { id: "trial", label: "7-Day Free Trial", duration: "7 days", days: 7, price: 0, priceLabel: "Free", leads: 9, badge: null },
  { id: "1m", label: "1 Month", duration: "1 month", days: 30, price: 999, priceLabel: "\u20b9999", leads: 15, badge: null },
  { id: "3m", label: "3 Months", duration: "3 months", days: 90, price: 2549, priceLabel: "\u20b92,549", leads: 50, badge: "recommended" },
  { id: "6m", label: "6 Months", duration: "6 months", days: 180, price: 4549, priceLabel: "\u20b94,549", leads: 120, badge: null },
  { id: "12m", label: "12 Months", duration: "12 months", days: 365, price: 8549, priceLabel: "\u20b98,549", leads: 250, badge: null },
];

export const CANDIDATE_PLANS = [
  { id: "trial", label: "7-Day Free Trial", duration: "7 days", days: 7, price: 0, priceLabel: "Free", leads: 3, badge: null },
  { id: "1m", label: "1 Month", duration: "1 month", days: 30, price: 99, priceLabel: "\u20b999", leads: 10, badge: null },
  { id: "3m", label: "3 Months", duration: "3 months", days: 90, price: 249, priceLabel: "\u20b9249", leads: 35, badge: "recommended" },
  { id: "6m", label: "6 Months", duration: "6 months", days: 180, price: 449, priceLabel: "\u20b9449", leads: 75, badge: null },
  { id: "12m", label: "12 Months", duration: "12 months", days: 365, price: 849, priceLabel: "\u20b9849", leads: 150, badge: null },
];

export const EXTRA_LEAD_PRICING = {
  company: { perLead: 50, minimum: 25, label: "Extra Lead = \u20b950 (minimum 25 leads purchase)" },
  jobseeker: { perLead: 10, minimum: 25, label: "Extra Lead = \u20b910 (minimum 25 leads purchase)" },
};

export const getPlansForUser = (userType) => (userType === "company" ? COMPANY_PLANS : CANDIDATE_PLANS);
export const getPlanById = (userType, planId) => getPlansForUser(userType).find((p) => p.id === planId);
