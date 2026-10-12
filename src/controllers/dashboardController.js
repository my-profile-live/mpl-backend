import Interaction from "../models/Interaction.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/** GET /api/dashboard/jobseeker */
export async function jobSeekerDashboard(req, res) {
  const jobSeeker = req.user.id;

  const [profileViews, shortlists, interviewInvites, recent] = await Promise.all([
    Interaction.countDocuments({ jobSeeker, type: "view" }),
    Interaction.countDocuments({ jobSeeker, type: "shortlist" }),
    Interaction.countDocuments({ jobSeeker, type: "contact" }),
    Interaction.find({ jobSeeker })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({ path: "company", select: "companyName companyLogo industry" }),
  ]);

  res.json(
    new ApiResponse(200, {
      completion: req.userDoc.profileCompletion,
      stats: { profileViews, shortlists, interviewInvites },
      recentActivity: recent.map((i) => ({
        type: i.type,
        company: i.company,
        at: i.createdAt,
      })),
    })
  );
}

/** GET /api/dashboard/company */
export async function companyDashboard(req, res) {
  const company = req.user.id;

  const [saved, shortlisted, contacted, recent] = await Promise.all([
    Interaction.countDocuments({ company, type: "save" }),
    Interaction.countDocuments({ company, type: "shortlist" }),
    Interaction.countDocuments({ company, type: "contact" }),
    Interaction.find({ company })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({ path: "jobSeeker", select: "fullName photo currentJobTitle" }),
  ]);

  res.json(
    new ApiResponse(200, {
      status: req.userDoc.status,
      leadsRemaining: req.userDoc.leadsRemaining,
      stats: { saved, shortlisted, contacted, activeJobs: 0 },
      recentActivity: recent.map((i) => ({
        type: i.type,
        jobSeeker: i.jobSeeker,
        at: i.createdAt,
      })),
    })
  );
}
