import { ApiError } from "./ApiError.js";

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Rejects anything that is not a 24-char hex Mongo id before it hits Mongoose. */
export function assertObjectId(id, label = "id") {
  if (!OBJECT_ID.test(String(id || ""))) {
    throw new ApiError(400, `Invalid ${label}.`);
  }
}
