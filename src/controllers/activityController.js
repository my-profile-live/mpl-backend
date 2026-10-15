import Interaction from "../models/Interaction.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * GET /api/activity?filter=view|shortlist|contact
 *
 * Job seeker's incoming activity. Matches /api/dashboard/jobseeker exactly:
 *
 *   • Deduplicated by (company + type) at the DB level via aggregation.
 *     - 5 views from Nova Agro → 1 row
 *     - 3 shortlists from Sunrise → 1 row
 *   • Counts are DISTINCT companies per type (same as the dashboard stats).
 *   • Company is MASKED for view/shortlist unless the JS unlocked that company.
 *   • Company is REVEALED for "contact" (they paid to see your contact).
 *
 * Query params:
 *   filter = "view" | "shortlist" | "contact" | "all" (default: all)
 *   page   = number (default: 1)
 *   limit  = number (default: 20, max 100)
 */

/* Only these interaction types are valid for the job seeker's inbound feed.
   "save" and any future types are excluded — the job seeker doesn't need
   to see companies that merely bookmarked them. */
const ALLOWED_TYPES = ["view", "shortlist", "contact"];

export async function jobSeekerActivity(req, res) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const jobSeekerId = req.userDoc._id;

  /* No direction filter here — we want BOTH:
     - company → jobSeeker "contact" (they unlocked YOUR contact)
     - jobSeeker → company "contact" (YOU unlocked THEIR contact)
     Both appear under the "Contact Unlocked" tab. */
  const baseMatch = { jobSeeker: jobSeekerId };

  const rawFilter = req.query.filter;
  const requestedType =
    !rawFilter || rawFilter === "all" ? null : String(rawFilter);
  const filterType =
    requestedType && ALLOWED_TYPES.includes(requestedType)
      ? requestedType
      : null;

  const listMatch = { ...baseMatch };
  if (filterType) {
    listMatch.type = filterType;
  } else {
    listMatch.type = { $in: ALLOWED_TYPES };
  }

  const [
    items,
    totalAgg,
    viewCompanies,
    shortlistCompanies,
    /* Contact-unlocked count = DISTINCT companies where either side did a "contact" */
    contactCompanyIds,
    /* Companies whose contact the JS unlocked → for reveal rule */
    unlockedCompanyIds,
  ] = await Promise.all([
    Interaction.aggregate([
      { $match: listMatch },
      { $sort: { createdAt: -1 } },

      /* Dedupe by (company + type + direction) so both directions can coexist */
      {
        $group: {
          _id: {
            company: "$company",
            type: "$type",
            direction: "$direction",
          },
          latest: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latest" } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },

      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "companyDoc",
        },
      },
      { $unwind: "$companyDoc" },

      {
        $project: {
          _id: 0,
          type: 1,
          direction: 1,
          at: "$createdAt",
          company: {
            _id: "$companyDoc._id",
            companyName: "$companyDoc.companyName",
            companyLogo: "$companyDoc.companyLogo",
            industry: "$companyDoc.industry",
            city: "$companyDoc.city",
            state: "$companyDoc.state",
            companyEmail: "$companyDoc.companyEmail",
            mobileNumber: "$companyDoc.mobileNumber",
          },
        },
      },
    ]),

    /* Total after dedupe */
    Interaction.aggregate([
      { $match: listMatch },
      {
        $group: {
          _id: {
            company: "$company",
            type: "$type",
            direction: "$direction",
          },
        },
      },
      { $count: "total" },
    ]),

    /* Distinct companies who viewed (either direction is fine, but views
       are only logged company→JS so this is naturally company-driven) */
    Interaction.distinct("company", { ...baseMatch, type: "view" }),
    Interaction.distinct("company", { ...baseMatch, type: "shortlist" }),

    /* Contact count = DISTINCT companies that appear in either contact direction */
    Interaction.distinct("company", { ...baseMatch, type: "contact" }),

    /* Companies whose contact the JS has unlocked */
    Interaction.find({
      jobSeeker: jobSeekerId,
      type: "contact",
      direction: "jobseeker_to_company",
    }).distinct("company"),
  ]);

  const total = totalAgg?.[0]?.total || 0;
  const unlockedSet = new Set(unlockedCompanyIds.map(String));

  const results = items.map((it) => {
    const companyId = it.company?._id?.toString();
    const isCompanyUnlocked = companyId ? unlockedSet.has(companyId) : false;

    /* Reveal ONLY if the JOB SEEKER unlocked this company.
       What the company did (view/shortlist/contact) is IRRELEVANT
       for what the job seeker is allowed to see. */
    const isRevealed = isCompanyUnlocked;

    if (!isRevealed && it.company) {
      /* Hide company name too — otherwise the "A company" placeholder
         logic on the frontend never fires. */
      it.company = {
        ...it.company,
        companyName: null,
        companyEmail: null,
        mobileNumber: null,
      };
    }

    /* Attach a boolean the frontend can rely on directly */
    it.isRevealed = isRevealed;

    /* Keep the original direction so the frontend can render an
       appropriate label ("Company unlocked your contact" vs
       "You unlocked this company's contact"). */
    return it;
  });

  const allCompaniesSet = new Set([
    ...viewCompanies.map(String),
    ...shortlistCompanies.map(String),
    ...contactCompanyIds.map(String),
  ]);

  res.json(
    new ApiResponse(200, {
      results,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      counts: {
        all: allCompaniesSet.size,
        view: viewCompanies.length,
        shortlist: shortlistCompanies.length,
        contact: contactCompanyIds.length,
      },
    })
  );
}

/**
 * GET /api/company/activity?filter=save|shortlist|contact
 *
 * Company's outgoing activity. Excludes "view" — those are logged for
 * stats only and would clutter the company's own action feed.
 */
export async function companyActivity(req, res) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const filter = { company: req.user.id, direction: "company_to_jobseeker" };

  if (req.query.filter && req.query.filter !== "all") {
    /* Whitelist: only these three are valid for the company activity feed. */
    const allowed = ["save", "shortlist", "contact"];
    const requested = String(req.query.filter);

    if (!allowed.includes(requested)) {
      return res.json(
        new ApiResponse(200, {
          results: [],
          page,
          limit,
          total: 0,
          totalPages: 0,
        })
      );
    }

    filter.type = requested;
  } else {
    /* "all" → only the meaningful actions, never views */
    filter.type = { $in: ["save", "shortlist", "contact"] };
  }

  const [items, total] = await Promise.all([
    Interaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: "jobSeeker",
        select:
          "fullName photo currentJobTitle currentCompany city state " +
          "mobileNumber email",
      }),
    Interaction.countDocuments(filter),
  ]);

  res.json(
    new ApiResponse(200, {
      results: items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  );
}