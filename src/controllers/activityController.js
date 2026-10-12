import Interaction from "../models/Interaction.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/** GET /api/activity?filter=view|shortlist|contact — job seeker's incoming activity. */
export async function jobSeekerActivity(req, res) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const filter = { jobSeeker: req.user.id };
  if (req.query.filter && req.query.filter !== "all") filter.type = req.query.filter;

  const [items, total] = await Promise.all([
    Interaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "company", select: "companyName companyLogo industry city state" }),
    Interaction.countDocuments(filter),
  ]);

  res.json(new ApiResponse(200, { results: items, page, limit, total, totalPages: Math.ceil(total / limit) }));
}

/** GET /api/company/activity?filter=view|save|shortlist|contact — company's outgoing activity. */
export async function companyActivity(req, res) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const filter = { company: req.user.id };
  if (req.query.filter && req.query.filter !== "all") filter.type = req.query.filter;

  const [items, total] = await Promise.all([
    Interaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "jobSeeker", select: "fullName photo currentJobTitle currentCompany city state" }),
    Interaction.countDocuments(filter),
  ]);

  res.json(new ApiResponse(200, { results: items, page, limit, total, totalPages: Math.ceil(total / limit) }));
}
