import Company from "../models/Company.js";
import JobSeeker from "../models/JobSeeker.js";
import Interaction from "../models/Interaction.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { assertObjectId } from "../utils/objectId.js";

/* ─── Public fields for a company profile (masked vs unmasked) ─── */
const PUBLIC_FIELDS =
  "companyName companyLogo companyType industry website " +
  "companyDescription yearOfEstablishment numberOfEmployees productsServices workingDays officeTiming " +
  "state district city pinCode officeAddress contactPersonName designation " +
  "profileCompletion status createdAt " +
  "companyEmail mobileNumber";

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

function maskContactInfo(companyObj, isUnlocked) {
  if (isUnlocked) return companyObj;
  return {
    ...companyObj,
    mobileNumber: maskMobile(companyObj.mobileNumber),
    companyEmail: maskEmail(companyObj.companyEmail),
  };
}

/**
 * GET /api/companies/:id
 * Returns a company profile. Contact details are MASKED unless the calling
 * job seeker has already unlocked that company's contact.
 * NOTE: Does NOT log a view — views are only for company-side browsing.
 */
export async function getCompanyById(req, res) {
  const companyId = req.params.id;
  assertObjectId(companyId, "company id");

  const company = await Company.findById(companyId).select(PUBLIC_FIELDS);
  if (!company) throw new ApiError(404, "Company not found.");

  /* Has this job seeker unlocked this company? */
  const isUnlocked = !!(await Interaction.exists({
    company: companyId,
    jobSeeker: req.user.id,
    type: "contact",
    direction: "jobseeker_to_company",
  }));

  res.json(
    new ApiResponse(200, {
      company: maskContactInfo(company.toObject(), isUnlocked),
      isUnlocked,
    })
  );
}

/**
 * POST /api/companies/:id/unlock-contact
 * Spends 1 lead from the job seeker's plan to reveal company contact details.
 * Idempotent — repeated calls are free once unlocked.
 */
export async function unlockCompanyContact(req, res) {
  const companyId = req.params.id;
  assertObjectId(companyId, "company id");
  const jobSeekerId = req.userDoc._id;

  const company = await Company.findById(companyId).select(PUBLIC_FIELDS);
  if (!company) throw new ApiError(404, "Company not found.");

  /* Already unlocked? Idempotent, no charge. */
  const already = await Interaction.exists({
    company: companyId,
    jobSeeker: jobSeekerId,
    type: "contact",
    direction: "jobseeker_to_company",
  });

  if (already) {
    const fresh = await JobSeeker.findById(jobSeekerId).select("leadsRemaining");
    return res.json(
      new ApiResponse(
        200,
        {
          company: company.toObject(),
          leadsRemaining: fresh?.leadsRemaining ?? 0,
          alreadyUnlocked: true,
        },
        "Already unlocked."
      )
    );
  }

  try {
    await Interaction.create({
      company: companyId,
      jobSeeker: jobSeekerId,
      type: "contact",
      direction: "jobseeker_to_company",
    });
  } catch (err) {
    if (err?.code === 11000) {
      const fresh = await JobSeeker.findById(jobSeekerId).select("leadsRemaining");
      return res.json(
        new ApiResponse(
          200,
          {
            company: company.toObject(),
            leadsRemaining: fresh?.leadsRemaining ?? 0,
            alreadyUnlocked: true,
          },
          "Already unlocked."
        )
      );
    }
    throw err;
  }

  const updated = await JobSeeker.findOneAndUpdate(
    { _id: jobSeekerId, leadsRemaining: { $gt: 0 } },
    { $inc: { leadsRemaining: -1 } },
    { new: true }
  );
  if (!updated) {
    await Interaction.deleteOne({
      company: companyId,
      jobSeeker: jobSeekerId,
      type: "contact",
      direction: "jobseeker_to_company",
    });
    throw new ApiError(
      402,
      "You have no leads remaining. Please upgrade your plan to unlock more companies."
    );
  }

  res.json(
    new ApiResponse(
      200,
      {
        company: company.toObject(),
        leadsRemaining: updated.leadsRemaining,
      },
      "Company contact unlocked."
    )
  );
}