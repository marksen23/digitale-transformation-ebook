/**
 * Hörfassung (/hoeren). Kernsätze und kurze Kapitelimpulse,
 * gesprochen von der Stimme des Browsers.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { loadErkenntnisse, type Erkenntnis } from "@/lib/erkenntnisse";
import { audibleKernsaetze, chapterImpulse } from "@/lib/speechText";
import type { EbookFile } from "@/lib/werkChunks";
import SpeakButton from "@/components/SpeakButton";
import SiteFooter from "@/components/SiteFooter";

interface Impulse {
  id: string;
  title: string;
  part: string;
  text: string;
}

export default function HoerenPage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [kern, setKern] = useState<Erkenntnis[] | null>(null);
  const [impulses, setImpulses] = useState<Impulse[] | null>(null);
  const [voice, setVoice] = useState(true);

  useEffect(() => {
    setVoice(typeof window !== "undefined" && "speechSynthesis" in window);
    Promise.all([
      loadErkenntnisse(),
      fetch("/resonanzen-erkenntnis-withdrawn.json", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([list, held]) => {
      const blocked = Array.isArray(held?.answerIds) ? held.answerIds as string[] : [];
      setKern(audibleKernsaetze(list, blocked));
    });
    fetch("/ebook_structured.json").then(r => r.json()).then((book: EbookFile) => {
      const rows: Impulse[] = [];
      for (const chapter of book.chapters ?? []) {
        const text = chapterImpulse(chapter.content ?? "");
        if (!text) continue;
        rows.push({ id: chapter.id, title: chapter.title, part: chapter.partTitle, text });
      }
      setImpulses(rows);
    }).catch(() => setImpulses([]));
  }, []);

  return (
    <div data-scroll style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.6rem 1.4rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>Hören</div>
        <h1 style={{ margin: "0.4rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>Hörfassung</h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, lineHeight: 1.5, maxWidth: "40rem" }}>
          Kernsätze und der Anfang eines Kapitels, gesprochen von der Stimme dieses Browsers. Eine Folge zum Abonnieren mit festen Audiodateien ist der nächste Schritt.
        </p>
        {!voice && <p style={{ fontFamily: SERIF, color: C.muted }}>Dieser Browser hat keine Sprachausgabe.</p>}

        <h2 style={{ fontFamily: DISPLAY, fontSize: "1.3rem", color: C.textBright, marginTop: "1.4rem" }}>Kernsätze</h2>
        {!kern ? <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p> : (
          <div style={{ display: "grid", gap: "0.7rem" }}>
            {kern.map(item => (
              <article key={item.id} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.8rem 1rem", background: C.surface }}>
                <p style={{ fontFamily: SERIF, color: C.textBright, lineHeight: 1.45, margin: "0 0 0.5rem" }}>{item.kernsatz}</p>
                <SpeakButton id={`kern-${item.id}`} text={item.kernsatz} color={C.accentText} />
              </article>
            ))}
          </div>
        )}

        <h2 style={{ fontFamily: DISPLAY, fontSize: "1.3rem", color: C.textBright, marginTop: "1.6rem" }}>Kapitelimpulse</h2>
        {!impulses ? <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p> : (
          <div style={{ display: "grid", gap: "0.7rem" }}>
            {impulses.map(item => (
              <article key={item.id} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.8rem 1rem", background: C.surface }}>
                <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>{item.part}</div>
                <h3 style={{ margin: "0.2rem 0", fontFamily: DISPLAY, fontSize: "1.15rem" }}>
                  <Link href={`/werk/${encodeURIComponent(item.id)}`} style={{ color: C.accentText, textDecoration: "none" }}>{item.title}</Link>
                </h3>
                <p style={{ fontFamily: SERIF, color: C.textDim, lineHeight: 1.5 }}>{item.text}</p>
                <SpeakButton id={`kap-${item.id}`} text={`${item.title}. ${item.text}`} color={C.accentText} />
              </article>
            ))}
          </div>
        )}
        <SiteFooter c={C} />
      </div>
    </div>
  );
}
