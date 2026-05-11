/**
 * AdminCurationPage (/admin) — Korpus-Verwaltung mit Status-Filter,
 * Eintragsliste und Action-Buttons (publish/approve/pending/reject/delete).
 *
 * Nutzt:
 *   - useAdminAuth() (für Token-Status, indirekt via AdminLayout vorgegeben)
 *   - callAdminAction() für die API-Calls
 *   - DeleteConfirm-Modal für Lösch-Bestätigung
 */
import { useEffect, useMemo, useState } from "react";
import {
  loadResonanzenIndex,
  ENDPOINT_LABEL, ENDPOINT_COLOR,
  type ResonanzEntry, type ResonanzIndex,
} from "@/lib/resonanzenIndex";
import { callAdminAction } from "@/lib/adminAuth";
import DeleteConfirm from "@/components/admin/DeleteConfirm";
import Skeleton from "@/components/Skeleton";
import {
  Section, Stat, useAdminTheme, computeStats, MONO, SERIF, type Palette,
} from "./adminShared";

const STATUS_FILTERS = ["all", "raw", "pending", "approved", "published", "rejected"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function AdminCurationPage() {
  const C = useAdminTheme();

  const [index, setIndex] = useState<ResonanzIndex | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [curationLoading, setCurationLoading] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<ResonanzEntry | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);

  useEffect(() => {
    loadResonanzenIndex().then(setIndex).catch(() => null);
  }, []);

  const stats = useMemo(() => index ? computeStats(index.entries) : null, [index]);

  const filteredEntries = useMemo(() => {
    if (!index) return [];
    if (statusFilter === "all") return index.entries;
    return index.entries.filter(e => e.status === statusFilter);
  }, [index, statusFilter]);

  async function curateEntry(id: string, newStatus: string) {
    setCurationLoading(s => new Set(s).add(id));
    setActionFeedback(null);
    const result = await callAdminAction("curate", { id, status: newStatus });
    setCurationLoading(s => { const n = new Set(s); n.delete(id); return n; });
    if (result.ok) {
      setIndex(curr => curr ? {
        ...curr,
        entries: curr.entries.map(e => e.id === id ? { ...e, status: newStatus as ResonanzEntry["status"] } : e),
      } : curr);
      setActionFeedback({ id, ok: true, msg: `Status → ${newStatus}` });
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
    if (result.ok) {
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

  return (
    <>
      {/* Übersichts-Counts kompakt */}
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "baseline" }}>
        <p style={{ fontStyle: "italic", fontSize: "0.85rem", color: C.textDim, margin: 0 }}>
          {index.count} Begegnungen total · {kuratiertCount} kuratiert
          {index.generatedAt ? ` · zuletzt erzeugt ${new Date(index.generatedAt).toLocaleString("de-DE")}` : ""}
        </p>
      </div>

      <Section title="Übersicht — Status-Verteilung" c={C}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem" }}>
          {(["raw", "pending", "approved", "published", "rejected"] as const).map(s => (
            <Stat
              key={s}
              label={s}
              value={stats.byStatus[s] ?? 0}
              color={s === "published" ? "#7ab898" : s === "approved" ? "#5aacb8" : s === "pending" ? C.accent : s === "rejected" ? "#c48282" : C.muted}
              c={C}
            />
          ))}
        </div>
      </Section>

      <Section title="Korpus-Verwaltung" c={C}>
        {/* Status-Filter-Pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.8rem" }}>
          {STATUS_FILTERS.map(s => {
            const count = s === "all" ? index.count : (stats.byStatus[s] ?? 0);
            const active = statusFilter === s;
            const color = s === "published" ? "#7ab898" : s === "approved" ? "#5aacb8" : s === "pending" ? C.accent : s === "rejected" ? "#c48282" : C.muted;
            return (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setShowAllEntries(false); }}
                style={{
                  fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                  color: active ? "#080808" : color,
                  background: active ? color : "none",
                  border: `1px solid ${color}`,
                  padding: "0.5rem 0.7rem", cursor: "pointer", minHeight: 36,
                }}
              >
                {s} ({count})
              </button>
            );
          })}
        </div>

        {filteredEntries.length === 0 ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>Keine Einträge mit diesem Status.</p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {(showAllEntries ? filteredEntries : filteredEntries.slice(0, 20)).map(entry => {
                const isLoading = curationLoading.has(entry.id);
                const fb = actionFeedback?.id === entry.id ? actionFeedback : null;
                return (
                  <div key={entry.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "0.7rem 0.9rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem", gap: "0.5rem", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: "0.4rem", alignItems: "baseline" }}>
                        <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint] }}>
                          {ENDPOINT_LABEL[entry.endpoint]}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: entry.status === "published" ? "#7ab898" : entry.status === "rejected" ? "#c48282" : C.muted }}>
                          · {entry.status}
                        </span>
                      </div>
                      <time style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted }}>
                        {new Date(entry.ts).toLocaleDateString("de-DE", { year: "numeric", month: "short", day: "numeric" })}
                      </time>
                    </div>
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text, lineHeight: 1.4, marginBottom: "0.5rem" }}>
                      {entry.prompt.length > 130 ? entry.prompt.slice(0, 130) + "…" : entry.prompt}
                    </div>

                    {/* Action-Bar */}
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
                        style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, padding: "0.4rem 0.5rem", textDecoration: "none", marginLeft: "auto" }}
                      >↗ Wissen</a>
                    </div>

                    {fb && (
                      <div style={{ marginTop: "0.4rem", fontFamily: MONO, fontSize: "0.55rem", color: fb.ok ? "#7ab898" : "#c48282" }}>
                        {fb.ok ? "✓" : "✕"} {fb.msg}
                      </div>
                    )}
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

      {/* Confirmation-Dialog für Delete */}
      {confirmDelete && (
        <DeleteConfirm
          entry={confirmDelete}
          loading={curationLoading.has(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteEntry(confirmDelete.id)}
          theme={{ deep: C.deep, border: C.border, muted: C.muted, text: C.text }}
        />
      )}
    </>
  );
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
