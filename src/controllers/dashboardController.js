import { computePlanState } from "../constants/plans.js";
import Interaction from "../models/Interaction.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * GET /api/dashboard/jobseeker
 *
 * Stats & recentActivity rules:
 *   • Deduplicated by COMPANY per interaction type:
 *     - 5 views from Nova Agro → counts as 1 view
 *     - 3 shortlists from Sunrise → counts as 1 shortlist
 *     - 2 contacts from Zenith    → counts as 1 contact
 *   • recentActivity is limited to the newest 5 (one per company+type).
 *   • Company name is MASKED unless the interaction is "contact":
 *     - "view" / "shortlist" → company = null (frontend shows "A company")
 *     - "contact"            → company revealed with full info
 */
export async function jobSeekerDashboard(req, res) {
  const jobSeekerId = req.userDoc._id;

  /* ─── 1) Distinct-company counts (stat cards) ─── */
  const [viewCompanies, shortlistCompanies, contactCompanies, recentAgg] =
    await Promise.all([
      /* Distinct companies who viewed */
      Interaction.distinct("company", { jobSeeker: jobSeekerId, type: "view" }),

      /* Distinct companies who shortlisted */
      Interaction.distinct("company", {
        jobSeeker: jobSeekerId,
        type: "shortlist",
      }),

      /* Distinct companies who unlocked contact */
      Interaction.distinct("company", {
        jobSeeker: jobSeekerId,
        type: "contact",
      }),

      /* Recent activity — deduped by (company + type) + limit 5 */
      Interaction.aggregate([
        {
          $match: {
            jobSeeker: jobSeekerId,
            type: { $in: ["view", "shortlist", "contact"] },
          },
        },

        /* Sort newest first so $first grabs the latest per group */
        { $sort: { createdAt: -1 } },

        /* One doc per (company + type) combination */
        {
          $group: {
            _id: { company: "$company", type: "$type" },
            latest: { $first: "$$ROOT" },
          },
        },

        /* Flatten */
        { $replaceRoot: { newRoot: "$latest" } },

        /* Global sort → newest 5 */
        { $sort: { createdAt: -1 } },
        { $limit: 5 },

        /* Join company details */
        {
          $lookup: {
            from: "companies",
            localField: "company",
            foreignField: "_id",
            as: "companyDoc",
          },
        },
        { $unwind: "$companyDoc" },

        /* Shape response + decide masking */
        {
          $project: {
            _id: 0,
            type: 1,
            at: "$createdAt",
            /* contact → reveal; view/shortlist → mask */
            company: {
              $cond: [
                { $eq: ["$type", "contact"] },
                {
                  _id: "$companyDoc._id",
                  companyName: "$companyDoc.companyName",
                  companyLogo: "$companyDoc.companyLogo",
                  industry: "$companyDoc.industry",
                  city: "$companyDoc.city",
                  state: "$companyDoc.state",
                },
                "$$REMOVE",
              ],
            },
            isRevealed: { $eq: ["$type", "contact"] },
          },
        },
      ]),
    ]);

  res.json(
    new ApiResponse(200, {
      completion: req.userDoc.profileCompletion,
      leadsRemaining: req.userDoc.leadsRemaining ?? 0,
      plan: computePlanState(req.userDoc),
      stats: {
        profileViews: viewCompanies.length,
        shortlists: shortlistCompanies.length,
        interviewInvites: contactCompanies.length,
      },
      recentActivity: recentAgg,
    })
  );
}

/**
 * GET /api/dashboard/company
 *
 * recentActivity rules:
 *   • Excludes "view" — dashboard shows only actions the company took.
 *   • Deduplicated by candidate — one row per jobSeeker, latest action.
 *   • Limited to 5 rows.
 */
export async function companyDashboard(req, res) {
  const company = req.user.id;

  const [savedIds, shortlistedIds, contactedIds, recentAgg] = await Promise.all([
    Interaction.distinct("jobSeeker", { company, type: "save" }),
    Interaction.distinct("jobSeeker", { company, type: "shortlist" }),
    Interaction.distinct("jobSeeker", { company, type: "contact" }),

    Interaction.aggregate([
      {
        $match: {
          company: req.userDoc._id,
          type: { $in: ["save", "shortlist", "contact"] },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$jobSeeker",
          latest: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latest" } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "jobseekers",
          localField: "jobSeeker",
          foreignField: "_id",
          as: "jobSeekerDoc",
        },
      },
      { $unwind: "$jobSeekerDoc" },
      {
        $project: {
          _id: 0,
          type: 1,
          at: "$createdAt",
          jobSeeker: {
            _id: "$jobSeekerDoc._id",
            fullName: "$jobSeekerDoc.fullName",
            photo: "$jobSeekerDoc.photo",
            currentJobTitle: "$jobSeekerDoc.currentJobTitle",
          },
        },
      },
    ]),
  ]);

  res.json(
    new ApiResponse(200, {
      status: req.userDoc.status,
      leadsRemaining: req.userDoc.leadsRemaining,
      plan: computePlanState(req.userDoc),   // ⬅️ new
      stats: {
        saved: savedIds.length,
        shortlisted: shortlistedIds.length,
        contacted: contactedIds.length,
        activeJobs: 0,
      },
      recentActivity: recentAgg,
    })
  );
}