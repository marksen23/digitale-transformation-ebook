/**
 * GET /api/health — Embedding-Probe und kurzer Generation-Ping.
 * Aus server/index.ts unverändert herausgelöst.
 */
import { Router } from "express";
import { BILLING_HINT, getKeys, probeEmbedding } from "../lib/embeddingClient.js";
import { geminiAuthHeaders, geminiGenerateUrl } from "../lib/geminiHttp.js";

export function createHealthRouter(): Router {
  const router = Router();
  // ─── Health / Diagnose-Endpunkt ───────────────────────────────────
  // M4: prüft jetzt das EMBEDDING-Modell (nicht nur Generation), weil die
  // semantische Suche daran hängt. Klassifiziert Billing-Block (402 Guthaben
  // aufgebraucht / 403 dunning) explizit, damit das Health-Dashboard die Ursache benennen kann.
  router.get("/api/health", async (_req, res) => {
    const keys = getKeys();
    if (keys.length === 0) {
      return res.status(200).json({
        status: "degraded",
        server: "ok",
        gemini: "not_configured",
        embedding: "not_configured",
        message: "Kein Embedding-Key (GEMINI_API_KEY[S]/FALLBACK) gesetzt.",
      });
    }

    // Embedding-Probe (die semantische Suche hängt daran) — Multi-Key.
    const probe = await probeEmbedding();
    // embedding-Status menschenlesbar aus der Klassifikation des Primärkeys
    // bzw. dem Gesamtergebnis ableiten.
    const embedding =
      probe.ok ? "ok"
      : probe.primaryClass === "billing" ? "billing_block"
      : probe.primaryClass === "auth" ? "auth_error"
      : probe.primaryClass === "quota" ? "quota_exhausted"
      : "unreachable";

    // Zusätzlich: kurzer Generation-Ping (manche KI-Features nutzen das,
    // unabhängig vom Embedding-Modell — z.B. graph-chat).
    let gemini: string = "unknown";
    try {
      const probeKey = keys[probe.workingKeyIndex >= 0 ? probe.workingKeyIndex : 0];
      const gen = await fetch(
        geminiGenerateUrl(),
        {
          method: "POST",
          headers: geminiAuthHeaders(probeKey),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Hi" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        }
      );
      gemini = gen.ok ? "ok" : "error";
    } catch {
      gemini = "unreachable";
    }

    return res.json({
      status: probe.ok ? "ok" : "degraded",
      server: "ok",
      gemini,
      embedding,
      embedding_dim: probe.dim,            // 3072 bei gemini-embedding-001
      keys_available: probe.keysAvailable,
      working_key_index: probe.workingKeyIndex,  // -1 = alle tot, 0 = primär, >0 = Fallback aktiv
      ...(embedding === "billing_block" ? {
        message: BILLING_HINT,
      } : {}),
    });
  });
  return router;
}
