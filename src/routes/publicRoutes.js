import { Router } from "express";
import * as candidates from "../controllers/candidateController.js";

const router = Router();

/* ─────────────────────────────────────────────────────────────
   PUBLIC ROUTES — NO auth middleware.
   These are safe to call with no token, no session.
   ───────────────────────────────────────────────────────────── */
router.get("/profile/:id", candidates.getPublicProfile);

export default router;