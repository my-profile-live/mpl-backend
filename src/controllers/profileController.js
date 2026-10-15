import bcrypt from "bcryptjs";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { fileUrl } from "../middleware/upload.js";
import { calcCompanyCompletion, calcJobSeekerCompletion } from "../utils/profileCompletion.js";

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

/** PUT /api/profile/me — partial update, same tabbed-section UX as ProfileEdit.jsx. */
export async function updateMyProfile(req, res) {
  const user = req.userDoc;
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