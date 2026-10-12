import multer from "multer";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import { ApiError } from "../utils/ApiError.js";

const UPLOAD_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${nanoid(12)}${ext}`);
  },
});

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/jpg"];

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new ApiError(400, "Only JPG/PNG images are allowed."));
  }
  cb(null, true);
}

/** Company logo upload - max 2MB, field name "companyLogo". */
export const uploadLogo = multer({
  storage,
  fileFilter,
  limits: { fileSize: (Number(process.env.MAX_LOGO_SIZE_MB) || 2) * 1024 * 1024 },
}).single("companyLogo");

/** Job seeker photo upload - max 5MB, field name "photo". */
export const uploadPhoto = multer({
  storage,
  fileFilter,
  limits: { fileSize: (Number(process.env.MAX_PHOTO_SIZE_MB) || 5) * 1024 * 1024 },
}).single("photo");

/** Builds a public URL for an uploaded file from the request context. */
export function fileUrl(req, filename) {
  return `${req.protocol}://${req.get("host")}/uploads/${filename}`;
}
