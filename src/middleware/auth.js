import { verifyToken } from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";
import JobSeeker from "../models/JobSeeker.js";
import Company from "../models/Company.js";
import AdminUser from "../models/AdminUser.js";
import Affiliate from "../models/Affiliate.js";
import { dropExpiredCredits } from "../constants/plans.js";

/**
 * Verifies the Bearer JWT and attaches:
 *   req.user    = { _id, id, role }   ← _id is what Mongoose's findById wants
 *   req.userDoc = the full Mongoose document (passwordHash excluded)
 *
 * We keep BOTH `_id` and `id` so any existing code that reads either
 * works without further changes. `_id` matches what `findById()` expects,
 * `id` was the previous convention used elsewhere.
 */
export async function protect(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Not authenticated. Missing bearer token.");
  }
  const token = header.split(" ")[1];

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired token.");
  }

  const models = { company: Company, jobseeker: JobSeeker, admin: AdminUser, agent: Affiliate };
  const Model = models[decoded.role];
  if (!Model) throw new ApiError(401, "Invalid or expired token.");

  const doc = await Model.findById(decoded.id);
  if (!doc) throw new ApiError(401, "Account no longer exists.");

  if (doc.passwordChangedAt && decoded.iat < Math.floor(new Date(doc.passwordChangedAt).getTime() / 1000)) {
    throw new ApiError(401, "Your session ended. Please sign in again.");
  }

  /* 🐛 FIX: expose `_id` (for findById) AND `id` (for backwards-compat).
     Also attach `userDoc` — the full Mongoose document. */
  req.user = {
    _id: doc._id,
    id: doc._id.toString(),
    role: decoded.role,
  };
  req.userDoc = doc;
  await dropExpiredCredits(doc);
  next();
}

/** Restricts a route to one or more roles: requireRole("company") */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(403, `This action requires role: ${roles.join(" or ")}.`);
    }
    next();
  };
}