/**
 * /api/admin/* — dieselben Routen in derselben Reihenfolge.
 * Die Teile: Zugang, Kuration, Begriffsnetz, Erkenntnisse, Bewertung, Synthese, Pflege.
 */
import { Router } from "express";
import { mountAccess } from "./access.js";
import { mountCurate } from "./curate.js";
import { mountConcepts } from "./concepts.js";
import { mountErkenntnisse } from "./erkenntnisse.js";
import { mountScoring } from "./scoring.js";
import { mountSynthesis } from "./synthesis.js";
import { mountMaintenance } from "./maintenance.js";
export function createAdminRouter(): Router {
  const router = Router();
  mountAccess(router);
  mountCurate(router);
  mountConcepts(router);
  mountErkenntnisse(router);
  mountScoring(router);
  mountSynthesis(router);
  mountMaintenance(router);
  return router;
}
