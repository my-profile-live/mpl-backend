import JobSeeker from "../models/JobSeeker.js";
import Company from "../models/Company.js";
import Interaction from "../models/Interaction.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { assertObjectId } from "../utils/objectId.js";
import { ensurePublicSlug, PUBLIC_SLUG_RE } from "../utils/publicSlug.js";
import { planIsLive } from "../constants/plans.js";

const PUBLIC_FIELDS =
  "fullName photo currentJobTitle currentCompany totalExperience relevantExperience " +
  "expectedSalary noticePeriod preferredIndustry preferredJobState preferredJobCity jobType wfh " +
  "languagesKnown employmentHistory education skills hobbies willingToTravel readyToRelocate " +
  "immediateJoining state district city pinCode about gender profileCompletion status createdAt " +
  "mobileNumber email publicSlug";


const PUBLIC_SHARE_FIELDS =
  "fullName photo currentJobTitle currentCompany totalExperience relevantExperience " +
  "expectedSalary noticePeriod preferredIndustry preferredJobState preferredJobCity jobType wfh " +
  "languagesKnown employmentHistory education skills hobbies willingToTravel readyToRelocate " +
  "immediateJoining state district city about gender profileCompletion status createdAt";

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

/** Company-initiated contact only. A job seeker unlocking the company must not reveal the candidate. */
const COMPANY_CONTACT = {
  type: "contact",
  direction: { $ne: "jobseeker_to_company" },
};

async function contactedIdSet(companyId, jobSeekerIds) {
  const query = { company: companyId, ...COMPANY_CONTACT };
  if (jobSeekerIds) query.jobSeeker = { $in: jobSeekerIds };
  const ids = await Interaction.find(query).distinct("jobSeeker");
  return new Set(ids.map(String));
}

function presentCandidate(doc, contactedIds, savedIds = null) {
  const obj = doc.toObject ? doc.toObject() : doc;
  const id = String(obj._id);
  const presented = { ...maskContactInfo(obj, contactedIds.has(id)), isContacted: contactedIds.has(id) };
  if (savedIds) presented.isSaved = savedIds.has(id);
  return presented;
}

async function interactionIdSet(companyId, type, jobSeekerIds) {
  const query = { company: companyId, type };
  if (jobSeekerIds?.length) query.jobSeeker = { $in: jobSeekerIds };
  const ids = await Interaction.find(query).distinct("jobSeeker");
  return new Set(ids.map(String));
}

async function requireCandidate(id) {
  assertObjectId(id, "candidate id");
  const candidate = await JobSeeker.findById(id).select(PUBLIC_FIELDS);
  if (!candidate) throw new ApiError(404, "Candidate not found.");
  return candidate;
}

/** Builds a Mongo filter object from FilterSidebar.jsx's query params. */
function buildFilter(query) {
  const filter = {};

  /* Text fields */
  if (query.industry) filter.preferredIndustry = query.industry;
  if (query.state) filter.state = query.state;
  if (query.district) filter.district = query.district;
  if (query.experience) filter.totalExperience = query.experience;
  if (query.noticePeriod) filter.noticePeriod = query.noticePeriod;
  if (query.wfh) filter.wfh = query.wfh;
  if (query.education) filter["education.qualification"] = query.education;
  if (query.immediateJoiner === "true") filter.immediateJoining = true;

  /* Expected salary is stored as a string (for example "9.5"). Compare it numerically.
     Candidates with a blank or non-numeric salary are skipped once a bound is set. */
  const minSalary = Number(query.minSalary);
  const maxSalary = Number(query.maxSalary);
  const hasMin = query.minSalary != null && query.minSalary !== "" && Number.isFinite(minSalary);
  const hasMax = query.maxSalary != null && query.maxSalary !== "" && Number.isFinite(maxSalary) && maxSalary > 0;
  if (hasMin || hasMax) {
    const salaryValue = {
      $convert: {
        input: "$expectedSalary",
        to: "double",
        onError: null,
        onNull: null,
      },
    };
    const checks = [
      { $ne: ["$expectedSalary", null] },
      { $ne: ["$expectedSalary", ""] },
      { $ne: [salaryValue, null] },
    ];
    if (hasMin) checks.push({ $gte: [salaryValue, minSalary] });
    if (hasMax) checks.push({ $lte: [salaryValue, maxSalary] });
    filter.$expr = { $and: checks };
  }

  /* Skills — array of skills; candidate must have ALL of them */
  if (query.skills) {
    const skills = Array.isArray(query.skills)
      ? query.skills
      : String(query.skills)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (skills.length > 0) {
      filter.skills = { $all: skills };
    }
  }

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

  const ids = candidates.map((c) => c._id);
  const [contactedIds, savedIds] = await Promise.all([
    contactedIdSet(req.user.id, ids),
    interactionIdSet(req.user.id, "save", ids),
  ]);
  const results = candidates.map((c) => presentCandidate(c, contactedIds, savedIds));

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
  const candidate = await requireCandidate(req.params.id);

  await Interaction.create({ company: req.user.id, jobSeeker: candidate._id, type: "view" });

  const isContacted = !!(await Interaction.exists({
    company: req.user.id,
    jobSeeker: candidate._id,
    ...COMPANY_CONTACT,
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
  await requireCandidate(jobSeeker);
  const existing = await Interaction.findOne({ company: req.user.id, jobSeeker, type: "save" });

  if (existing) {
    await existing.deleteOne();
    return res.json(new ApiResponse(200, { saved: false }, "Removed from saved candidates."));
  }
  try {
    await Interaction.create({ company: req.user.id, jobSeeker, type: "save" });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
  res.json(new ApiResponse(200, { saved: true }, "Candidate saved."));
}

/** POST /api/candidates/:id/shortlist — toggles shortlist. */
export async function toggleShortlistCandidate(req, res) {
  const jobSeeker = req.params.id;
  await requireCandidate(jobSeeker);
  const existing = await Interaction.findOne({ company: req.user.id, jobSeeker, type: "shortlist" });

  if (existing) {
    await existing.deleteOne();
    return res.json(new ApiResponse(200, { shortlisted: false }, "Removed from shortlist."));
  }
  try {
    await Interaction.create({ company: req.user.id, jobSeeker, type: "shortlist" });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
  res.json(new ApiResponse(200, { shortlisted: true }, "Candidate shortlisted."));
}

/** POST /api/candidates/:id/contact — spends 1 lead to reveal contact details. */
export async function contactCandidate(req, res) {
  const jobSeeker = req.params.id;
  const candidate = await requireCandidate(jobSeeker);
  const companyId = req.userDoc._id;

  const already = await Interaction.exists({
    company: companyId,
    jobSeeker,
    ...COMPANY_CONTACT,
  });
  if (already) {
    const fresh = await Company.findById(companyId).select("leadsRemaining");
    return res.json(
      new ApiResponse(
        200,
        { candidate: candidate.toObject(), leadsRemaining: fresh?.leadsRemaining ?? 0 },
        "Already contacted."
      )
    );
  }

  /* Record the unlock before charging so two clicks cannot spend two leads. */
  try {
    await Interaction.create({
      company: companyId,
      jobSeeker,
      type: "contact",
      direction: "company_to_jobseeker",
    });
  } catch (err) {
    if (err?.code === 11000) {
      const fresh = await Company.findById(companyId).select("leadsRemaining");
      return res.json(
        new ApiResponse(
          200,
          { candidate: candidate.toObject(), leadsRemaining: fresh?.leadsRemaining ?? 0 },
          "Already contacted."
        )
      );
    }
    throw err;
  }

  const updated = await Company.findOneAndUpdate(
    { _id: companyId, leadsRemaining: { $gt: 0 } },
    { $inc: { leadsRemaining: -1 } },
    { new: true }
  );
  if (!updated) {
    await Interaction.deleteOne({
      company: companyId,
      jobSeeker,
      type: "contact",
      direction: "company_to_jobseeker",
    });
    throw new ApiError(402, "You have no leads remaining. Please upgrade your plan to contact more candidates.");
  }

  res.json(
    new ApiResponse(
      200,
      { candidate: candidate.toObject(), leadsRemaining: updated.leadsRemaining },
      "Contact details unlocked."
    )
  );
}

/** GET /api/candidates/saved — company's saved candidates list. */
export async function listSavedCandidates(req, res) {
  const saves = await Interaction.find({ company: req.user.id, type: "save" })
    .sort({ createdAt: -1 })
    .populate({ path: "jobSeeker", select: PUBLIC_FIELDS });

  const docs = saves.map((s) => s.jobSeeker).filter(Boolean);
  const docIds = docs.map((d) => d._id);
  const contactedIds = await contactedIdSet(req.user.id, docIds);
  const savedIds = new Set(docIds.map(String));
  res.json(new ApiResponse(200, { results: docs.map((d) => presentCandidate(d, contactedIds, savedIds)) }));
}

/** GET /api/candidates/shortlisted — company's shortlisted candidates list. */
export async function listShortlistedCandidates(req, res) {
  const items = await Interaction.find({ company: req.user.id, type: "shortlist" })
    .sort({ createdAt: -1 })
    .populate({ path: "jobSeeker", select: PUBLIC_FIELDS });

  const docs = items.map((i) => i.jobSeeker).filter(Boolean);
  const contactedIds = await contactedIdSet(
    req.user.id,
    docs.map((d) => d._id)
  );
  res.json(new ApiResponse(200, { results: docs.map((d) => presentCandidate(d, contactedIds)) }));
}


/**
 * GET /api/candidates/search?q=React+developer&page=1&limit=12
 *
 * Free-text search across name, job title, current company, and skills.
 * - Case-insensitive, partial word match
 * - Splits the query into words → OR-matches across fields
 * - Example: "React developer" matches:
 *     currentJobTitle ~ /React/ OR /developer/
 *     skills ~ /React/ OR /developer/
 *     fullName ~ /React/ OR /developer/
 *     currentCompany ~ /React/ OR /developer/
 */
export async function searchCandidates(req, res) {
  const q = (req.query.q || "").trim();
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 12, 50);

  if (!q) {
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

  /* Split into words, escape regex special chars, drop short noise */
  const words = q
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter((w) => w.length >= 2);

  if (words.length === 0) {
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

  /* OR across every word and every searchable field */
  const orConditions = [];
  for (const w of words) {
    const rx = new RegExp(w, "i");
    orConditions.push(
      { fullName: rx },
      { currentJobTitle: rx },
      { currentCompany: rx },
      { skills: rx },
      { preferredIndustry: rx },
      { about: rx }
    );
  }

  const filter = { $or: orConditions };

  const [candidates, total] = await Promise.all([
    JobSeeker.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    JobSeeker.countDocuments(filter),
  ]);

  const ids = candidates.map((c) => c._id);
  const [contactedIds, savedIds] = await Promise.all([
    contactedIdSet(req.user.id, ids),
    interactionIdSet(req.user.id, "save", ids),
  ]);
  const results = candidates.map((c) => presentCandidate(c, contactedIds, savedIds));

  res.json(
    new ApiResponse(200, {
      results,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      query: q,
    })
  );
}

function readSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  if (
    !PUBLIC_SLUG_RE.test(slug) ||
    slug.length > 80 ||
    /^[a-f0-9]{24}$/.test(slug)
  ) {
    return null;
  }
  return slug;
}

/** Fields a stranger is allowed to see. Contact and account data never leave this list. */
function toPublicProfile(doc) {
  const src = doc || {};
  const history = Array.isArray(src.employmentHistory)
    ? src.employmentHistory.map((job) => ({
        companyName: job.companyName || "",
        designation: job.designation || "",
        joiningDate: job.joiningDate || "",
        leavingDate: job.leavingDate || "",
        experience: job.experience || "",
        responsibilities: job.responsibilities || "",
      }))
    : [];
  const education = Array.isArray(src.education)
    ? src.education.map((item) => ({
        qualification: item.qualification || "",
        specialization: item.specialization || "",
        college: item.college || "",
        university: item.university || "",
        passingYear: item.passingYear || "",
        percentage: item.percentage || "",
      }))
    : [];

  return {
    publicSlug: src.publicSlug,
    fullName: src.fullName,
    photo: src.photo || null,
    currentJobTitle: src.currentJobTitle || "",
    currentCompany: src.currentCompany || "",
    totalExperience: src.totalExperience || "",
    relevantExperience: src.relevantExperience || "",
    expectedSalary: src.expectedSalary || "",
    noticePeriod: src.noticePeriod || "",
    preferredIndustry: src.preferredIndustry || "",
    jobType: src.jobType || "",
    wfh: src.wfh || "",
    languagesKnown: src.languagesKnown || [],
    skills: src.skills || [],
    hobbies: src.hobbies || [],
    willingToTravel: !!src.willingToTravel,
    readyToRelocate: !!src.readyToRelocate,
    immediateJoining: !!src.immediateJoining,
    state: src.state || "",
    district: src.district || "",
    city: src.city || "",
    about: src.about || "",
    gender: src.gender || "",
    employmentHistory: history,
    education,
    isEmailVerified: !!src.isEmailVerified,
    isMobileVerified: !!src.isMobileVerified,
  };
}

export async function getPublicProfile(req, res) {
  const slug = readSlug(req.params.slug);
  if (!slug) throw new ApiError(404, "Profile not found.");

  const candidate = await JobSeeker.findOne({
    publicSlug: slug,
    status: { $ne: "Inactive" },
  })
    .select(
      "publicSlug fullName photo currentJobTitle currentCompany totalExperience relevantExperience " +
        "expectedSalary noticePeriod preferredIndustry jobType wfh languagesKnown skills hobbies " +
        "willingToTravel readyToRelocate immediateJoining state district city about gender " +
        "employmentHistory education isEmailVerified isMobileVerified currentPlan planExpiry"
    )
    .lean();

  if (!candidate || !planIsLive(candidate)) {
    throw new ApiError(404, "This profile is unavailable. The plan has expired.");
  }

  res.json(new ApiResponse(200, { profile: toPublicProfile(candidate) }));
}

/** GET /api/candidates/by-slug/:slug — company view. Contact stays masked until unlocked. */
export async function getCandidateBySlug(req, res) {
  const slug = readSlug(req.params.slug);
  if (!slug) throw new ApiError(404, "Profile not found.");

  const candidate = await JobSeeker.findOne({ publicSlug: slug }).select(PUBLIC_FIELDS);
  if (!candidate) throw new ApiError(404, "Candidate not found.");

  const contactedIds = await contactedIdSet(req.user.id, [candidate._id]);
  res.json(new ApiResponse(200, { candidate: presentCandidate(candidate, contactedIds) }));
}

/** POST /api/candidates/by-slug/:slug/contact — same lead spend as contact by id. */
export async function contactCandidateBySlug(req, res) {
  const slug = readSlug(req.params.slug);
  if (!slug) throw new ApiError(404, "Profile not found.");

  const candidate = await JobSeeker.findOne({ publicSlug: slug }).select("_id");
  if (!candidate) throw new ApiError(404, "Candidate not found.");

  req.params.id = String(candidate._id);
  return contactCandidate(req, res);
}

/** POST /api/candidates/:id/share-link — creates the short public URL if needed. */
export async function ensureCandidateShareLink(req, res) {
  const candidate = await requireCandidate(req.params.id);
  const slug = await ensurePublicSlug(candidate._id, candidate.fullName);
  res.json(new ApiResponse(200, { slug }, "Share link ready."));
}