/**
 * Begriffsnetz-Analyse: Cluster, Paar, Pfad und die SSE-Varianten.
 * Aus server/index.ts unverändert herausgelöst.
 */
import express, { Router } from "express";
import { loadDynamicConceptSources, resolveClusterNodes } from "../lib/clusterNodes.js";
import { recordCitations } from "../lib/citationTracker.js";
import { getKeys } from "../lib/embeddingClient.js";
import { streamGeminiSSE, sseSend } from "../lib/geminiStream.js";
import { generateFlashContent } from "../lib/geminiText.js";
import { nodeSrv } from "../lib/graphContext.js";
import { flashErrorDetail, FLASH_THINKING_BUDGET, withWerkContext } from "../lib/proseAssist.js";
import { logResonanz } from "../lib/resonanzLog.js";
import { rateLimiter, scrub } from "../middleware/rateLimit.js";

export function createAnalyseRouter(): Router {
  const router = Router();
  // ─── Begriffsnetz: Cluster-Analyse (2–4 Knoten) ──────────────────────
  // Drei Prompt-Varianten je nach Knotenanzahl, jeder mit eigener
  // philosophischer Form:
  //   2 → Spannungsfeld (Dialektik)
  //   3 → Triade (vermittelndes Drittes — sweet spot)
  //   4 → Quadratur (Vierfeldschema, sich kreuzende Achsen)
  interface NodeMeta { id: string; label: string; fullLabel: string; description: string; }

  function buildClusterPrompt(nodes: NodeMeta[]): string {
    const intro = `Du bist ein philosophischer Analyst des Werks "Die Digitale Transformation" — einer poetisch-philosophischen Trilogie über Resonanzvernunft, Mensch-Maschine-Verhältnis und digitale Existenz.\n\n`;
    const conceptList = nodes.map((n, i) => `KONZEPT ${String.fromCharCode(65 + i)}: ${n.fullLabel}\n${n.description}`).join("\n\n");
    if (nodes.length === 2) {
      return intro + `Analysiere das Spannungsfeld zwischen diesen beiden Konzepten aus dem Begriffsnetz des Werks:\n\n${conceptList}\n\nSchreibe drei prägnante Absätze:\n1. Worin besteht die produktive Spannung oder der Widerspruch zwischen diesen Konzepten — was macht sie zu Gegenspielern oder Komplizen?\n2. Welches transformative "Dritte" entsteht, wenn man beide gemeinsam denkt — was wird sichtbar, das in keinem allein liegt?\n3. Was verändert sich am Verständnis von Mensch, Maschine oder Resonanz, wenn dieser Zusammenhang ernst genommen wird?\n\nSchreibe philosophisch dicht, aber ohne Jargon-Prunk. Kein Fazit, keine Aufzählung. Schließe mit einer offenen Frage, die der Lesende weitertragen kann.`;
    }
    if (nodes.length === 3) {
      return intro + `Analysiere die Triade dieser drei Konzepte aus dem Begriffsnetz des Werks:\n\n${conceptList}\n\nIm Unterschied zur Zweier-Spannung entsteht in der Triade ein vermittelndes Drittes. Schreibe drei prägnante Absätze:\n1. Wie bilden A, B und C ein triadisches Gefüge? Welcher der drei steht als Brücke, welche als Pole oder Gegensätze? Welche Bewegung entsteht zwischen ihnen?\n2. Was wird durch das Hinzutreten des Dritten sichtbar, das in der bloßen Zweier-Konstellation noch nicht gesehen werden konnte? Welche emergente Eigenschaft tritt hervor?\n3. Welche Erkenntnis für das Verhältnis Mensch–Maschine, für Resonanz oder für digitale Existenz erschließt diese Triade?\n\nSchreibe philosophisch dicht, ohne Jargon-Prunk. Kein Fazit, keine Aufzählung. Schließe mit einer offenen Frage, die der Lesende weitertragen kann.`;
    }
    // 4 Knoten — Quadratur
    return intro + `Analysiere die Quadratur dieser vier Konzepte aus dem Begriffsnetz des Werks:\n\n${conceptList}\n\nVier Konzepte spannen das klassische Vierfeldschema auf — zwei sich kreuzende Achsen, in deren Spannungspunkt sich Erkenntnis bildet (vergleichbar Heideggers Geviert oder dem klassischen Logos–Pathos–Ethos–Kairos). Schreibe drei prägnante Absätze:\n1. Welche zwei Achsen-Paare bilden sich? Welche Konzepte stehen in Gegensatz, welche in Komplementarität? Wie kreuzen sich die Achsen?\n2. Was wird im Vierfeld sichtbar, das in Triade und Spannungsfeld noch nicht greifbar war? Welcher Mittelpunkt entsteht — oder welche Leere im Zentrum?\n3. Welches umfassende Verständnis von Mensch, Maschine oder Resonanz erschließt nur diese Vierheit — was bliebe in kleineren Konstellationen unsichtbar?\n\nSchreibe philosophisch dicht, ohne Jargon-Prunk. Kein Fazit, keine Aufzählung. Schließe mit einer offenen Frage, die der Lesende weitertragen kann.`;
  }

  function clusterAnchor(ids: string[]): string {
    return `analyse:${[...ids].sort().join("+")}`;
  }

  function clusterDescriptor(nodes: NodeMeta[]): string {
    if (nodes.length === 2) return `Spannungsfeld: ${nodes[0].fullLabel} ↔ ${nodes[1].fullLabel}`;
    if (nodes.length === 3) return `Triade: ${nodes.map(n => n.fullLabel).join(" · ")}`;
    return `Quadratur: ${nodes.map(n => n.fullLabel).join(" · ")}`;
  }

  async function handleClusterAnalysis(_req: express.Request, res: express.Response, nodes: NodeMeta[]): Promise<void> {
    if (getKeys().length === 0) {
      res.status(500).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });
      return;
    }
    // Nur Knoten aus Begriffsnetz oder concept-nodes.json. Client-Text bleibt draußen.
    const resolved = resolveClusterNodes(nodes, nodeSrv, await loadDynamicConceptSources());
    if (!resolved.ok) {
      res.status(400).json({ error: resolved.error });
      return;
    }
    nodes = resolved.nodes;
    const ids = nodes.map(n => n.id);

    const rawPrompt = buildClusterPrompt(nodes);
    // Werk-Text-RAG (Feature D): retrieve relevante Passagen via Knoten-Labels
    const ragQuery = nodes.map(n => n.fullLabel).join(" ") + " " + nodes.map(n => n.description).join(" ");
    const { enrichedPrompt, passages } = await withWerkContext(rawPrompt, ragQuery, 4);

    try {
      const r = await generateFlashContent({
        contents: [{ role: "user", parts: [{ text: enrichedPrompt }] }],
        temperature: 0.75,
        maxTokens: 4000,
        thinkingBudget: FLASH_THINKING_BUDGET,
      });
      if (!r.ok) {
        console.error("Cluster-Analyse Gemini error:", r.status, scrub(r.errorDetail ?? ""));
        res.status(502).json({ error: scrub(flashErrorDetail(r)) });
        return;
      }
      const analysis = r.text;
      // R6: parse [chunkId]/[resonanzId]-Anker aus der Antwort, validiere
      // gegen retrieved-Liste, inkrementiere Citation-Counter.
      recordCitations(analysis, passages.map(p => ({ source: p.source, id: p.id })));
      res.json({ analysis, citedChunks: passages.map(p => ({ source: p.source, id: p.id, chapter: p.chapter, partTitle: p.partTitle, chapterTitle: p.chapterTitle, endpoint: p.endpoint, prompt: p.prompt })) });
      void logResonanz({
        endpoint: "analyse",
        anchor: clusterAnchor(ids),
        nodeIds: [...ids].sort(),
        prompt: clusterDescriptor(nodes),
        response: analysis,
        model: "gemini-2.5-flash",
        contextMeta: {
          cluster_size: nodes.length,
          node_labels: nodes.map(n => n.fullLabel),
          werk_passages: passages.map(p => ({ id: p.id, chapter: p.chapter, score: Number(p.score.toFixed(3)) })),
        },
      });
    } catch (err: unknown) {
      const message = scrub(err instanceof Error ? err.message : String(err));
      console.error("Cluster-Analyse API error:", message);
      res.status(502).json({ error: `API-Fehler: ${message}` });
    }
  }

  // Neuer Cluster-Endpoint — primärer Eingang für 2-5 Knoten
  router.post("/api/analyse-cluster", rateLimiter('analyse-cluster', 15, 60 * 60_000), async (req, res) => {
    const { nodes } = req.body as { nodes: NodeMeta[] };
    if (!Array.isArray(nodes)) {
      return res.status(400).json({ error: "nodes-Array ist erforderlich." });
    }
    return handleClusterAnalysis(req, res, nodes);
  });

  // Backward-compat: alter /api/analyse-pair leitet auf cluster-Logik um
  router.post("/api/analyse-pair", rateLimiter('analyse-pair', 15, 60 * 60_000), async (req, res) => {
    const { nodeA, nodeB } = req.body as { nodeA: NodeMeta; nodeB: NodeMeta };
    if (!nodeA?.id || !nodeB?.id) {
      return res.status(400).json({ error: "nodeA und nodeB sind erforderlich." });
    }
    return handleClusterAnalysis(req, res, [nodeA, nodeB]);
  });

  // ─── Begriffsnetz: Pfad-Analyse (3-5 Knoten in Sequenz) ──────────────
  // Drei Verhaltens-Varianten:
  //   1. Nur shortest, kein surprising      → Einzelpfad-Analyse
  //   2. shortest + surprising, identisch   → Einzelpfad-Analyse (ehrlich)
  //   3. shortest + surprising, verschieden → Vergleichs-Analyse
  function buildPathDescriptor(ids: string[]): string {
    return ids.map(id => nodeSrv.get(id)?.fullLabel ?? id).join(" → ");
  }

  function buildSinglePathPrompt(path: string[]): string {
    const sequence = path.map((id, i) => {
      const n = nodeSrv.get(id);
      return `${i + 1}. ${n?.fullLabel ?? id}: ${n?.description ?? ""}`;
    }).join("\n");
    return `Du bist ein philosophischer Analyst des Werks "Die Digitale Transformation" — einer poetisch-philosophischen Trilogie über Resonanzvernunft, Mensch-Maschine-Verhältnis und digitale Existenz.

Analysiere diese Bewegung durch das Begriffsnetz des Werks (${path.length} Stationen, ${path.length - 1} Übergänge):

${sequence}

Pfade sind keine bloßen Distanzen, sondern narrative Bewegungen: jede Begriffsfolge erzählt etwas. Schreibe drei prägnante Absätze:
1. Welche Bewegung beschreibt dieser Pfad? Welcher Übergang ist tragend, welcher kontingent? Wo entsteht die eigentliche Verschiebung der Bedeutung?
2. Was wird durch diese spezifische Reihenfolge sichtbar, das in Einzelbetrachtung der Konzepte unsichtbar bliebe? Welche philosophische These klingt mit?
3. Was bedeutet diese Bewegung für das Werk insgesamt — für sein Verständnis von Mensch, Maschine oder Resonanz?

Falls die Sequenz keine substantielle Bewegung enthält (etwa wegen erzwungener Verbindungen im Graph), sage es offen — produziere keinen erzwungenen Sinn. Schreibe philosophisch dicht, ohne Jargon-Prunk. Schließe mit einer offenen Frage.`;
  }

  function buildComparePathPrompt(shortest: string[], surprising: string[]): string {
    const seqShort = shortest.map((id, i) => {
      const n = nodeSrv.get(id);
      return `   ${i + 1}. ${n?.fullLabel ?? id}: ${n?.description ?? ""}`;
    }).join("\n");
    const seqSurprising = surprising.map((id, i) => {
      const n = nodeSrv.get(id);
      return `   ${i + 1}. ${n?.fullLabel ?? id}: ${n?.description ?? ""}`;
    }).join("\n");
    return `Du bist ein philosophischer Analyst des Werks "Die Digitale Transformation" — einer poetisch-philosophischen Trilogie über Resonanzvernunft, Mensch-Maschine-Verhältnis und digitale Existenz.

Vergleiche zwei Pfade durch das Begriffsnetz des Werks zwischen denselben Endpunkten:

DIREKTER PFAD (kürzest, ${shortest.length} Stationen):
${seqShort}

ÜBERRASCHENDER PFAD (alternative Wegführung, ${surprising.length} Stationen):
${seqSurprising}

Beide Pfade verbinden dieselben Endpunkte, schlagen aber unterschiedliche Routen ein. Der direkte Weg folgt der dichtesten Begriffslogik, der überraschende eine seltenere Verknüpfung. Schreibe drei prägnante Absätze:
1. Welche Bewegung erzählt jeder der beiden Wege? Welcher liest sich als logische Konsequenz, welcher als poetisch-überraschend?
2. Was macht der Vergleich sichtbar, das ein einzelner Pfad nicht zeigen würde? Treffen sich die Bewegungen an einem Mittelpunkt, oder sind sie konträr?
3. Was sagt die Existenz beider Wege über die Geländegestalt des Begriffsraums — und über das Werk?

Falls die beiden Pfade fast identisch verlaufen oder die "Überraschung" konstruiert wirkt, sage es offen — produziere keinen erzwungenen Vergleich. Schreibe philosophisch dicht, ohne Jargon-Prunk. Schließe mit einer offenen Frage.`;
  }

  router.post("/api/analyse-path", rateLimiter('analyse-path', 15, 60 * 60_000), async (req, res) => {
    if (getKeys().length === 0) {
      return res.status(500).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });
    }
    const { shortest, surprising, from, to } = req.body as {
      shortest: string[];
      surprising?: string[];
      from: string;
      to: string;
    };

    if (!Array.isArray(shortest) || shortest.length < 3 || shortest.length > 5) {
      return res.status(400).json({ error: "Pfad muss zwischen 3 und 5 Knoten lang sein." });
    }
    if (surprising !== undefined && (!Array.isArray(surprising) || surprising.length < 3 || surprising.length > 5)) {
      return res.status(400).json({ error: "Surprising-Pfad (falls vorhanden) muss 3 bis 5 Knoten lang sein." });
    }
    // Verifizieren dass alle IDs im Begriffsnetz existieren
    const allIds = Array.from(new Set([...shortest, ...(surprising ?? [])]));
    for (const id of allIds) {
      if (!nodeSrv.has(id)) {
        return res.status(400).json({ error: `Unbekannter Knoten: ${id}` });
      }
    }
    if (!from || !to || !nodeSrv.has(from) || !nodeSrv.has(to)) {
      return res.status(400).json({ error: "from und to müssen valide Knoten-IDs sein." });
    }

    // Variante wählen: Vergleich nur wenn beide vorhanden UND substantiell verschieden
    const samePath = surprising && shortest.length === surprising.length
      && shortest.every((id, i) => id === surprising[i]);
    const useCompare = surprising && surprising.length >= 3 && !samePath;

    const rawPrompt = useCompare
      ? buildComparePathPrompt(shortest, surprising!)
      : buildSinglePathPrompt(shortest);

    const descriptor = useCompare
      ? `Pfad-Vergleich: ${buildPathDescriptor(shortest)} vs. ${buildPathDescriptor(surprising!)}`
      : `Pfad-Analyse: ${buildPathDescriptor(shortest)}`;

    // Werk-Text-RAG (Feature D)
    const ragQuery = allIds.map(id => nodeSrv.get(id)?.fullLabel ?? id).join(" ");
    const { enrichedPrompt, passages } = await withWerkContext(rawPrompt, ragQuery, 4);

    try {
      const r = await generateFlashContent({
        contents: [{ role: "user", parts: [{ text: enrichedPrompt }] }],
        temperature: 0.75,
        maxTokens: 4000,
        thinkingBudget: FLASH_THINKING_BUDGET,
      });
      if (!r.ok) {
        console.error("Pfad-Analyse Gemini error:", r.status, scrub(r.errorDetail ?? ""));
        return res.status(502).json({ error: scrub(flashErrorDetail(r)) });
      }
      const analysis = r.text;
      // R6: Citation-Tracking
      recordCitations(analysis, passages.map(p => ({ source: p.source, id: p.id })));
      res.json({ analysis, variant: useCompare ? "compare" : "single", citedChunks: passages.map(p => ({ source: p.source, id: p.id, chapter: p.chapter, partTitle: p.partTitle, chapterTitle: p.chapterTitle, endpoint: p.endpoint, prompt: p.prompt })) });

      const sortedEndpoints = [from, to].sort();
      void logResonanz({
        endpoint: "path-analyse",
        anchor: `path-analyse:${sortedEndpoints[0]}+${sortedEndpoints[1]}`,
        nodeIds: [...allIds].sort(),
        prompt: descriptor,
        response: analysis,
        model: "gemini-2.5-flash",
        contextMeta: {
          from,
          to,
          shortest_path: shortest,
          surprising_path: surprising ?? null,
          shortest_length: shortest.length,
          surprising_length: surprising?.length ?? null,
          variant: useCompare ? "compare" : "single",
          paths_identical: samePath ?? false,
          werk_passages: passages.map(p => ({ id: p.id, chapter: p.chapter, score: Number(p.score.toFixed(3)) })),
        },
      });
      return;
    } catch (err: unknown) {
      const message = scrub(err instanceof Error ? err.message : String(err));
      console.error("Pfad-Analyse API error:", message);
      return res.status(502).json({ error: `API-Fehler: ${message}` });
    }
  });

  // ─── Analyse/Pfad Streaming (Phase 3, SSE) ───────────────────────────────
  // Additive Streaming-Varianten — gleiche Prompts/RAG/Logging wie die
  // JSON-Endpoints, aber token-weise via streamGeminiSSE. JSON-Pfade bleiben
  // unberührt (Client-Fallback).
  router.post("/api/analyse-cluster/stream", rateLimiter('analyse-cluster', 15, 60 * 60_000), async (req, res) => {
    const apiKeys = getKeys();
    if (apiKeys.length === 0) return res.status(500).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });
    const { nodes } = req.body as { nodes: NodeMeta[] };
    const resolved = resolveClusterNodes(nodes, nodeSrv, await loadDynamicConceptSources());
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    const safeNodes = resolved.nodes;
    const ids = safeNodes.map(n => n.id);

    const rawPrompt = buildClusterPrompt(safeNodes);
    const ragQuery = safeNodes.map(n => n.fullLabel).join(" ") + " " + safeNodes.map(n => n.description).join(" ");
    const { enrichedPrompt, passages } = await withWerkContext(rawPrompt, ragQuery, 4);

    const full = await streamGeminiSSE(res, {
      apiKeys,
      contents: [{ role: "user", parts: [{ text: enrichedPrompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 4000, ...(typeof FLASH_THINKING_BUDGET === "number" ? { thinkingConfig: { thinkingBudget: FLASH_THINKING_BUDGET } } : {}) },
    });
    if (full === null) return;
    const analysis = full.trim() || "Keine Antwort erhalten.";
    recordCitations(analysis, passages.map(p => ({ source: p.source, id: p.id })));
    sseSend(res, { done: true, citedChunks: passages.map(p => ({ source: p.source, id: p.id, chapter: p.chapter, partTitle: p.partTitle, chapterTitle: p.chapterTitle, endpoint: p.endpoint, prompt: p.prompt })) });
    res.end();
    void logResonanz({
      endpoint: "analyse", anchor: clusterAnchor(ids), nodeIds: [...ids].sort(),
      prompt: clusterDescriptor(safeNodes), response: analysis, model: "gemini-2.5-flash",
      contextMeta: { cluster_size: safeNodes.length, node_labels: safeNodes.map(n => n.fullLabel), streamed: true, werk_passages: passages.map(p => ({ id: p.id, chapter: p.chapter, score: Number(p.score.toFixed(3)) })) },
    });
  });

  router.post("/api/analyse-path/stream", rateLimiter('analyse-path', 15, 60 * 60_000), async (req, res) => {
    const apiKeys = getKeys();
    if (apiKeys.length === 0) return res.status(500).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });
    const { shortest, surprising, from, to } = req.body as { shortest: string[]; surprising?: string[]; from: string; to: string };
    if (!Array.isArray(shortest) || shortest.length < 3 || shortest.length > 5) return res.status(400).json({ error: "Pfad muss zwischen 3 und 5 Knoten lang sein." });
    if (surprising !== undefined && (!Array.isArray(surprising) || surprising.length < 3 || surprising.length > 5)) return res.status(400).json({ error: "Surprising-Pfad (falls vorhanden) muss 3 bis 5 Knoten lang sein." });
    const allIds = Array.from(new Set([...shortest, ...(surprising ?? [])]));
    for (const id of allIds) if (!nodeSrv.has(id)) return res.status(400).json({ error: `Unbekannter Knoten: ${id}` });
    if (!from || !to || !nodeSrv.has(from) || !nodeSrv.has(to)) return res.status(400).json({ error: "from und to müssen valide Knoten-IDs sein." });

    const samePath = surprising && shortest.length === surprising.length && shortest.every((id, i) => id === surprising[i]);
    const useCompare = surprising && surprising.length >= 3 && !samePath;
    const rawPrompt = useCompare ? buildComparePathPrompt(shortest, surprising!) : buildSinglePathPrompt(shortest);
    const descriptor = useCompare
      ? `Pfad-Vergleich: ${buildPathDescriptor(shortest)} vs. ${buildPathDescriptor(surprising!)}`
      : `Pfad-Analyse: ${buildPathDescriptor(shortest)}`;
    const ragQuery = allIds.map(id => nodeSrv.get(id)?.fullLabel ?? id).join(" ");
    const { enrichedPrompt, passages } = await withWerkContext(rawPrompt, ragQuery, 4);

    const full = await streamGeminiSSE(res, {
      apiKeys,
      contents: [{ role: "user", parts: [{ text: enrichedPrompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 4000, ...(typeof FLASH_THINKING_BUDGET === "number" ? { thinkingConfig: { thinkingBudget: FLASH_THINKING_BUDGET } } : {}) },
    });
    if (full === null) return;
    const analysis = full.trim() || "Keine Antwort erhalten.";
    recordCitations(analysis, passages.map(p => ({ source: p.source, id: p.id })));
    sseSend(res, { done: true, variant: useCompare ? "compare" : "single", citedChunks: passages.map(p => ({ source: p.source, id: p.id, chapter: p.chapter, partTitle: p.partTitle, chapterTitle: p.chapterTitle, endpoint: p.endpoint, prompt: p.prompt })) });
    res.end();
    const sortedEndpoints = [from, to].sort();
    void logResonanz({
      endpoint: "path-analyse", anchor: `path-analyse:${sortedEndpoints[0]}+${sortedEndpoints[1]}`,
      nodeIds: [...allIds].sort(), prompt: descriptor, response: analysis, model: "gemini-2.5-flash",
      contextMeta: { from, to, shortest_path: shortest, surprising_path: surprising ?? null, shortest_length: shortest.length, surprising_length: surprising?.length ?? null, variant: useCompare ? "compare" : "single", paths_identical: samePath ?? false, streamed: true, werk_passages: passages.map(p => ({ id: p.id, chapter: p.chapter, score: Number(p.score.toFixed(3)) })) },
    });
  });
  return router;
}
