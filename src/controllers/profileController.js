import bcrypt from "bcryptjs";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { fileUrl } from "../middleware/upload.js";
import { calcCompanyCompletion, calcJobSeekerCompletion } from "../utils/profileCompletion.js";
import { ensurePublicSlug } from "../utils/publicSlug.js";
import { planIsLive } from "../constants/plans.js";

function stripSensitive(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
}

/** GET /api/profile/me */
export async function getMyProfile(req, res) {
  res.json(new ApiResponse(200, { userType: req.user.role, profile: stripSensitive(req.userDoc) }));
}

const PRIVILEGED_PROFILE_FIELDS = [
  "passwordHash",
  "password",
  "paymentDone",
  "paymentId",
  "paymentAmount",
  "paymentAt",
  "leadsRemaining",
  "currentPlan",
  "planExpiry",
  "isEmailVerified",
  "isMobileVerified",
  "status",
  "publicSlug",
  "profileCompletion",
  "__v",
  "_id",
];

/** PUT /api/profile/me — partial update, same tabbed-section UX as ProfileEdit.jsx. */
export async function updateMyProfile(req, res) {
  const user = req.userDoc;
  for (const key of PRIVILEGED_PROFILE_FIELDS) delete req.body[key];
  Object.assign(user, req.body);

  user.profileCompletion =
    req.user.role === "company" ? calcCompanyCompletion(user) : calcJobSeekerCompletion(user);

  await user.save();
  res.json(new ApiResponse(200, { profile: stripSensitive(user) }, "Profile updated."));
}

/** POST /api/profile/photo — job seeker profile photo upload. */
export async function uploadMyPhoto(req, res) {
  if (req.user.role !== "jobseeker") throw new ApiError(403, "Only job seekers can upload a profile photo.");
  if (!req.file) throw new ApiError(400, "No file uploaded.");

  req.userDoc.photo = fileUrl(req, req.file.filename);
  req.userDoc.profileCompletion = calcJobSeekerCompletion(req.userDoc);
  await req.userDoc.save();

  res.json(new ApiResponse(200, { photo: req.userDoc.photo }, "Photo uploaded."));
}

/** POST /api/profile/logo — company logo upload. */
export async function uploadMyLogo(req, res) {
  if (req.user.role !== "company") throw new ApiError(403, "Only companies can upload a logo.");
  if (!req.file) throw new ApiError(400, "No file uploaded.");

  req.userDoc.companyLogo = fileUrl(req, req.file.filename);
  req.userDoc.profileCompletion = calcCompanyCompletion(req.userDoc);
  await req.userDoc.save();

  res.json(new ApiResponse(200, { companyLogo: req.userDoc.companyLogo }, "Logo uploaded."));
}

/** POST /api/profile/share — job seeker only. Returns the short public slug. */
export async function shareMyProfile(req, res) {
  if (req.user.role !== "jobseeker") {
    throw new ApiError(403, "Only job seekers can share a profile link.");
  }

  if (!planIsLive(req.userDoc)) {
    throw new ApiError(402, "Your plan has expired. Upgrade your plan to share your profile.");
  }

  const slug = await ensurePublicSlug(req.user.id, req.userDoc.fullName);
  res.json(new ApiResponse(200, { slug }, "Share link ready."));
}

/** POST /api/profile/change-password */
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await req.userDoc.constructor.findById(req.userDoc._id).select("+passwordHash");

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) throw new ApiError(401, "Current password is incorrect.");

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json(new ApiResponse(200, null, "Password changed."));
}


/** POST /api/profile/welcome-seen — marks the welcome modal as dismissed. */
export async function markWelcomeSeen(req, res) {
  const user = req.userDoc;
  if (!user.hasSeenWelcome) {
    user.hasSeenWelcome = true;
    await user.save();
  }
  res.json(
    new ApiResponse(200, { hasSeenWelcome: true }, "Welcome dismissed.")
  );
}