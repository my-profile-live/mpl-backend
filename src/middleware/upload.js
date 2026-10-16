import multer from "multer";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { ApiError } from "../utils/ApiError.js";
import StoredImage from "../models/StoredImage.js";

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/jpg"]);

const memory = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const ext = String(file.originalname || "").toLowerCase();
  const dot = ext.lastIndexOf(".");
  const suffix = dot >= 0 ? ext.slice(dot) : "";
  if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(suffix)) {
    return cb(new ApiError(400, "Only JPG/PNG images are allowed."));
  }
  cb(null, true);
}

function looksLikeImage(buf) {
  if (!buf || buf.length < 8) return false;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  return jpeg || png;
}

/** Shrink to WebP and keep the bytes in MongoDB. Returns the public id. */
export async function persistWebp(buffer, maxEdge) {
  let data;
  try {
    data = await sharp(buffer, { failOn: "error", limitInputPixels: 20_000_000 })
      .rotate()
      .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72, effort: 3 })
      .toBuffer();
  } catch {
    throw new ApiError(400, "Could not read that image.");
  }

  const id = nanoid(16);
  await StoredImage.create({
    _id: id,
    data,
    contentType: "image/webp",
    bytes: data.length,
  });
  return id;
}

function guardUpload(uploader, maxEdge) {
  return (req, res, next) => {
    uploader(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large." : "Upload rejected.";
          return next(new ApiError(400, message));
        }
        return next(err);
      }
      if (!req.file) return next();
      if (!looksLikeImage(req.file.buffer)) {
        req.file = undefined;
        return next(new ApiError(400, "Only JPG/PNG images are allowed."));
      }

      persistWebp(req.file.buffer, maxEdge)
        .then((id) => {
          req.file.filename = `${id}.webp`;
          req.uploadedFileUrl = fileUrl(req, req.file.filename);
          next();
        })
        .catch(next);
    });
  };
}

/** Company logo upload - max 2MB, stored as WebP. */
export const uploadLogo = guardUpload(
  multer({
    storage: memory,
    fileFilter,
    limits: { fileSize: (Number(process.env.MAX_LOGO_SIZE_MB) || 2) * 1024 * 1024 },
  }).single("companyLogo"),
  640
);

/** Job seeker photo upload - max 5MB, stored as WebP. */
export const uploadPhoto = guardUpload(
  multer({
    storage: memory,
    fileFilter,
    limits: { fileSize: (Number(process.env.MAX_PHOTO_SIZE_MB) || 5) * 1024 * 1024 },
  }).single("photo"),
  800
);

/** Public URL for an image stored in MongoDB. */
export function fileUrl(req, filename) {
  return `${req.protocol}://${req.get("host")}/uploads/${filename}`;
}
