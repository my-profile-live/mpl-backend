import JobSeeker from "../models/JobSeeker.js";
import SlugCounter from "../models/SlugCounter.js";
import { ApiError } from "./ApiError.js";

/** name + 4 to 8 digits. 4 digits cover the first 9,000 people with a name.
 *  The number grows after that, so millions of accounts still stay unique. */
export const PUBLIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d{4,8}$/;

const MAX_NUMBER = 99_999_999;

/** Lowercase name slug, capped so the public URL stays short. */
export function nameSlug(fullName) {
  const base = String(fullName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "profile";
}

/** seq 1 → 1000, seq 9000 → 9999, seq 9001 → 10000. */
function numberFor(seq) {
  return 999 + seq;
}

async function takeNextSlug(base) {
  const counter = await SlugCounter.findOneAndUpdate(
    { _id: base },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const num = numberFor(counter?.seq || 1);
  if (num > MAX_NUMBER) {
    throw new ApiError(500, "Could not create a share link.");
  }
  return `${base}-${num}`;
}

/**
 * One stable public link per job seeker: himanshu-kapuriya-1456.
 * Safe for millions of accounts. The same name never reuses a number.
 */
export async function ensurePublicSlug(userId, fullName) {
  const existing = await JobSeeker.findById(userId).select("publicSlug fullName").lean();
  if (!existing) throw new ApiError(404, "Profile not found.");
  if (existing.publicSlug && PUBLIC_SLUG_RE.test(existing.publicSlug)) {
    return existing.publicSlug;
  }

  const base = nameSlug(fullName || existing.fullName);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = await takeNextSlug(base);
    try {
      const updated = await JobSeeker.findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { publicSlug: null },
            { publicSlug: { $exists: false } },
            { publicSlug: { $not: { $regex: "-\\d{4,8}$" } } },
          ],
        },
        { $set: { publicSlug: slug } },
        { new: true, projection: { publicSlug: 1 } }
      ).lean();

      if (updated?.publicSlug && PUBLIC_SLUG_RE.test(updated.publicSlug)) {
        return updated.publicSlug;
      }
    } catch (err) {
      if (err?.code !== 11000) throw err;
      continue;
    }

    const again = await JobSeeker.findById(userId).select("publicSlug").lean();
    if (again?.publicSlug && PUBLIC_SLUG_RE.test(again.publicSlug)) {
      return again.publicSlug;
    }
  }

  throw new ApiError(500, "Could not create a share link. Please try again.");
}

/** Gives a link to every job seeker who does not have one yet. Reads in pages, not all at once. */
export async function backfillPublicSlugs(batchSize = 200) {
  const filter = {
    $or: [
      { publicSlug: null },
      { publicSlug: { $exists: false } },
      { publicSlug: { $not: { $regex: "-\\d{4,8}$" } } },
    ],
  };

  let done = 0;
  while (true) {
    const batch = await JobSeeker.find(filter)
      .select("_id fullName")
      .limit(batchSize)
      .lean();
    if (!batch.length) break;

    for (const doc of batch) {
      await ensurePublicSlug(doc._id, doc.fullName);
      done += 1;
    }
  }
  return done;
}
