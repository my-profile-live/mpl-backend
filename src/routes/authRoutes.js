import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/auth.js";
import { uploadLogo, uploadPhoto, fileUrl } from "../middleware/upload.js";
import {
  companySignupSchema,
  jobSeekerSignupSchema,
  verifySignupOtpSchema,
  resendOtpSchema,
  requestMobileOtpSchema,
  verifyMobileLoginOtpSchema,
  emailLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/authValidators.js";
import * as auth from "../controllers/authController.js";

const router = Router();

const limiterMessage = {
  success: false,
  statusCode: 429,
  message: "Too many requests. Please try again later.",
};

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage,
});

const lookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage,
});

function attachUploadedUrl(req, res, next) {
  if (req.file) req.uploadedFileUrl = fileUrl(req, req.file.filename);
  next();
}

/* Signup */
router.post(
  "/signup/company",
  otpLimiter,
  uploadLogo,
  attachUploadedUrl,
  validate(companySignupSchema),
  auth.signupCompany
);
router.post(
  "/signup/jobseeker",
  otpLimiter,
  uploadPhoto,
  attachUploadedUrl,
  validate(jobSeekerSignupSchema),
  auth.signupJobSeeker
);
router.post(
  "/signup/verify-otp",
  otpVerifyLimiter,
  validate(verifySignupOtpSchema),
  auth.verifySignupOtp
);
router.post(
  "/signup/resend-otp",
  otpLimiter,
  validate(resendOtpSchema),
  auth.resendSignupOtp
);

router.post("/check-company-uniqueness", lookupLimiter, auth.checkCompanyUniqueness);
router.post("/check-jobseeker-uniqueness", lookupLimiter, auth.checkJobSeekerUniqueness);

/* Login */
router.post(
  "/login/mobile/request",
  otpLimiter,
  validate(requestMobileOtpSchema),
  auth.requestMobileLoginOtp
);
router.post(
  "/login/mobile/verify",
  otpVerifyLimiter,
  validate(verifyMobileLoginOtpSchema),
  auth.verifyMobileLoginOtp
);
router.post("/login/email", loginLimiter, validate(emailLoginSchema), auth.loginWithEmail);
router.post("/logout", auth.logout);

/* Password reset */
router.post(
  "/forgot-password",
  otpLimiter,
  validate(forgotPasswordSchema),
  auth.forgotPassword
);
router.post(
  "/reset-password",
  otpVerifyLimiter,
  validate(resetPasswordSchema),
  auth.resetPassword
);

/* Session */
router.get("/me", protect, auth.getMe);

/* ✅ NEW — mark signup payment on the authenticated user */
router.post("/me/complete-payment", protect, auth.completeSignupPayment);

export default router;