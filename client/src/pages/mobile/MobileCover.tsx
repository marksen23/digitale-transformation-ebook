/**
 * MobileCover — Reader-first-Kern, Bildschirm "Cover" (Design: "Mobile app
 * design scope", Runde 1). Ersetzt Home.tsx's Desktop-Lese-UI auf dem
 * Telefon; führt direkt in den neuen Chunk-Reader (WerkPage → MobileReader)
 * statt in Home.tsx's eigene Markdown-Lese-Logik.
 *
 * Inhalt (Titel/Autor/Bände/Datum/Copyright) kommt aus ebook_structured.json
 * — derselben Quelle wie der Reader, nicht aus Home.tsx's separatem
 * Markdown-Parser, damit beide Lese-Einstiege übereinstimmen.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO } from "@/lib/theme";
import type { EbookFile } from "@/lib/werkChunks";
import MobileIndexOverlay from "@/pages/mobile/MobileIndexOverlay";
import MobileSearchOverlay from "@/pages/mobile/MobileSearchOverlay";

export default function MobileCover() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const C = isDark ? C_DARK : C_LIGHT;
  const [, navigate] = useLocation();
  const [ebook, setEbook] = useState<EbookFile | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    fetch("/ebook_structured.json").then(r => r.json()).then(setEbook).catch(() => null);
  }, []);

  const tocChapters = ebook ? ebook.chapters.filter(c => c.content && c.content.length >= 200) : [];
  const bands = ebook ? ebook.parts.filter(p => p.id !== "einleitung") : [];

  // Dieselben Verlaufsfarben wie Home.tsx's Desktop-Cover — hell: Indigo→Stone,
  // dunkel: Stone→Amber (das Cover ist bewusst immer dunkel-auf-dunkel).
  const coverBg = isDark
    ? "linear-gradient(135deg,#0c0a09 0%,#1c1917 55%,#2d1a0a 100%)"
    : "linear-gradient(135deg,#1e1b4b 0%,#312e81 45%,#1c1917 100%)";

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "20px 18px",
      background: coverBg,
      paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
      paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
    }}>
      <div style={{
        width: "100%", maxWidth: 340, background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.10)", borderRadius: 18,
        padding: "28px 22px 22px", display: "flex", flexDirection: "column", gap: 22,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.32em", textTransform: "uppercase", color: "#f59e0b" }}>
            {ebook?.meta.author ?? "Markus Oehring"}
          </div>
          <div style={{ width: 40, height: 1, background: "rgba(245,158,11,0.45)" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 38, lineHeight: 1.05, color: "#fafaf9", letterSpacing: "-0.01em" }}>
            {ebook?.meta.title ?? "Die Digitale Transformation"}
          </div>
          <div style={{ width: 64, height: 1, margin: "0 auto", background: "linear-gradient(to right,transparent,rgba(245,158,11,0.55),transparent)" }} />
          <div style={{ fontFamily: "Lora,Georgia,serif", fontStyle: "italic", fontSize: 13, lineHeight: 1.55, color: "#d6d3d1" }}>
            {ebook?.meta.subtitle ?? "Eine poetisch-philosophische Trilogie mit theoretischer Grundlegung"}
          </div>
        </div>
        {bands.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: "#78716c", lineHeight: 1.8, letterSpacing: "0.04em" }}>
              {bands.map(b => <div key={b.id}>{b.title}</div>)}
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 3 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(68,64,60,0.7)" }} />
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: "#57534e" }}>{ebook?.meta.date ?? ""}</div>
              <div style={{ flex: 1, height: 1, background: "rgba(68,64,60,0.7)" }} />
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button" onClick={() => navigate("/werk")}
            style={{ minHeight: 48, background: "#92400e", border: "none", borderRadius: 8, color: "#fff", fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer" }}
          >Lesen</button>
          <button
            type="button" onClick={() => setIndexOpen(true)}
            style={{ minHeight: 44, background: "transparent", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8, color: "#f59e0b", fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer" }}
          >Inhalt</button>
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 8.5, color: "#44403c", textAlign: "center", marginTop: 14, letterSpacing: "0.06em" }}>
        {ebook?.meta.copyright ?? "© 2026 Markus Oehring · Alle Rechte vorbehalten"}
      </div>

      {indexOpen && (
        <MobileIndexOverlay
          C={C} tocChapters={tocChapters} navigate={navigate}
          onClose={() => setIndexOpen(false)} onSearch={() => setSearchOpen(true)}
        />
      )}
      {searchOpen && (
        <MobileSearchOverlay C={C} navigate={navigate} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  );
}
