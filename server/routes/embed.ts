/**
 * POST /api/embed — Query-Embedding für die semantische Suche.
 * Bewusst eigener Router: weitere Korpus-Auslieferung (Embeddings, Chunks)
 * kann daneben eingehängt werden, ohne diese Route anzufassen.
 */
import { Router } from "express";
import { fetchEmbedding, getKeys } from "../lib/embeddingClient.js";
import { rateLimiter } from "../middleware/rateLimit.js";

export function createEmbedRouter(): Router {
  const router = Router();
  // ─── Embedding-Endpoint für semantische Korpus-Suche ─────────────────
  // Frontend ruft /api/embed mit einer Anfrage, bekommt einen 3072-dim
  // gemini-embedding-001-Vektor und vergleicht client-seitig mit den im
  // Korpus-Index hinterlegten Embeddings (Cosine-Similarity).
  //
  // M2: nutzt jetzt den shared embeddingClient → Multi-Key-Failover greift
  // auch hier (GEMINI_API_KEY_FALLBACK rotiert ein, wenn der Primärkey
  // billing/auth-blockiert ist). maxRetries knapp (2) wegen Request-Timeout.
  router.post("/api/embed", rateLimiter('embed', 60, 60_000), async (req, res) => {
    if (getKeys().length === 0) {
      return res.status(503).json({ error: "Embedding-API nicht konfiguriert." });
    }
    const { text } = req.body as { text: string };
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "text ist erforderlich." });
    }
    if (text.length > 8000) {
      return res.status(400).json({ error: "text zu lang (max 8000 Zeichen)." });
    }
    const values = await fetchEmbedding(text, { maxRetries: 2 });
    if (!Array.isArray(values)) {
      // Alle Keys erschöpft (billing/auth/quota/transient) — der Client
      // degradiert dann auf Lex-only. Detail-Klassifikation steht im
      // Server-Log (embeddingClient loggt erste N Fehler mit Klasse).
      return res.status(502).json({ error: "Embedding konnte nicht berechnet werden (alle Keys erschöpft)." });
    }
    return res.json({ embedding: values });
  });
  return router;
}
