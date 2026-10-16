import { protect, requireRole } from "../middleware/auth.js";
import { requireActivePlan } from "../middleware/requireActivePlan.js";
import * as candidates from "../controllers/candidateController.js";
import { Router } from "express";

const router = Router();
router.use(protect, requireRole("company"));

/* ─── Read-only browsing — allowed but check plan on unlock actions ─── */
router.get("/", candidates.listCandidates);              // browsing allowed (see note below)
router.get("/search", candidates.searchCandidates);      // browsing allowed
router.get("/saved", candidates.listSavedCandidates);    // own data — allowed
router.get("/shortlisted", candidates.listShortlistedCandidates); // own data — allowed
router.get("/:id", candidates.getCandidate);             // preview allowed

/* ─── Mutating actions — blocked when plan hard-expired ─── */
router.post("/:id/save", requireActivePlan, candidates.toggleSaveCandidate);
router.post("/:id/shortlist", requireActivePlan, candidates.toggleShortlistCandidate);
router.post("/:id/contact", requireActivePlan, candidates.contactCandidate);

export default router;
