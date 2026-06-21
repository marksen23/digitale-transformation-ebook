/**
 * AdminCurationPage (/admin) — Korpus-Verwaltung mit Status-Filter,
 * Eintragsliste und Action-Buttons (publish/approve/pending/reject/delete).
 *
 * Bulk-Curation-Erweiterung (2026-05): Tastatur-Shortcuts + Multi-Select
 * + Auto-Select-Vorschlag nach corpusVoiceScore, damit werkVoiceScore
 * endlich seine ≥10-Kuratiert-Schwelle erreicht (aktuell nur 3 published).
 *
 * Nutzt:
 *   - useAdminAuth() (für Token-Status, indirekt via AdminLayout vorgegeben)
 *   - callAdminAction() für die API-Calls (jetzt auch parallelisiert mit Throttle)
 *   - DeleteConfirm-Modal für Lösch-Bestätigung
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadResonanzenIndex,
  ENDPOINT_LABEL, ENDPOINT_COLOR,
  broadcastIndexStale,
  type ResonanzEntry, type ResonanzIndex,
} from "@/lib/resonanzenIndex";
import { callAdminAction } from "@/lib/adminAuth";
import { recordAction } from "@/lib/adminActionLog";

/** Triggert cross-Tab + intra-Tab Index-Refresh. Wird nach jeder
 *  Admin-Mutation (curate/delete/pre-score/synthesize) aufgerufen. */
function notifyIndexStale() {
  broadcastIndexStale();
}
import DeleteConfirm from "@/components/admin/DeleteConfirm";
import ActionLogPanel from "@/components/admin/ActionLogPanel";
import ProposeConceptPanel from "@/components/admin/ProposeConceptPanel";
import WerkstattEpigraph from "@/components/admin/WerkstattEpigraph";
import Skeleton from "@/components/Skeleton";
import { UnifiedSearch } from "@/components/search/UnifiedSearch";
import type { ActiveFilters, FilterGroup, SearchSource } from "@/lib/search/types";
import {
  Section, Stat, useAdminTheme, computeStats, MONO, SERIF,
  loadOptionalJson, type Palette,
} from "./adminShared";

/** Anchor-Cluster vom Build-Step (scripts/build-resonanzen-index.ts:
 *  writeAnchorClusters). Jeder Cluster = ein Anker mit ≥2 Varianten ODER
 *  mit Master. Wird in der Synthese-Sektion unten gerendert. */
interface AnchorClustersFile {
  generatedAt: string;
  clusters: Array<{
    anchor: string;
    endpoint: string;
    variantIds: string[];
    lastVariantTs: string;
    masterId: string | null;
    masterTs: string | null;
    masterStale: boolean;
  }>;
  stats: {
    totalAnchors: number;
    withMultipleVariants: number;
    withMaster: number;
    staleMasters: number;
  };
}

interface AutoCurateItem {
  id: string;
  decision: "approve" | "reject" | "review";
  reason: string;
  prompt: string;
  ai_score: number | null;
  corpusVoiceScore: number | null;
  conceptVoiceScore: number | null;
  werkVoiceScore: number | null;
  echoCount: number;
  novelty: boolean;
}
interface AutoCurateResult {
  mode: "preview" | "apply";
  thresholds: Record<string, number>;
  candidateCount: number;
  counts: { approve: number; reject: number; review: number };
  unscored: number;
  scored: number;
  approve: AutoCurateItem[];
  reject: AutoCurateItem[];
  review: AutoCurateItem[];
  applied?: Array<{ id: string; to: string; ok: boolean; error?: string }>;
}

const STATUS_FILTERS = ["all", "raw", "pending", "approved", "published", "rejected"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const AI_SCORE_FILTERS = ["all", "ungescored", "ge4", "ge3", "lt3"] as const;
type AiScoreFilter = typeof AI_SCORE_FILTERS[number];
const AI_SCORE_FILTER_LABEL: Record<AiScoreFilter, string> = {
  all:        "AI-Score: alle",
  ungescored: "AI: ungescored",
  ge4:        "AI ≥4",
  ge3:        "AI ≥3",
  lt3:        "AI ≤2",
};

/** Farb-Mapping pro AI-Score 1-5 (Design-Tightening D1).
 *  Kollabiert von 5 Hues auf 3 SEMANTIC-Klassen:
 *    1-2 = WARNUNG (rust)
 *    3   = neutral (muted)
 *    4-5 = WACHSTUM (mint)
 *  Die Zahl selbst (1-5) bleibt sichtbar — Differenzierung wandert vom
 *  Hue in die Numerik. */
function aiScoreColor(s: number | undefined): string {
  if (s === undefined) return "#888";
  if (s >= 4) return "#7ab898";  // WACHSTUM
  if (s <= 2) return "#c48282";  // WARNUNG
  return "#888";                  // neutral für 3
}

/** Chunk-Größe pro Bulk-Request. Der Server verarbeitet jede Charge mit
 *  EINEM Index-Schreibvorgang + Retry-on-conflict, daher keine parallelen
 *  client-seitigen Calls mehr (die vorher um den Index-SHA rannten → ~50%
 *  Ausfälle). Chunks dienen nur der Fortschritts-Granularität. */
const BULK_CHUNK_SIZE = 25;

/** Per-ID-Resultat einer Bulk-Operation (curate-bulk / delete-bulk). */
interface BulkActionResponse {
  ok: boolean;
  succeeded?: number;
  failed?: number;
  indexUpdated?: boolean;
  results?: { id: string; ok: boolean; error?: string }[];
}

export default function AdminCurationPage() {
  const C = useAdminTheme();

  const [index, setIndex] = useState<ResonanzIndex | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [aiScoreFilter, setAiScoreFilter] = useState<AiScoreFilter>("all");
  // AI-Pre-Score-Bulk-Progress (Feature E) — analog bulkProgress, eigene State
  // weil parallel zu Curation-Bulk laufen kann (verschieden Endpoints).
  const [preScoreProgress, setPreScoreProgress] = useState<{ done: number; total: number } | null>(null);
  const [curationLoading, setCurationLoading] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<ResonanzEntry | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);

  // Bulk-Curation-State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; status: string } | null>(null);
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  // Master-Synthese (Phase 4) — Anker-Cluster + pro-Cluster-Loading
  const [anchorClusters, setAnchorClusters] = useState<AnchorClustersFile | null>(null);
  const [synthLoading, setSynthLoading] = useState<Set<string>>(new Set());
  const [synthPreview, setSynthPreview] = useState<{ anchor: string; text: string } | null>(null);

  // Auto-Kuratierung — kontrollierte Selbst-Erweiterung
  const [autoCurate, setAutoCurate] = useState<AutoCurateResult | null>(null);
  const [autoCurateLoading, setAutoCurateLoading] = useState<"preview" | "apply" | null>(null);
  const [autoCurateError, setAutoCurateError] = useState<string | null>(null);

  useEffect(() => {
    loadResonanzenIndex().then(setIndex).catch(() => null);
    loadOptionalJson<AnchorClustersFile>("/resonanzen-anchor-clusters.json")
      .then(setAnchorClusters);
  }, []);

  /** Triggert Master-Synthese für einen Anker via /api/admin/synthesize-master.
   *  Bei Erfolg: zeigt Preview, refresht anchor-clusters.json (mit delay damit
   *  der Server-Side-Commit Zeit hat zum Propagieren). */
  async function synthesizeMaster(anchor: string, endpoint: string) {
    setSynthLoading(s => new Set(s).add(anchor));
    const result = await callAdminAction<{ ok: boolean; synthesisPreview?: string; wasUpdate?: boolean; variantCount?: number }>("synthesize-master", { anchor, endpoint });
    setSynthLoading(s => { const n = new Set(s); n.delete(anchor); return n; });
    recordAction({
      type: "synthesize-master", targetId: anchor, ok: result.ok,
      reason: result.ok ? undefined : (result.error ?? "Synthese-Fehler"),
      payload: { endpoint, wasUpdate: result.data?.wasUpdate, variantCount: result.data?.variantCount },
    });
    if (result.ok && result.data) {
      setSynthPreview({ anchor, text: result.data.synthesisPreview ?? "(kein Preview vom Server)" });
      setActionFeedback({
        id: "_synth",
        ok: true,
        msg: `Master ${result.data.wasUpdate ? "aktualisiert" : "erzeugt"} aus ${result.data.variantCount} Varianten`,
      });
      // Refresh anchor-clusters nach kurzer Verzögerung (CI hat noch nicht
      // gelaufen, aber die Datei selbst wurde server-side neu geschrieben).
      // Die echte anchor-clusters.json kommt erst beim nächsten Build,
      // aber der User sieht die Bestätigung im Toast/Preview.
      setTimeout(() => {
        loadOptionalJson<AnchorClustersFile>("/resonanzen-anchor-clusters.json?_t=" + Date.now())
          .then(d => d && setAnchorClusters(d));
        notifyIndexStale();  // S1: Master erscheint im Index (via CI) — andere Pages refreshen
      }, 1500);
    } else {
      setActionFeedback({ id: "_synth", ok: false, msg: result.error ?? "Synthese fehlgeschlagen" });
    }
    setTimeout(() => setActionFeedback(null), 5000);
  }

  const stats = useMemo(() => index ? computeStats(index.entries) : null, [index]);

  const filteredEntries = useMemo(() => {
    if (!index) return [];
    let xs = index.entries;
    if (statusFilter !== "all") xs = xs.filter(e => e.status === statusFilter);
    if (aiScoreFilter !== "all") {
      xs = xs.filter(e => {
        const s = e.ai_score;
        if (aiScoreFilter === "ungescored") return typeof s !== "number";
        if (typeof s !== "number") return false;
        if (aiScoreFilter === "ge4") return s >= 4;
        if (aiScoreFilter === "ge3") return s >= 3;
        if (aiScoreFilter === "lt3") return s <= 2;
        return true;
      });
    }
    return xs;
  }, [index, statusFilter, aiScoreFilter]);

  // M5: Filter-Groups für Chip-Builder im UnifiedSearch (hideTextInput-Modus).
  // "all"-Wert ist implizit (leere Auswahl = alle), daher aus Optionsliste raus.
  const filterGroups = useMemo<FilterGroup[]>(() => {
    if (!index || !stats) return [];
    return [
      {
        id: "status", label: "Status", multi: false,
        options: STATUS_FILTERS
          .filter(s => s !== "all")
          .map(s => ({ value: s, label: s, count: stats.byStatus[s] ?? 0 })),
      },
      {
        id: "ai_score", label: "AI-Score", multi: false,
        options: AI_SCORE_FILTERS
          .filter(s => s !== "all")
          .map(s => ({ value: s, label: AI_SCORE_FILTER_LABEL[s] })),
      },
    ];
  }, [index, stats]);

  const activeFilters = useMemo<ActiveFilters>(() => ({
    status: statusFilter !== "all" ? [statusFilter] : [],
    ai_score: aiScoreFilter !== "all" ? [aiScoreFilter] : [],
  }), [statusFilter, aiScoreFilter]);

  const handleFiltersChange = (next: ActiveFilters) => {
    setStatusFilter((next.status?.[0] as StatusFilter | undefined) ?? "all");
    setAiScoreFilter((next.ai_score?.[0] as AiScoreFilter | undefined) ?? "all");
    setShowAllEntries(false);
  };

  // Dummy-Source: UnifiedSearch verlangt ein nicht-leeres sources-Array,
  // aber im hideTextInput-Modus läuft keine Lex/Sem-Suche. Wir verwenden
  // den Wrapper rein für ChipBuilder + FilterPopover.
  const dummySource = useMemo<SearchSource>(() => ({
    id: "noop", type: "curation", label: "—",
    search: () => [],
  }), []);

  /** raw/pending-Einträge ohne AI-Score — Kandidaten für Bulk-Pre-Score. */
  const ungescoredCandidates = useMemo(() => {
    if (!index) return [] as ResonanzEntry[];
    return index.entries.filter(e =>
      (e.status === "raw" || e.status === "pending") && typeof e.ai_score !== "number"
    );
  }, [index]);

  /** Einträge mit AI-Score ≥4 (potenzielle Bulk-Approve-Kandidaten). */
  const highScoreRawCandidates = useMemo(() => {
    if (!index) return [] as ResonanzEntry[];
    return index.entries.filter(e =>
      e.status === "raw" && typeof e.ai_score === "number" && e.ai_score >= 4
    );
  }, [index]);

  /** Bulk-AI-Pre-Score: rate eine Liste von IDs nacheinander. */
  async function preScoreBulk(ids: string[]) {
    if (ids.length === 0) return;
    setPreScoreProgress({ done: 0, total: ids.length });
    // Wir rufen den Server pro ID einzeln auf, damit wir progress streamen
    // können. Server limitiert sich selber per Sleep zwischen Calls.
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const result = await callAdminAction<{ ok: boolean; score?: number; reason?: string }>("pre-score", { id });
        if (result.ok && result.data) {
          const sc = result.data.score;
          const rs = result.data.reason;
          setIndex(curr => curr ? {
            ...curr,
            entries: curr.entries.map(e =>
              e.id === id && typeof sc === "number"
                ? { ...e, ai_score: sc as 1|2|3|4|5, ai_score_reason: rs }
                : e
            ),
          } : curr);
          recordAction({ type: "pre-score", targetId: id, ok: true, payload: { score: sc } });
        } else {
          failed++;
          recordAction({ type: "pre-score", targetId: id, ok: false, reason: result.error ?? "Score-Fehler" });
        }
      } catch (err) {
        failed++;
        recordAction({ type: "pre-score", targetId: id, ok: false, reason: err instanceof Error ? err.message : String(err) });
      }
      done++;
      setPreScoreProgress({ done, total: ids.length });
    }
    setPreScoreProgress(null);
    // Bulk-Sammel-Eintrag für Übersicht im Log (zusätzlich zu den Einzel-Logs).
    recordAction({
      type: "bulk-pre-score", targetCount: ids.length, ok: failed === 0,
      reason: failed > 0 ? `${failed} von ${ids.length} fehlgeschlagen` : undefined,
    });
    setActionFeedback({
      id: "_pre_score",
      ok: failed === 0,
      msg: failed === 0
        ? `${ids.length} Einträge bewertet`
        : `${ids.length - failed}/${ids.length} bewertet (${failed} Fehler)`,
    });
    if (failed < ids.length) notifyIndexStale();
    setTimeout(() => setActionFeedback(null), 5000);
  }

  const visibleEntries = useMemo(
    () => showAllEntries ? filteredEntries : filteredEntries.slice(0, 20),
    [filteredEntries, showAllEntries],
  );
  const visibleEntriesRef = useRef(visibleEntries);
  visibleEntriesRef.current = visibleEntries;

  // Bei Filter-Wechsel: Selektion + Fokus zurücksetzen, sonst werden
  // unsichtbare Einträge mit-selektiert.
  useEffect(() => {
    setSelectedIds(new Set());
    setFocusedIndex(-1);
  }, [statusFilter, aiScoreFilter]);

  // Auto-Select: top-N raw-Einträge nach corpusVoiceScore (Buchstreue).
  // werkVoiceScore wäre die bessere Referenz, ist aber gated bis ≥10 publish
  // — also chicken-and-egg. corpusVoiceScore funktioniert ab Build-1.
  const topCuratable = useMemo(() => {
    if (!index) return [] as ResonanzEntry[];
    return index.entries
      .filter(e => e.status === "raw" && typeof e.corpusVoiceScore === "number")
      .sort((a, b) => (b.corpusVoiceScore ?? 0) - (a.corpusVoiceScore ?? 0))
      .slice(0, 10);
  }, [index]);

  // ─── API-Calls ─────────────────────────────────────────────────────────────

  async function runAutoCurate(mode: "preview" | "apply") {
    setAutoCurateLoading(mode);
    setAutoCurateError(null);
    const result = await callAdminAction<AutoCurateResult>("auto-curate", { mode, limit: 100 });
    setAutoCurateLoading(null);
    if (!result.ok || !result.data) {
      setAutoCurateError(result.error ?? "Auto-Kuratierung fehlgeschlagen");
      return;
    }
    setAutoCurate(result.data);
    if (mode === "apply") {
      recordAction({ type: "curate", targetId: "auto-curate", ok: true,
        payload: { approved: result.data.counts.approve, rejected: result.data.counts.reject } });
      // Index neu laden, damit die Status-Änderungen sichtbar werden.
      loadResonanzenIndex().then(setIndex).catch(() => null);
      broadcastIndexStale();
    }
  }

  async function curateEntry(id: string, newStatus: string) {
    setCurationLoading(s => new Set(s).add(id));
    setActionFeedback(null);
    const result = await callAdminAction("curate", { id, status: newStatus });
    setCurationLoading(s => { const n = new Set(s); n.delete(id); return n; });
    // F1: jede Mutation ins persistente Audit-Log — Erfolg UND Versagen.
    recordAction({
      type: "curate", targetId: id, ok: result.ok,
      reason: result.ok ? undefined : (result.error ?? "Unbekannter Fehler"),
      payload: { newStatus },
    });
    if (result.ok) {
      setIndex(curr => curr ? {
        ...curr,
        entries: curr.entries.map(e => e.id === id ? { ...e, status: newStatus as ResonanzEntry["status"] } : e),
      } : curr);
      setActionFeedback({ id, ok: true, msg: `Status → ${newStatus}` });
      notifyIndexStale();
    } else {
      setActionFeedback({ id, ok: false, msg: result.error ?? "Fehler" });
    }
    setTimeout(() => setActionFeedback(null), 3500);
  }

  async function deleteEntry(id: string) {
    setCurationLoading(s => new Set(s).add(id));
    setActionFeedback(null);
    const result = await callAdminAction("delete", { id });
    setCurationLoading(s => { const n = new Set(s); n.delete(id); return n; });
    recordAction({
      type: "delete", targetId: id, ok: result.ok,
      reason: result.ok ? undefined : (result.error ?? "Unbekannter Fehler"),
    });
    if (result.ok) {
      notifyIndexStale();
      setIndex(curr => curr ? {
        ...curr,
        count: curr.count - 1,
        entries: curr.entries.filter(e => e.id !== id),
      } : curr);
      setActionFeedback({ id, ok: true, msg: "gelöscht" });
    } else {
      setActionFeedback({ id, ok: false, msg: result.error ?? "Fehler" });
    }
    setConfirmDelete(null);
    setTimeout(() => setActionFeedback(null), 3500);
  }

  /** Bulk-Curate: schickt die IDs chunk-weise an den server-seitigen
   *  /api/admin/curate-bulk-Endpoint. Jede Charge wird dort mit EINEM
   *  Index-Schreibvorgang + Retry-on-conflict verarbeitet — kein paralleles
   *  Rennen um den Index-SHA mehr (das war die Ursache der ~50% Ausfälle). */
  async function bulkCurate(ids: string[], newStatus: string) {
    if (ids.length === 0) return;
    setBulkProgress({ done: 0, total: ids.length, status: newStatus });
    let done = 0;
    let failed = 0;
    const okSet = new Set<string>();

    for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
      try {
        const result = await callAdminAction<BulkActionResponse>("curate-bulk", { ids: chunk, status: newStatus });
        const perId = result.data?.results;
        if (perId && perId.length) {
          for (const r of perId) {
            if (r.ok) {
              okSet.add(r.id);
              recordAction({ type: "curate", targetId: r.id, ok: true, payload: { newStatus } });
            } else {
              failed++;
              recordAction({ type: "curate", targetId: r.id, ok: false, reason: r.error ?? "Server-Fehler", payload: { newStatus } });
            }
          }
        } else {
          // ganze Charge fehlgeschlagen (z.B. Auth/Netzwerk)
          failed += chunk.length;
          for (const id of chunk) {
            recordAction({ type: "curate", targetId: id, ok: false, reason: result.error ?? "Server-Fehler", payload: { newStatus } });
          }
        }
      } catch (err) {
        failed += chunk.length;
        for (const id of chunk) {
          recordAction({ type: "curate", targetId: id, ok: false, reason: err instanceof Error ? err.message : String(err), payload: { newStatus } });
        }
      }
      done = Math.min(ids.length, i + chunk.length);
      setBulkProgress({ done, total: ids.length, status: newStatus });
    }

    if (okSet.size) {
      setIndex(curr => curr ? {
        ...curr,
        entries: curr.entries.map(e => okSet.has(e.id) ? { ...e, status: newStatus as ResonanzEntry["status"] } : e),
      } : curr);
    }

    setBulkProgress(null);
    setSelectedIds(new Set());
    recordAction({
      type: "bulk-curate", targetCount: ids.length, ok: failed === 0,
      reason: failed > 0 ? `${failed} von ${ids.length} fehlgeschlagen` : undefined,
      payload: { newStatus },
    });
    if (failed < ids.length) notifyIndexStale();
    setActionFeedback({
      id: "_bulk", ok: failed === 0,
      msg: failed === 0
        ? `${ids.length}× ${newStatus}`
        : `${ids.length - failed}/${ids.length} ${newStatus} (${failed} fehlgeschlagen)`,
    });
    setTimeout(() => setActionFeedback(null), 4500);
  }

  async function bulkDelete(ids: string[]) {
    if (ids.length === 0) return;
    setBulkProgress({ done: 0, total: ids.length, status: "delete" });
    let done = 0; let failed = 0;
    const okSet = new Set<string>();

    for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
      try {
        const result = await callAdminAction<BulkActionResponse>("delete-bulk", { ids: chunk });
        const perId = result.data?.results;
        if (perId && perId.length) {
          for (const r of perId) {
            if (r.ok) {
              okSet.add(r.id);
              recordAction({ type: "delete", targetId: r.id, ok: true });
            } else {
              failed++;
              recordAction({ type: "delete", targetId: r.id, ok: false, reason: r.error ?? "Server-Fehler" });
            }
          }
        } else {
          failed += chunk.length;
          for (const id of chunk) {
            recordAction({ type: "delete", targetId: id, ok: false, reason: result.error ?? "Server-Fehler" });
          }
        }
      } catch (err) {
        failed += chunk.length;
        for (const id of chunk) {
          recordAction({ type: "delete", targetId: id, ok: false, reason: err instanceof Error ? err.message : String(err) });
        }
      }
      done = Math.min(ids.length, i + chunk.length);
      setBulkProgress({ done, total: ids.length, status: "delete" });
    }

    if (okSet.size) {
      setIndex(curr => curr ? {
        ...curr,
        count: curr.count - okSet.size,
        entries: curr.entries.filter(e => !okSet.has(e.id)),
      } : curr);
    }

    setBulkProgress(null);
    setSelectedIds(new Set());
    setBulkConfirmDelete(false);
    recordAction({
      type: "bulk-delete", targetCount: ids.length, ok: failed === 0,
      reason: failed > 0 ? `${failed} von ${ids.length} fehlgeschlagen` : undefined,
    });
    if (failed < ids.length) notifyIndexStale();
    setActionFeedback({
      id: "_bulk", ok: failed === 0,
      msg: failed === 0
        ? `${ids.length}× gelöscht`
        : `${ids.length - failed}/${ids.length} gelöscht (${failed} fehlgeschlagen)`,
    });
    setTimeout(() => setActionFeedback(null), 4500);
  }

  // ─── Keyboard-Shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Inputs/Textareas nicht beeinflussen
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      if (bulkProgress) return;  // während Bulk-Run alles blockieren
      const visible = visibleEntriesRef.current;
      const fIdx = focusedIndex;

      // Navigation
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(i => Math.min((i < 0 ? -1 : i) + 1, visible.length - 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(i => Math.max((i <= 0 ? 0 : i) - 1, 0));
        return;
      }
      // Selektion
      if (e.key === " " && fIdx >= 0) {
        e.preventDefault();
        const id = visible[fIdx]?.id;
        if (id) toggleSelection(id);
        return;
      }
      // Select all visible (raw)
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        const allRawIds = visible.filter(en => en.status === "raw").map(en => en.id);
        setSelectedIds(new Set(allRawIds));
        return;
      }
      // Escape: clear selection
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedIds(new Set());
        return;
      }
      // Status-Aktionen: wenn Selektion → bulk, sonst nur fokussierter Eintrag
      const actionable = selectedIds.size > 0
        ? Array.from(selectedIds)
        : (fIdx >= 0 ? [visible[fIdx]?.id].filter(Boolean) as string[] : []);
      if (actionable.length === 0) return;

      if (e.key === "p") { e.preventDefault(); void bulkCurate(actionable, "published"); return; }
      if (e.key === "a") { e.preventDefault(); void bulkCurate(actionable, "approved"); return; }
      if (e.key === "r") { e.preventDefault(); void bulkCurate(actionable, "rejected"); return; }
      if (e.key === "x") { e.preventDefault(); setBulkConfirmDelete(true); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, focusedIndex, bulkProgress]);

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Scroll-into-view bei Keyboard-Navigation, sonst läuft der Fokus
  // ausserhalb des sichtbaren Bereichs ohne dass der User es merkt.
  useEffect(() => {
    if (focusedIndex < 0) return;
    const el = document.getElementById(`curation-entry-${focusedIndex}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedIndex]);

  if (!index || !stats) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Skeleton height="1.4rem" width="55%" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem" }}>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={64} />)}
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={36} width={90} />)}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <Skeleton height="0.8rem" width="40%" subtle />
            <Skeleton height="1.2rem" width="85%" />
            <Skeleton height="0.7rem" lines={2} subtle />
          </div>
        ))}
      </div>
    );
  }

  const publishedCount = stats.byStatus["published"] ?? 0;
  const approvedCount = stats.byStatus["approved"] ?? 0;
  const kuratiertCount = publishedCount + approvedCount;
  const needsForWerkVoice = Math.max(0, 10 - kuratiertCount);

  return (
    <>
      {/* Übersichts-Counts kompakt */}
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "baseline" }}>
        <p style={{ fontStyle: "italic", fontSize: "0.85rem", color: C.textDim, margin: 0 }}>
          {index.count} Begegnungen total · {kuratiertCount} kuratiert
          {index.generatedAt ? ` · zuletzt erzeugt ${new Date(index.generatedAt).toLocaleString("de-DE")}` : ""}
        </p>
      </div>

      {/* F2: Werkstatt-Brief — kuratorische Leitsätze aus
          content/werkstatt/leitsaetze.md, deterministisch pro Kalendertag. */}
      <WerkstattEpigraph c={C} />

      {/* F1: Aktions-Protokoll — Erfolge und Misslungenes bleiben sichtbar,
          beide gleichermaßen ernstgenommen. „Wir verwandeln uns dort, wo wir versagen." */}
      <ActionLogPanel c={C} />

      <Section title="Übersicht — Status-Verteilung" c={C}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem" }}>
          {(["raw", "pending", "approved", "published", "rejected"] as const).map(s => (
            <Stat
              key={s}
              label={s}
              value={stats.byStatus[s] ?? 0}
              color={s === "published" ? "#7ab898" : s === "approved" ? "#5aacb8" : s === "pending" ? C.accentText : s === "rejected" ? "#c48282" : C.muted}
              c={C}
            />
          ))}
        </div>

        {/* werkVoiceScore-Unlock-Hint: ≥10 kuratiert sind die Schwelle, ab
            der der Build-Step werkVoiceScore (Centroid kuratierter Einträge)
            berechnet — bis dahin bleibt diese Diagnose dunkel. */}
        {needsForWerkVoice > 0 && (
          <div style={{
            marginTop: "0.8rem",
            fontFamily: SERIF, fontSize: "0.85rem", fontStyle: "italic",
            color: C.textDim, lineHeight: 1.5,
          }}>
            <strong style={{ color: C.accentText }}>{needsForWerkVoice} weitere kuratierte Einträge</strong>{" "}
            (approved oder published) bis <code style={{ fontFamily: MONO, color: C.accentText }}>werkVoiceScore</code>{" "}
            für alle 136 Einträge berechnet wird (Schwelle ≥10).
          </div>
        )}
      </Section>

      {/* Begriffsnetz-Wachstum: neue Begriffe vorschlagen (Phase 5c) */}
      <ProposeConceptPanel C={C} />

      {/* Auto-Kuratierung — kontrollierte Selbst-Erweiterung */}
      <Section title="Auto-Kuratierung — Korpus sicher selbst erweitern" c={C}>
        <div style={{ fontFamily: SERIF, fontSize: "0.85rem", fontStyle: "italic", color: C.textDim, lineHeight: 1.5, marginBottom: "0.8rem" }}>
          Klassifiziert raw/pending-Einträge in <strong style={{ color: "#7ab898" }}>freigeben</strong> ·{" "}
          <strong style={{ color: "#c48282" }}>ablehnen</strong> · <strong style={{ color: C.accentText }}>zur Prüfung</strong>.
          Gate: ai_score + corpusVoiceScore (Buchtext-Anker) + kein Echo, keine novelty. Nur klar-Gutes wird auto-freigegeben.
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
          <button
            onClick={() => runAutoCurate("preview")}
            disabled={autoCurateLoading !== null}
            style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.accentText, background: "none", border: `1px solid ${C.accent}`, padding: "0.5rem 0.8rem", cursor: autoCurateLoading ? "wait" : "pointer", minHeight: 36, opacity: autoCurateLoading ? 0.5 : 1 }}
          >
            {autoCurateLoading === "preview" ? "… prüfe" : "Auto-Kuratierung prüfen"}
          </button>
          {autoCurate && autoCurate.counts.approve + autoCurate.counts.reject > 0 && (
            <button
              onClick={() => runAutoCurate("apply")}
              disabled={autoCurateLoading !== null}
              style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#080808", background: "#7ab898", border: "1px solid #7ab898", padding: "0.5rem 0.8rem", cursor: autoCurateLoading ? "wait" : "pointer", minHeight: 36, opacity: autoCurateLoading ? 0.5 : 1 }}
            >
              {autoCurateLoading === "apply" ? "… übernehme (bewertet nach)" : `Vorschlag übernehmen (${autoCurate.counts.approve}↑ ${autoCurate.counts.reject}↓)`}
            </button>
          )}
        </div>
        {autoCurateError && <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: "#c48282", marginBottom: "0.6rem" }}>{autoCurateError}</div>}
        {autoCurate && (
          <div>
            <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap", fontFamily: MONO, fontSize: "0.62rem", marginBottom: "0.7rem" }}>
              <span style={{ color: "#7ab898" }}>↑ {autoCurate.counts.approve} freigeben</span>
              <span style={{ color: "#c48282" }}>↓ {autoCurate.counts.reject} ablehnen</span>
              <span style={{ color: C.accentText }}>? {autoCurate.counts.review} zur Prüfung</span>
              {autoCurate.unscored > 0 && autoCurate.mode === "preview" && (
                <span style={{ color: C.muted }}>· {autoCurate.unscored} nicht bewertet (Apply bewertet nach)</span>
              )}
              {autoCurate.mode === "apply" && <span style={{ color: "#7ab898" }}>✓ übernommen{autoCurate.scored > 0 ? ` (${autoCurate.scored} frisch bewertet)` : ""}</span>}
            </div>
            {/* Begründungen pro Kategorie — kompakt, scroll-bar */}
            {(["approve", "reject", "review"] as const).map(cat => {
              const items = autoCurate[cat];
              if (items.length === 0) return null;
              const col = cat === "approve" ? "#7ab898" : cat === "reject" ? "#c48282" : C.accentText;
              const label = cat === "approve" ? "FREIGEBEN" : cat === "reject" ? "ABLEHNEN" : "ZUR PRÜFUNG";
              return (
                <details key={cat} style={{ marginBottom: "0.4rem" }}>
                  <summary style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", color: col, cursor: "pointer" }}>
                    {label} · {items.length}
                  </summary>
                  <div style={{ maxHeight: 220, overflowY: "auto", marginTop: "0.4rem", paddingLeft: "0.5rem", borderLeft: `2px solid ${col}` }}>
                    {items.map(it => (
                      <div key={it.id} style={{ marginBottom: "0.4rem", fontFamily: SERIF, fontSize: "0.74rem", color: C.text, lineHeight: 1.4 }}>
                        <span style={{ fontStyle: "italic" }}>{it.prompt}…</span>
                        <span style={{ display: "block", fontFamily: MONO, fontSize: "0.52rem", color: C.muted }}>
                          {it.reason} · ai {it.ai_score ?? "—"} · corpusVoice {it.corpusVoiceScore != null ? it.corpusVoiceScore.toFixed(2) : "—"}{it.conceptVoiceScore != null ? ` · conceptVoice ${it.conceptVoiceScore.toFixed(2)}` : ""}{it.echoCount > 0 ? ` · echo ${it.echoCount}` : ""}{it.novelty ? " · novelty" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Section>

      {/* Anker-Cluster — Anker mit ≥2 Varianten, kandidat für Master-Synthese
          (Phase 4). Liest aus resonanzen-anchor-clusters.json. */}
      {anchorClusters && anchorClusters.clusters.length > 0 && (
        <Section title="Anker-Cluster — Fragen mit mehreren Varianten" c={C}>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.88rem", color: C.textDim, lineHeight: 1.5, marginTop: 0, marginBottom: "0.9rem" }}>
            {anchorClusters.stats.withMultipleVariants} Anker mit ≥2 Varianten ·{" "}
            {anchorClusters.stats.withMaster} mit Master
            {anchorClusters.stats.staleMasters > 0 && (
              <span style={{ color: "#c48282" }}> · {anchorClusters.stats.staleMasters} stale</span>
            )}
            . Klick „⚡ Master synthetisieren" konsolidiert die Varianten
            via Claude zu einem Master-Dokument, in dem jede Information
            nur einmal vorkommt.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            {anchorClusters.clusters.filter(c => c.variantIds.length >= 2 || c.masterId).map(c => {
              const isLoading = synthLoading.has(c.anchor);
              const hasMaster = !!c.masterId;
              const masterDate = c.masterTs ? new Date(c.masterTs) : null;
              const ageDays = masterDate ? Math.floor((Date.now() - masterDate.getTime()) / 86400000) : null;
              return (
                <div key={c.anchor} style={{
                  background: c.masterStale ? "rgba(196,130,130,0.06)" : C.surface,
                  border: `1px solid ${c.masterStale ? "#c48282" : C.border}`,
                  borderLeft: `3px solid ${c.masterStale ? "#c48282" : hasMaster ? "#7ab898" : "#5aacb8"}`,
                  padding: "0.6rem 0.8rem",
                  display: "flex", alignItems: "center", gap: "0.7rem", flexWrap: "wrap",
                }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.05em", color: C.text, marginBottom: "0.18rem", wordBreak: "break-all" }}>
                      {c.anchor}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: "0.52rem", color: C.muted }}>
                      {c.endpoint} · {c.variantIds.length} Varianten
                      {hasMaster && ageDays !== null && (
                        <>
                          {" · "}
                          {c.masterStale ? (
                            <span style={{ color: "#c48282" }}>Master STALE (vor {ageDays} Tag{ageDays === 1 ? "" : "en"})</span>
                          ) : (
                            <span style={{ color: "#7ab898" }}>✓ Master vor {ageDays} Tag{ageDays === 1 ? "" : "en"}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => void synthesizeMaster(c.anchor, c.endpoint)}
                    disabled={isLoading || c.variantIds.length < 2}
                    title={c.variantIds.length < 2
                      ? "Mindestens 2 Varianten nötig"
                      : hasMaster ? "Master neu synthetisieren (~10-30 Sek)" : "Erste Synthese starten (~10-30 Sek)"}
                    style={{
                      fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: isLoading ? C.muted : hasMaster ? "#c48282" : "#5aacb8",
                      background: hasMaster ? "rgba(196,130,130,0.06)" : "rgba(126,184,200,0.08)",
                      border: `1px solid ${hasMaster ? "rgba(196,130,130,0.4)" : "rgba(126,184,200,0.5)"}`,
                      padding: "0.5rem 0.8rem",
                      cursor: isLoading || c.variantIds.length < 2 ? "wait" : "pointer",
                      opacity: isLoading || c.variantIds.length < 2 ? 0.5 : 1,
                      minHeight: 36, flexShrink: 0,
                    }}
                  >
                    {isLoading ? "Claude denkt …" : hasMaster ? "↻ neu synthetisieren" : "⚡ Master synthetisieren"}
                  </button>
                </div>
              );
            })}
          </div>
          {/* Synthese-Preview-Overlay nach Erfolg */}
          {synthPreview && (
            <div style={{
              marginTop: "1rem", padding: "0.9rem 1.1rem",
              background: "rgba(122,184,152,0.06)",
              border: "1px solid rgba(122,184,152,0.4)",
              borderLeft: "3px solid #7ab898",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                <div style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#7ab898" }}>
                  ◆ Master-Preview · {synthPreview.anchor}
                </div>
                <button
                  onClick={() => setSynthPreview(null)}
                  style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, background: "none", border: "none", cursor: "pointer" }}
                >
                  ✕ schließen
                </button>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: "0.85rem", fontStyle: "italic", color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {synthPreview.text}
                {synthPreview.text.length >= 500 && "…"}
              </div>
              <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, marginTop: "0.6rem", marginBottom: 0 }}>
                Master ist auf GitHub gepushed, erscheint auf /resonanzen nach dem nächsten CI-Build (~2-3 Min).
              </p>
            </div>
          )}
        </Section>
      )}

      {/* AI-Pre-Score-Section (Tier-1-3-Roadmap, Feature E):
          Bewertet raw/pending-Einträge via Claude auf einer 1-5-Skala.
          Beschleunigt die Werk-Voice-Reifung (Bulk-Approve nach AI-Score). */}
      <Section title="AI-Pre-Score — Werktreue automatisch bewerten" c={C}>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.88rem", color: C.textDim, lineHeight: 1.55, marginTop: 0, marginBottom: "0.9rem" }}>
          Claude liest jeden Eintrag und vergibt 1–5 Punkte für Werktreue (stilistisch + thematisch).
          Bulk-Run dauert ~3-5 s pro Eintrag. Danach: Filter „AI ≥4" → Bulk-Approve.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            onClick={() => void preScoreBulk(ungescoredCandidates.map(e => e.id))}
            disabled={!!preScoreProgress || ungescoredCandidates.length === 0}
            style={{
              fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#5aacb8",
              background: "rgba(126,184,200,0.08)",
              border: "1px solid rgba(126,184,200,0.5)",
              padding: "0.55rem 0.85rem", cursor: preScoreProgress ? "wait" : "pointer",
              opacity: ungescoredCandidates.length === 0 ? 0.4 : 1,
              minHeight: 36,
            }}
          >
            {preScoreProgress
              ? `Claude bewertet … (${preScoreProgress.done}/${preScoreProgress.total})`
              : `⚡ AI-Pre-Score laufen lassen (${ungescoredCandidates.length} ungescored)`}
          </button>
          {highScoreRawCandidates.length > 0 && (
            <button
              onClick={() => setSelectedIds(new Set(highScoreRawCandidates.map(e => e.id)))}
              title="Alle raw-Einträge mit AI-Score ≥4 als Bulk-Approve-Selektion vorbereiten"
              style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em",
                textTransform: "uppercase", color: "#7ab898",
                background: "rgba(122,184,152,0.08)",
                border: "1px solid rgba(122,184,152,0.5)",
                padding: "0.55rem 0.85rem", cursor: "pointer", minHeight: 36,
              }}
            >
              ✓ Top {highScoreRawCandidates.length} (Score ≥4) auswählen
            </button>
          )}
          {preScoreProgress && (
            <div style={{
              flex: "1 1 200px",
              height: 6,
              background: C.surface,
              border: `1px solid ${C.border}`,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${100 * preScoreProgress.done / preScoreProgress.total}%`,
                background: "#5aacb8", transition: "width 0.2s",
              }} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Korpus-Verwaltung" c={C}>
        {/* Auto-Select-Vorschlag — surfaces top-N raw-Einträge nach
            corpusVoiceScore als Bulk-Kuratierung-Kandidaten. */}
        {topCuratable.length > 0 && (
          <div style={{
            marginBottom: "0.8rem",
            padding: "0.7rem 0.9rem",
            background: "rgba(126,184,200,0.06)",
            border: "1px solid rgba(126,184,200,0.3)",
            borderRadius: 4,
            display: "flex", alignItems: "center", gap: "0.7rem", flexWrap: "wrap",
          }}>
            <div style={{ flex: "1 1 200px", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text }}>
              <strong style={{ color: "#5aacb8" }}>Vorschlag:</strong> Top {topCuratable.length} raw-Einträge nach
              Buchstreue (corpusVoiceScore) wählen, ohne einzeln anklicken.
            </div>
            <button
              onClick={() => setSelectedIds(new Set(topCuratable.map(e => e.id)))}
              style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em",
                textTransform: "uppercase", color: "#5aacb8",
                background: "rgba(126,184,200,0.08)",
                border: "1px solid rgba(126,184,200,0.5)",
                padding: "0.5rem 0.8rem", cursor: "pointer", minHeight: 36,
              }}
            >
              ✓ Top {topCuratable.length} wählen
            </button>
          </div>
        )}

        {/* Tastatur-Shortcuts-Hint */}
        <div style={{
          marginBottom: "0.8rem",
          fontFamily: MONO, fontSize: "0.58rem",
          letterSpacing: "0.05em", color: C.muted, lineHeight: 1.7,
        }}>
          Tastatur:{" "}
          <kbd style={kbdStyle(C)}>j</kbd>/<kbd style={kbdStyle(C)}>k</kbd> Navigieren ·{" "}
          <kbd style={kbdStyle(C)}>Space</kbd> Markieren ·{" "}
          <kbd style={kbdStyle(C)}>Ctrl+A</kbd> Alle raw ·{" "}
          <kbd style={kbdStyle(C)}>p</kbd> Publish ·{" "}
          <kbd style={kbdStyle(C)}>a</kbd> Approve ·{" "}
          <kbd style={kbdStyle(C)}>r</kbd> Reject ·{" "}
          <kbd style={kbdStyle(C)}>x</kbd> Delete ·{" "}
          <kbd style={kbdStyle(C)}>Esc</kbd> Auswahl löschen
        </div>

        {/* M5: Status + AI-Score als Chip-Builder.
            Ersetzt die vorher zwei separaten Pill-Rows (~30 Buttons). */}
        <div style={{ marginBottom: "0.8rem" }}>
          <UnifiedSearch
            scope="page"
            scopeId="admin-curation"
            sources={[dummySource]}
            filterGroups={filterGroups}
            filters={activeFilters}
            onFiltersChange={handleFiltersChange}
            hideTextInput
            onSelect={() => { /* nicht relevant im Chip-only-Modus */ }}
          />
        </div>

        {filteredEntries.length === 0 ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>Keine Einträge mit diesem Status.</p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {visibleEntries.map((entry, idx) => {
                const isLoading = curationLoading.has(entry.id);
                const fb = actionFeedback?.id === entry.id ? actionFeedback : null;
                const isSelected = selectedIds.has(entry.id);
                const isFocused = idx === focusedIndex;
                return (
                  <div
                    key={entry.id}
                    id={`curation-entry-${idx}`}
                    style={{
                      background: isSelected ? `${C.accent}11` : C.surface,
                      border: `1px solid ${isFocused ? C.accent : isSelected ? C.accentDim : C.border}`,
                      borderLeft: `3px solid ${isSelected ? C.accent : isFocused ? C.accentDim : "transparent"}`,
                      padding: "0.7rem 0.9rem",
                      display: "flex", gap: "0.7rem",
                      transition: "all 0.1s",
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(entry.id)}
                      aria-label={`Eintrag ${entry.id} auswählen`}
                      style={{
                        marginTop: "0.25rem", cursor: "pointer",
                        accentColor: C.accent,
                        width: 18, height: 18, flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* A1: Card-Header neu sortiert — Endpoint+Status links (Quelle/Zustand),
                          Scores+Datum rechts (Bewertung/Provenienz). Trenn-Geste statt
                          gleichgewichtige Reihe. */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem", gap: "0.5rem", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: "0.35rem", alignItems: "baseline" }}>
                          <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint] }}>
                            {ENDPOINT_LABEL[entry.endpoint]}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: entry.status === "published" ? "#7ab898" : entry.status === "rejected" ? "#c48282" : C.muted }}>
                            · {entry.status}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "0.3rem", alignItems: "baseline" }}>
                          {typeof entry.ai_score === "number" && (
                            <span
                              style={{
                                fontFamily: MONO, fontSize: "0.48rem", letterSpacing: "0.06em",
                                color: aiScoreColor(entry.ai_score),
                                padding: 0,
                              }}
                              title={entry.ai_score_reason ? `AI-Score ${entry.ai_score}/5 — ${entry.ai_score_reason}` : `AI-Score ${entry.ai_score}/5`}
                            >
                              AI {entry.ai_score}/5
                            </span>
                          )}
                          {typeof entry.corpusVoiceScore === "number" && (
                            <span style={{ fontFamily: MONO, fontSize: "0.48rem", color: entry.corpusVoiceScore >= 0.65 ? "#7ab898" : entry.corpusVoiceScore >= 0.55 ? C.accentText : "#c48282" }} title="corpusVoiceScore (Buchstreue)">
                              · BV {(entry.corpusVoiceScore * 100).toFixed(0)}%
                            </span>
                          )}
                          <time style={{ fontFamily: MONO, fontSize: "0.48rem", color: C.muted, marginLeft: "0.2rem" }}>
                            {new Date(entry.ts).toLocaleDateString("de-DE", { month: "short", day: "numeric" })}
                          </time>
                        </div>
                      </div>
                      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text, lineHeight: 1.4, marginBottom: "0.5rem" }}>
                        {entry.prompt.length > 130 ? entry.prompt.slice(0, 130) + "…" : entry.prompt}
                      </div>

                      {/* Action-Bar (per-entry).
                          A1: Permalink-Pfeil als Italic-Text-Link separat (Navigation,
                          nicht Aktion) — visuell anders gewichtet als die Status-Aktionen. */}
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
                        {entry.status !== "published" && (
                          <ActionBtn label="✓ Publish" color="#7ab898" disabled={isLoading} onClick={() => curateEntry(entry.id, "published")} />
                        )}
                        {entry.status !== "approved" && entry.status !== "published" && (
                          <ActionBtn label="✓ Approve" color="#5aacb8" disabled={isLoading} onClick={() => curateEntry(entry.id, "approved")} />
                        )}
                        {entry.status !== "pending" && entry.status !== "raw" && (
                          <ActionBtn label="↺ Pending" color={C.accent} disabled={isLoading} onClick={() => curateEntry(entry.id, "pending")} />
                        )}
                        {entry.status !== "rejected" && (
                          <ActionBtn label="✕ Reject" color="#c48282" disabled={isLoading} onClick={() => curateEntry(entry.id, "rejected")} />
                        )}
                        <ActionBtn label="🗑 Löschen" color="#c48282" disabled={isLoading} onClick={() => setConfirmDelete(entry)} variant="outline" />
                        <a
                          href={`/resonanzen?id=${entry.id}`}
                          target="_blank" rel="noreferrer"
                          style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.7rem", color: C.muted, padding: "0 0.3rem", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px", marginLeft: "auto" }}
                          title="Eintrag auf /resonanzen öffnen"
                        >↗ ansehen</a>
                      </div>

                      {fb && (
                        <div style={{ marginTop: "0.4rem", fontFamily: MONO, fontSize: "0.55rem", color: fb.ok ? "#7ab898" : "#c48282" }}>
                          {fb.ok ? "✓" : "✕"} {fb.msg}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredEntries.length > 20 && !showAllEntries && (
              <button
                onClick={() => setShowAllEntries(true)}
                style={{ marginTop: "0.7rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.5rem 0.8rem", cursor: "pointer", minHeight: 36 }}
              >
                + {filteredEntries.length - 20} weitere zeigen
              </button>
            )}
          </>
        )}
      </Section>

      {/* Sticky Bulk-Action-Bar — nur wenn Auswahl aktiv */}
      {selectedIds.size > 0 && !bulkProgress && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: C.deep,
          borderTop: `2px solid ${C.accent}`,
          padding: "0.8rem 1rem calc(0.8rem + env(safe-area-inset-bottom, 0px))",
          display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.accentText, flexShrink: 0 }}>
            {selectedIds.size} ausgewählt
          </div>
          <ActionBtn label="✓ Publish alle" color="#7ab898" onClick={() => void bulkCurate(Array.from(selectedIds), "published")} />
          <ActionBtn label="✓ Approve alle" color="#5aacb8" onClick={() => void bulkCurate(Array.from(selectedIds), "approved")} />
          <ActionBtn label="↺ Pending alle" color={C.accent} onClick={() => void bulkCurate(Array.from(selectedIds), "pending")} />
          <ActionBtn label="✕ Reject alle" color="#c48282" onClick={() => void bulkCurate(Array.from(selectedIds), "rejected")} />
          <ActionBtn label="🗑 Löschen alle" color="#c48282" variant="outline" onClick={() => setBulkConfirmDelete(true)} />
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.45rem 0.6rem", cursor: "pointer", minHeight: 36, marginLeft: "auto" }}
          >
            Esc abbrechen
          </button>
        </div>
      )}

      {/* Bulk-Progress-Overlay */}
      {bulkProgress && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: C.deep, border: `1px solid ${C.accent}`,
            padding: "1.5rem 2rem", borderRadius: 8, minWidth: 280, textAlign: "center",
          }}>
            <div style={{ fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: C.accentText, marginBottom: "0.7rem" }}>
              Bulk-{bulkProgress.status}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: "1.5rem", color: C.text, marginBottom: "0.4rem" }}>
              {bulkProgress.done} / {bulkProgress.total}
            </div>
            <div style={{ width: "100%", height: 4, background: C.surface, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: `${(bulkProgress.done / bulkProgress.total) * 100}%`,
                height: "100%", background: C.accent,
                transition: "width 0.2s",
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Confirmation-Dialog für Single-Delete */}
      {confirmDelete && (
        <DeleteConfirm
          entry={confirmDelete}
          loading={curationLoading.has(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteEntry(confirmDelete.id)}
          theme={{ deep: C.deep, border: C.border, muted: C.muted, text: C.text }}
        />
      )}

      {/* Confirmation-Dialog für Bulk-Delete */}
      {bulkConfirmDelete && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 400,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)", padding: "1rem",
        }}>
          <div style={{
            background: C.deep, border: `1px solid #c48282`,
            padding: "1.4rem 1.6rem", borderRadius: 8, maxWidth: 440,
          }}>
            <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "#c48282", marginBottom: "0.7rem" }}>
              {selectedIds.size}× Löschen — irreversibel
            </div>
            <p style={{ fontFamily: SERIF, fontSize: "0.92rem", fontStyle: "italic", color: C.text, lineHeight: 1.5, marginTop: 0 }}>
              <strong>{selectedIds.size}</strong> Einträge werden dauerhaft aus dem Korpus
              entfernt (raw-Markdown + Index). Diese Aktion kann nicht rückgängig
              gemacht werden.
            </p>
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button
                onClick={() => setBulkConfirmDelete(false)}
                style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.5rem 0.9rem", cursor: "pointer", minHeight: 36 }}
              >Abbrechen</button>
              <button
                onClick={() => void bulkDelete(Array.from(selectedIds))}
                style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#080808", background: "#c48282", border: "1px solid #c48282", padding: "0.5rem 0.9rem", cursor: "pointer", minHeight: 36 }}
              >🗑 Wirklich löschen</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk-Action-Feedback-Toast (für non-error _bulk) */}
      {actionFeedback?.id === "_bulk" && (
        <div style={{
          position: "fixed", bottom: "5rem", left: "50%", transform: "translateX(-50%)",
          background: actionFeedback.ok ? "#7ab898" : "#c48282",
          color: "#080808", padding: "0.6rem 1rem", borderRadius: 4, zIndex: 250,
          fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.1em",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          {actionFeedback.ok ? "✓" : "⚠"} {actionFeedback.msg}
        </div>
      )}
    </>
  );
}

function kbdStyle(C: Palette): React.CSSProperties {
  return {
    fontFamily: MONO, fontSize: "0.62rem",
    background: C.surface, color: C.text,
    border: `1px solid ${C.border}`,
    padding: "0.05rem 0.35rem", borderRadius: 3,
  };
}

// ─── ActionBtn (lokal, kompakte Variante) ─────────────────────────────────

function ActionBtn({ label, color, disabled, onClick, variant = "filled" }: {
  label: string; color: string; disabled?: boolean; onClick: () => void;
  variant?: "filled" | "outline";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase",
        color: variant === "filled" ? "#080808" : color,
        background: variant === "filled" ? color : "none",
        border: `1px solid ${color}`,
        padding: "0.45rem 0.6rem",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.5 : 1,
        minHeight: 36,
        transition: "all 0.15s",
      }}
    >{label}</button>
  );
}

// Re-export Palette für Typprüfung (vermeidet ungenutzten Import-Warning)
export type { Palette };
