import mongoose from "mongoose";

/** Compressed WebP bytes. The document id is the public file name. */
const storedImageSchema = new mongoose.Schema(
  {
    _id: { type: String },
    data: { type: Buffer, required: true },
    contentType: { type: String, default: "image/webp" },
    bytes: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false }
);

export default mongoose.model("StoredImage", storedImageSchema);
