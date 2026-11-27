/**
 * Eine Erkenntnis unter ihrer festen Adresse (/erkenntnisse/:id).
 */
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { NODES } from "@/data/conceptGraph";
import { SITE_URL } from "@/lib/siteUrl";
import { loadErkenntnisse } from "@/lib/erkenntnisse";
import { buildErkenntnisFeed, type FeedItem } from "@/lib/erkenntnisFeed";
import { loadResonanzenIndexLazy } from "@/lib/resonanzenIndex";
import { citeApa, citePlain } from "@shared/erkenntnisCite";
import SiteFooter from "@/components/SiteFooter";

const labels = new Map(NODES.map(node => [node.id, node.fullLabel]));

export default function ErkenntnisCitePage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [, params] = useRoute("/erkenntnisse/:id");
  const [, enParams] = useRoute("/en/erkenntnisse/:id");
  const id = decodeURIComponent(params?.id || enParams?.id || "");
  const [item, setItem] = useState<FeedItem | null | undefined>(undefined);
  const [copied, setCopied] = useState<"apa" | "plain" | null>(null);

  useEffect(() => {
    if (!id) return;
    const key = `rv-view-${id}`;
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        void fetch("/api/views/erkenntnis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
      }
    } catch { /* privater Modus */ }
    Promise.all([loadErkenntnisse(), loadResonanzenIndexLazy()]).then(([erk, index]) => {
      const found = buildErkenntnisFeed(erk, index?.entries ?? []).find(entry => entry.id === id) ?? null;
      setItem(found);
    });
  }, [id]);

  const copy = async (kind: "apa" | "plain", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  };

  const citable = item ? { id: item.id, text: item.text, createdAt: item.createdAt } : null;
  const apa = citable ? citeApa(citable, SITE_URL) : "";
  const plain = citable ? citePlain(citable, SITE_URL) : "";

  return (
    <div data-scroll style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.6rem 1.4rem 0" }}>
        <Link href="/erkenntnisse" style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accentText, textDecoration: "none" }}>Alle Erkenntnisse</Link>
        {item === undefined && <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p>}
        {item === null && <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>Diese Erkenntnis gibt es nicht.</p>}
        {item && (
          <>
            <h1 style={{ fontFamily: DISPLAY, fontSize: "1.7rem", lineHeight: 1.35, color: C.textBright }}>{item.text}</h1>
            <p style={{ fontFamily: MONO, fontSize: "0.6rem", color: C.muted }}>
              {item.createdAt.slice(0, 10)}
              {item.conceptAnchor ? <> · <Link href={`/landkarte?begriff=${encodeURIComponent(item.conceptAnchor)}`} style={{ color: C.accentText }}>{labels.get(item.conceptAnchor) ?? item.conceptAnchor}</Link></> : null}
              {item.kind === "master" ? " · Synthese" : ""}
            </p>
            <h2 style={{ fontFamily: DISPLAY, fontSize: "1.2rem", color: C.textBright }}>Zitieren</h2>
            <Quote C={C} label="APA" text={apa} copied={copied === "apa"} onCopy={() => copy("apa", apa)} />
            <Quote C={C} label="Klartext" text={plain} copied={copied === "plain"} onCopy={() => copy("plain", plain)} />
            <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>
              Zitierfähig ist dieser deutsche Wortlaut. Die Adresse bleibt <span style={{ fontFamily: MONO, fontSize: "0.8rem" }}>/erkenntnisse/{item.id}</span>.
            </p>
          </>
        )}
        <SiteFooter c={C} />
      </div>
    </div>
  );
}

function Quote({ C, label, text, copied, onCopy }: { C: Palette; label: string; text: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ marginBottom: "0.8rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
        <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>{label}</span>
        <button type="button" onClick={onCopy} style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accentText, background: "none", border: "none", cursor: "pointer" }}>{copied ? "kopiert" : "kopieren"}</button>
      </div>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: SERIF, fontSize: "0.95rem", lineHeight: 1.45, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.7rem 0.8rem" }}>{text}</pre>
    </div>
  );
}
