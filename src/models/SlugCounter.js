import mongoose from "mongoose";

/**
 * One counter document per name.
 * $inc is atomic, so two people named the same thing never get the same link,
 * even when many accounts are created at once.
 */
const slugCounterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { collection: "slugcounters", versionKey: false }
);

export default mongoose.model("SlugCounter", slugCounterSchema);
