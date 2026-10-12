import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.js";
import * as candidates from "../controllers/candidateController.js";

const router = Router();
router.use(protect, requireRole("company"));

router.get("/", candidates.listCandidates);
router.get("/search", candidates.searchCandidates); 
router.get("/saved", candidates.listSavedCandidates);
router.get("/shortlisted", candidates.listShortlistedCandidates);
router.get("/:id", candidates.getCandidate);
router.post("/:id/save", candidates.toggleSaveCandidate);
router.post("/:id/shortlist", candidates.toggleShortlistCandidate);
router.post("/:id/contact", candidates.contactCandidate);

export default router;
