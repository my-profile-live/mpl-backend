import JobSeeker from "../models/JobSeeker.js";
import Interaction from "../models/Interaction.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const PUBLIC_FIELDS =
  "fullName photo currentJobTitle currentCompany totalExperience relevantExperience " +
  "expectedSalary noticePeriod preferredIndustry preferredJobState preferredJobCity jobType wfh " +
  "languagesKnown employmentHistory education skills hobbies willingToTravel readyToRelocate " +
  "immediateJoining state district city pinCode about gender profileCompletion status createdAt " +
  "mobileNumber email";

function maskMobile(mobile) {
  if (!mobile) return null;
  return `${mobile.slice(0, 5)}XXXXX`;
}
function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(user.length - 2, 2))}@${domain}`;
}

/** Hides direct contact details until the company has spent a lead to "contact" this candidate. */
function maskContactInfo(candidateObj, isContacted) {
  if (isContacted) return candidateObj;
  return {
    ...candidateObj,
    mobileNumber: maskMobile(candidateObj.mobileNumber),
    email: maskEmail(candidateObj.email),
  };
}

/** Builds a Mongo filter object from FilterSidebar.jsx's query params. */
function buildFilter(query) {
  const filter = {};
  if (query.industry) filter.preferredIndustry = query.industry;
  if (query.state) filter.state = query.state;
  if (query.district) filter.district = query.district;
  if (query.experience) filter.totalExperience = query.experience;
  if (query.noticePeriod) filter.noticePeriod = query.noticePeriod;
  if (query.wfh) filter.wfh = query.wfh;
  if (query.education) filter["education.qualification"] = query.education;
  if (query.immediateJoiner === "true") filter.immediateJoining = true;
  if (query.search) filter.$text = { $search: query.search };
  return filter;
}

/** GET /api/candidates — browse & filter (company only). */
export async function listCandidates(req, res) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 12, 50);
  const filter = buildFilter(req.query);

  const [candidates, total] = await Promise.all([
    JobSeeker.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    JobSeeker.countDocuments(filter),
  ]);

  const contactedIds = new Set(
    (await Interaction.find({ company: req.user.id, type: "contact" }).distinct("jobSeeker")).map(String)
  );

  const results = candidates.map((c) =>
    maskContactInfo(c.toObject(), contactedIds.has(c._id.toString()))
  );

  res.json(
    new ApiResponse(200, {
      results,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  );
}

/** GET /api/candidates/:id — detail view. Logs a "view" interaction. */
export async function getCandidate(req, res) {
  const candidate = await JobSeeker.findById(req.params.id).select(PUBLIC_FIELDS);
  if (!candidate) throw new ApiError(404, "Candidate not found.");

  await Interaction.create({ company: req.user.id, jobSeeker: candidate._id, type: "view" });

  const isContacted = !!(await Interaction.exists({
    company: req.user.id,
    jobSeeker: candidate._id,
    type: "contact",
  }));
  const [isSaved, isShortlisted] = await Promise.all([
    Interaction.exists({ company: req.user.id, jobSeeker: candidate._id, type: "save" }),
    Interaction.exists({ company: req.user.id, jobSeeker: candidate._id, type: "shortlist" }),
  ]);

  res.json(
    new ApiResponse(200, {
      candidate: maskContactInfo(candidate.toObject(), isContacted),
      isSaved: !!isSaved,
      isShortlisted: !!isShortlisted,
      isContacted,
    })
  );
}

/** POST /api/candidates/:id/save — toggles save. */
export async function toggleSaveCandidate(req, res) {
  const jobSeeker = req.params.id;
  const existing = await Interaction.findOne({ company: req.user.id, jobSeeker, type: "save" });

  if (existing) {
    await existing.deleteOne();
    return res.json(new ApiResponse(200, { saved: false }, "Removed from saved candidates."));
  }
  await Interaction.create({ company: req.user.id, jobSeeker, type: "save" });
  res.json(new ApiResponse(200, { saved: true }, "Candidate saved."));
}

/** POST /api/candidates/:id/shortlist — toggles shortlist. */
export async function toggleShortlistCandidate(req, res) {
  const jobSeeker = req.params.id;
  const existing = await Interaction.findOne({ company: req.user.id, jobSeeker, type: "shortlist" });

  if (existing) {
    await existing.deleteOne();
    return res.json(new ApiResponse(200, { shortlisted: false }, "Removed from shortlist."));
  }
  await Interaction.create({ company: req.user.id, jobSeeker, type: "shortlist" });
  res.json(new ApiResponse(200, { shortlisted: true }, "Candidate shortlisted."));
}

/** POST /api/candidates/:id/contact — spends 1 lead to reveal contact details. */
export async function contactCandidate(req, res) {
  const jobSeeker = req.params.id;
  const company = req.userDoc;

  const already = await Interaction.exists({ company: company._id, jobSeeker, type: "contact" });
  if (already) {
    const candidate = await JobSeeker.findById(jobSeeker).select(PUBLIC_FIELDS);
    return res.json(new ApiResponse(200, { candidate: candidate.toObject(), leadsRemaining: company.leadsRemaining }, "Already contacted."));
  }

  if (company.leadsRemaining <= 0) {
    throw new ApiError(402, "You have no leads remaining. Please upgrade your plan to contact more candidates.");
  }

  const candidate = await JobSeeker.findById(jobSeeker).select(PUBLIC_FIELDS);
  if (!candidate) throw new ApiError(404, "Candidate not found.");

  await Interaction.create({ company: company._id, jobSeeker, type: "contact" });
  company.leadsRemaining -= 1;
  await company.save();

  res.json(
    new ApiResponse(200, { candidate: candidate.toObject(), leadsRemaining: company.leadsRemaining }, "Contact details unlocked.")
  );
}

/** GET /api/candidates/saved — company's saved candidates list. */
export async function listSavedCandidates(req, res) {
  const saves = await Interaction.find({ company: req.user.id, type: "save" })
    .sort({ createdAt: -1 })
    .populate({ path: "jobSeeker", select: PUBLIC_FIELDS });

  res.json(new ApiResponse(200, { results: saves.map((s) => s.jobSeeker).filter(Boolean) }));
}

/** GET /api/candidates/shortlisted — company's shortlisted candidates list. */
export async function listShortlistedCandidates(req, res) {
  const items = await Interaction.find({ company: req.user.id, type: "shortlist" })
    .sort({ createdAt: -1 })
    .populate({ path: "jobSeeker", select: PUBLIC_FIELDS });

  res.json(new ApiResponse(200, { results: items.map((i) => i.jobSeeker).filter(Boolean) }));
}
