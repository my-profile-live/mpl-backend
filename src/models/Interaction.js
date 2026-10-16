import mongoose from "mongoose";

/**
 * A single company <-> job-seeker interaction. Powers:
 *  - candidate save / shortlist / contact toggles
 *  - "profile views" stat on the job seeker dashboard
 *  - both activity feeds (company's outgoing actions, job seeker's incoming ones)
 * `type: "view"` and `"contact"` are append-only logs; "save" and "shortlist"
 * are toggled (a matching doc's presence = currently saved/shortlisted).
 */
const interactionSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    jobSeeker: { type: mongoose.Schema.Types.ObjectId, ref: "JobSeeker", required: true, index: true },
    type: { type: String, enum: ["view", "save", "shortlist", "contact"], required: true, index: true },
    /* Who initiated? Default keeps existing docs working. */
    direction: {
      type: String,
      enum: ["company_to_jobseeker", "jobseeker_to_company"],
      default: "company_to_jobseeker",
      index: true,
    },
  },
  { timestamps: true }
);

interactionSchema.index(
  { company: 1, jobSeeker: 1, type: 1, direction: 1 },
  {
    unique: true,
    partialFilterExpression: { type: { $in: ["save", "shortlist", "contact"] } },
    name: "uniq_company_seeker_action",
  }
);

export default mongoose.model("Interaction", interactionSchema);
