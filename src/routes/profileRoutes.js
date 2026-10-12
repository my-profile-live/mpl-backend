import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { uploadLogo, uploadPhoto } from "../middleware/upload.js";
import { updateJobSeekerSchema, updateCompanySchema, changePasswordSchema } from "../validators/profileValidators.js";
import * as profile from "../controllers/profileController.js";

const router = Router();
router.use(protect);

router.get("/me", profile.getMyProfile);

// Picks the right validator per role before delegating to the shared update handler.
router.put("/me", (req, res, next) => {
  const schema = req.user.role === "company" ? updateCompanySchema : updateJobSeekerSchema;
  return validate(schema)(req, res, next);
}, profile.updateMyProfile);

router.post("/photo", uploadPhoto, profile.uploadMyPhoto);
router.post("/logo", uploadLogo, profile.uploadMyLogo);
router.post("/change-password", validate(changePasswordSchema), profile.changePassword);

export default router;
