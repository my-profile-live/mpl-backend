import { protect, requireRole } from "../middleware/auth.js";
import { requireActivePlan } from "../middleware/requireActivePlan.js";
import * as candidates from "../controllers/candidateController.js";
import { Router } from "express";

const router = Router();
router.use(protect, requireRole("company"));

/* ─── Hiring actions need a live plan. Saved history stays readable. ─── */
router.get("/", requireActivePlan, candidates.listCandidates);
router.get("/search", requireActivePlan, candidates.searchCandidates);
router.get("/saved", candidates.listSavedCandidates);
router.get("/shortlisted", candidates.listShortlistedCandidates);
router.get("/by-slug/:slug", candidates.getCandidateBySlug);
router.post("/by-slug/:slug/contact", requireActivePlan, candidates.contactCandidateBySlug);
router.post("/:id/share-link", candidates.ensureCandidateShareLink);
router.get("/:id", requireActivePlan, candidates.getCandidate);

/* ─── Mutating actions — blocked when plan hard-expired ─── */
router.post("/:id/save", requireActivePlan, candidates.toggleSaveCandidate);
router.post("/:id/shortlist", requireActivePlan, candidates.toggleShortlistCandidate);
router.post("/:id/contact", requireActivePlan, candidates.contactCandidate);

export default router;
