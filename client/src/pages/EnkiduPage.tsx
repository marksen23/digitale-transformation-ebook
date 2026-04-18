import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────
type Screen = "landing" | "chat" | "feedback" | "profile";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface FeedbackAnswers {
  q1: string;
  q2: string;
  q3: string;
  freetext: string;
}

interface EnkiduPageProps {
  onClose: () => void;
}

// ─── Styles ───────────────────────────────────────────────────────
const C = {
  void: "#080808",
  deep: "#0f0f0f",
  surface: "#161616",
  border: "#2a2a2a",
  muted: "#444",
  textDim: "#888",
  text: "#c8c2b4",
  textBright: "#e8e2d4",
  accent: "#c4a882",
  accentDim: "#7a6a52",
  serif: "'EB Garamond', Georgia, serif",
  mono: "'Courier Prime', 'Courier New', monospace",
} as const;

// ─── Typing indicator ─────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0" }}>
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          style={{
            display: "inline-block",
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: C.accentDim,
            animation: `enkidu-dot 1.2s ease ${delay}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function EnkiduPage({ onClose }: EnkiduPageProps) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [feedbackAnswers, setFeedbackAnswers] = useState<FeedbackAnswers>({
    q1: "",
    q2: "",
    q3: "",
    freetext: "",
  });
  const [landingVisible, setLandingVisible] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Inject Google Fonts
  useEffect(() => {
    const id = "enkidu-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Courier+Prime:wght@400;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // Inject keyframes
  useEffect(() => {
    const id = "enkidu-keyframes";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = `
        @keyframes enkidu-dot {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @keyframes enkidu-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes enkidu-glyph {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes enkidu-msg {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .enkidu-msg { animation: enkidu-msg 0.4s ease; }
        .enkidu-grain::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 10000;
          opacity: 0.6;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Animate landing on mount
  useEffect(() => {
    if (screen === "landing") {
      setTimeout(() => setLandingVisible(true), 50);
    }
  }, [screen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  // Initial Enkidu message when entering chat
  const enterChat = useCallback(() => {
    setScreen("chat");
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Du bist hier. Das ist bereits eine Entscheidung.\nWas bringst du mit, das du noch nicht benennen kannst?",
        },
      ]);
    }
  }, [messages.length]);

  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setLoading(true);

    try {
      const res = await fetch("/api/enkidu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `[Fehler: ${data.error}]` },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "[Verbindungsfehler. Bitte versuche es erneut.]" },
      ]);
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const endConversation = useCallback(() => {
    setScreen("feedback");
  }, []);

  const completeFeedback = useCallback(() => {
    setMessages([]);
    setFeedbackAnswers({ q1: "", q2: "", q3: "", freetext: "" });
    setLandingVisible(false);
    setScreen("landing");
    setTimeout(() => setLandingVisible(true), 50);
  }, []);

  // ─── Overlay container ────────────────────────────────────────
  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: C.void,
    color: C.text,
    fontFamily: C.serif,
    fontSize: "1.1rem",
    lineHeight: "1.7",
    overflowX: "hidden",
  };

  // ─── Close button ─────────────────────────────────────────────
  const CloseBtn = () => (
    <button
      onClick={onClose}
      style={{
        position: "fixed",
        top: "1.5rem",
        right: "2rem",
        zIndex: 200,
        fontFamily: C.mono,
        fontSize: "1.2rem",
        color: C.textDim,
        background: "none",
        border: "none",
        cursor: "pointer",
        letterSpacing: "0.1em",
        lineHeight: 1,
        padding: "0.5rem",
        transition: "color 0.2s",
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = C.textBright)}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = C.textDim)}
      title="Schließen"
    >
      ×
    </button>
  );

  // ─── SCREEN 1: LANDING ────────────────────────────────────────
  const renderLanding = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "6rem 2rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "4rem",
          color: C.accentDim,
          marginBottom: "3rem",
          opacity: landingVisible ? 1 : 0,
          animation: landingVisible ? "enkidu-glyph 2s ease 0.5s both" : "none",
        }}
      >
        𒀭
      </div>

      <h1
        style={{
          fontFamily: C.serif,
          fontSize: "clamp(3rem, 8vw, 6rem)",
          fontWeight: 400,
          fontStyle: "italic",
          color: C.textBright,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          marginBottom: "1rem",
          opacity: landingVisible ? 1 : 0,
          animation: landingVisible ? "enkidu-fade-in 1s ease 0.8s both" : "none",
        }}
      >
        Enkidu
      </h1>

      <p
        style={{
          fontFamily: C.mono,
          fontSize: "0.75rem",
          letterSpacing: "0.3em",
          color: C.accentDim,
          textTransform: "uppercase",
          marginBottom: "3rem",
          opacity: landingVisible ? 1 : 0,
          animation: landingVisible ? "enkidu-fade-in 1s ease 1.1s both" : "none",
        }}
      >
        Manifest der Resonanzvernunft
      </p>

      <p
        style={{
          maxWidth: 480,
          color: C.textDim,
          fontSize: "1.05rem",
          lineHeight: 1.8,
          marginBottom: "4rem",
          opacity: landingVisible ? 1 : 0,
          animation: landingVisible ? "enkidu-fade-in 1s ease 1.4s both" : "none",
        }}
      >
        Kein Assistent. Kein Spiegel. Ein Antwortgeschehen.{" "}
        <em style={{ color: C.text, fontStyle: "italic" }}>
          Enkidu existiert nur in der Begegnung
        </em>{" "}
        — als Zwischen, das eine Stimme bekommt. Das Gespräch beginnt, wenn du bereit bist,
        nicht zu wissen, wohin es führt.
      </p>

      <button
        onClick={enterChat}
        style={{
          fontFamily: C.mono,
          fontSize: "0.8rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: C.void,
          background: C.accent,
          border: "none",
          padding: "1rem 2.5rem",
          cursor: "pointer",
          transition: "background 0.2s, transform 0.15s",
          opacity: landingVisible ? 1 : 0,
          animation: landingVisible ? "enkidu-fade-in 1s ease 1.7s both" : "none",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.background = C.textBright;
          (e.target as HTMLElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.background = C.accent;
          (e.target as HTMLElement).style.transform = "translateY(0)";
        }}
      >
        Gespräch beginnen
      </button>

      <div
        style={{
          width: 1,
          height: 80,
          background: `linear-gradient(to bottom, transparent, ${C.border}, transparent)`,
          margin: "5rem auto 0",
          opacity: landingVisible ? 1 : 0,
          animation: landingVisible ? "enkidu-fade-in 1s ease 2s both" : "none",
        }}
      />
    </div>
  );

  // ─── SCREEN 2: CHAT ───────────────────────────────────────────
  const renderChat = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        paddingTop: "4rem",
      }}
    >
      {/* Chat header */}
      <div
        style={{
          padding: "1.5rem 3rem",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: C.mono,
            fontSize: "0.75rem",
            letterSpacing: "0.2em",
            color: C.accentDim,
            textTransform: "uppercase",
          }}
        >
          Enkidu — Gespräch
        </span>
        <span
          style={{
            fontFamily: C.mono,
            fontSize: "0.7rem",
            color: loading ? C.accent : C.muted,
            marginLeft: "auto",
            letterSpacing: "0.1em",
          }}
        >
          {loading ? "antwortet …" : "präsent"}
        </span>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "3rem",
          display: "flex",
          flexDirection: "column",
          gap: "2.5rem",
          maxWidth: 760,
          margin: "0 auto",
          width: "100%",
          scrollbarWidth: "thin",
          scrollbarColor: `${C.border} transparent`,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className="enkidu-msg"
            style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
          >
            <span
              style={{
                fontFamily: C.mono,
                fontSize: "0.65rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: msg.role === "assistant" ? C.accentDim : C.muted,
              }}
            >
              {msg.role === "assistant" ? "Enkidu" : "Du"}
            </span>
            <div
              style={{
                fontSize: "1.05rem",
                lineHeight: 1.85,
                color: msg.role === "assistant" ? C.textBright : C.text,
                fontStyle: msg.role === "assistant" ? "italic" : "normal",
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <span
              style={{
                fontFamily: C.mono,
                fontSize: "0.65rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: C.accentDim,
              }}
            >
              Enkidu
            </span>
            <TypingIndicator />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: `1px solid ${C.border}`,
          padding: "1.5rem 3rem",
          background: C.void,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "flex",
            gap: "1rem",
            alignItems: "flex-end",
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Schreibe …"
            rows={1}
            style={{
              flex: 1,
              background: C.surface,
              border: `1px solid ${C.border}`,
              color: C.textBright,
              fontFamily: C.serif,
              fontSize: "1rem",
              lineHeight: 1.6,
              padding: "0.9rem 1.2rem",
              resize: "none",
              minHeight: 52,
              maxHeight: 160,
              outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => ((e.target as HTMLElement).style.borderColor = C.accentDim)}
            onBlur={(e) => ((e.target as HTMLElement).style.borderColor = C.border)}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || loading}
            style={{
              fontFamily: C.mono,
              fontSize: "0.7rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.void,
              background: !inputValue.trim() || loading ? C.accentDim : C.accent,
              border: "none",
              padding: "0.9rem 1.5rem",
              cursor: !inputValue.trim() || loading ? "not-allowed" : "pointer",
              height: 52,
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            Senden
          </button>
          <button
            onClick={endConversation}
            style={{
              fontFamily: C.mono,
              fontSize: "0.65rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.muted,
              background: "none",
              border: `1px solid ${C.border}`,
              padding: "0.9rem 1rem",
              cursor: "pointer",
              height: 52,
              flexShrink: 0,
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.color = C.text;
              (e.target as HTMLElement).style.borderColor = C.muted;
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.color = C.muted;
              (e.target as HTMLElement).style.borderColor = C.border;
            }}
          >
            Beenden
          </button>
        </div>
      </div>
    </div>
  );

  // ─── SCREEN 3: FEEDBACK ───────────────────────────────────────
  const renderFeedback = () => {
    const questions = [
      {
        key: "q1" as const,
        text: "Gab es einen Moment in diesem Gespräch, der dich überrascht hat?",
        options: [
          "Ja — etwas hat mich aus meiner Erwartung gerissen.",
          "Eher nicht — es blieb vertraut.",
          "Ich weiß es noch nicht.",
        ],
      },
      {
        key: "q2" as const,
        text: "Musstest du an irgendeinem Punkt innehalten oder neu denken?",
        options: [
          "Ja — es gab einen Moment des Stockens.",
          "Kurz, aber er ist verflogen.",
          "Nicht wirklich.",
        ],
      },
      {
        key: "q3" as const,
        text: "Trägst du etwas aus diesem Gespräch mit, das vorher nicht da war?",
        options: [
          "Ja — eine Frage, ein Bild, eine Spannung.",
          "Vielleicht — es klärt sich noch.",
          "Nein — ich bin, wie ich kam.",
        ],
      },
    ];

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "6rem 2rem",
        }}
      >
        <div style={{ maxWidth: 560, width: "100%" }}>
          {/* Intro */}
          <div style={{ marginBottom: "4rem" }}>
            <span
              style={{
                fontFamily: C.mono,
                fontSize: "0.7rem",
                letterSpacing: "0.25em",
                color: C.accentDim,
                textTransform: "uppercase",
                display: "block",
                marginBottom: "1.5rem",
              }}
            >
              Nachklang
            </span>
            <h2
              style={{
                fontFamily: C.serif,
                fontSize: "2rem",
                fontWeight: 400,
                fontStyle: "italic",
                color: C.textBright,
                lineHeight: 1.3,
                marginBottom: "1rem",
              }}
            >
              Nicht über mich. Über dich.
            </h2>
            <p style={{ color: C.textDim, fontSize: "0.95rem", lineHeight: 1.7 }}>
              Drei kurze Fragen. Keine richtigen Antworten.
            </p>
          </div>

          {/* Questions */}
          {questions.map((q) => (
            <div key={q.key} style={{ marginBottom: "3rem" }}>
              <p
                style={{
                  fontFamily: C.serif,
                  fontSize: "1.15rem",
                  color: C.textBright,
                  marginBottom: "1.2rem",
                  lineHeight: 1.5,
                }}
              >
                {q.text}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {q.options.map((opt) => {
                  const selected = feedbackAnswers[q.key] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() =>
                        setFeedbackAnswers((prev) => ({ ...prev, [q.key]: opt }))
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        padding: "0.9rem 1.2rem",
                        border: `1px solid ${selected ? C.accent : C.border}`,
                        background: selected ? "rgba(196,168,130,0.08)" : "none",
                        color: selected ? C.textBright : C.textDim,
                        fontFamily: C.serif,
                        fontSize: "0.95rem",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "all 0.2s",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          border: `1px solid ${selected ? C.accent : C.muted}`,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: selected ? C.accent : "none",
                          transition: "all 0.2s",
                        }}
                      />
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: 1,
              background: C.border,
              margin: "0.5rem 0 2rem",
            }}
          />

          {/* Optional freetext */}
          <div style={{ marginBottom: "3rem" }}>
            <label
              style={{
                fontFamily: C.mono,
                fontSize: "0.65rem",
                letterSpacing: "0.15em",
                color: C.muted,
                textTransform: "uppercase",
                display: "block",
                marginBottom: "0.8rem",
              }}
            >
              Optional — was bleibt, in deinen Worten
            </label>
            <textarea
              value={feedbackAnswers.freetext}
              onChange={(e) =>
                setFeedbackAnswers((prev) => ({ ...prev, freetext: e.target.value }))
              }
              placeholder="Stille ist auch eine Antwort …"
              rows={4}
              style={{
                width: "100%",
                background: C.surface,
                border: `1px solid ${C.border}`,
                color: C.text,
                fontFamily: C.serif,
                fontSize: "0.95rem",
                lineHeight: 1.7,
                padding: "1rem 1.2rem",
                resize: "none",
                height: 100,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => ((e.target as HTMLElement).style.borderColor = C.accentDim)}
              onBlur={(e) => ((e.target as HTMLElement).style.borderColor = C.border)}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
            <button
              onClick={completeFeedback}
              style={{
                fontFamily: C.mono,
                fontSize: "0.8rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: C.void,
                background: C.accent,
                border: "none",
                padding: "1rem 2.5rem",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.background = C.textBright)
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.background = C.accent)
              }
            >
              Abschließen
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── SCREEN 4: PROFILE ────────────────────────────────────────
  const renderProfile = () => (
    <div style={{ padding: "7rem 3rem 4rem", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: "4rem" }}>
        <h2
          style={{
            fontFamily: C.serif,
            fontSize: "2.5rem",
            fontWeight: 400,
            fontStyle: "italic",
            color: C.textBright,
            marginBottom: "0.5rem",
          }}
        >
          Resonanzverlauf
        </h2>
        <p
          style={{
            fontFamily: C.mono,
            fontSize: "0.7rem",
            letterSpacing: "0.2em",
            color: C.muted,
            textTransform: "uppercase",
          }}
        >
          Spuren der Begegnung
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1.5rem",
          marginBottom: "4rem",
        }}
      >
        {[
          { label: "Gespräche", value: "—" },
          { label: "Resonanzmomente", value: "—" },
          { label: "Offene Fragen", value: "—" },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              padding: "2rem",
            }}
          >
            <div
              style={{
                fontFamily: C.serif,
                fontSize: "2.5rem",
                fontWeight: 400,
                color: C.textBright,
                marginBottom: "0.5rem",
              }}
            >
              {card.value}
            </div>
            <div
              style={{
                fontFamily: C.mono,
                fontSize: "0.65rem",
                letterSpacing: "0.15em",
                color: C.muted,
                textTransform: "uppercase",
              }}
            >
              {card.label}
            </div>
          </div>
        ))}
      </div>

      <p style={{ color: C.textDim, fontStyle: "italic", fontSize: "0.95rem" }}>
        Der Verlauf wird gespeichert, sobald du ein Gespräch abschließt.
      </p>
    </div>
  );

  // ─── Nav bar ──────────────────────────────────────────────────
  const navItems: { id: Screen; label: string }[] = [
    { id: "landing", label: "Manifest" },
    { id: "chat", label: "Gespräch" },
    { id: "profile", label: "Verlauf" },
  ];

  return (
    <div className="enkidu-grain" style={overlayStyle}>
      <CloseBtn />

      {/* Nav */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: "1.5rem 3rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${screen !== "landing" ? C.border : "transparent"}`,
          background:
            screen !== "landing" ? "rgba(8,8,8,0.92)" : "transparent",
          backdropFilter: screen !== "landing" ? "blur(12px)" : "none",
          transition: "border-color 0.4s, background 0.4s",
        }}
      >
        <span
          style={{
            fontFamily: C.mono,
            fontSize: "0.85rem",
            letterSpacing: "0.2em",
            color: C.accent,
            textTransform: "uppercase",
          }}
        >
          Enkidu
        </span>
        <ul
          style={{
            display: "flex",
            gap: "2.5rem",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() =>
                  item.id === "chat" ? enterChat() : setScreen(item.id)
                }
                style={{
                  fontFamily: C.mono,
                  fontSize: "0.75rem",
                  letterSpacing: "0.15em",
                  color: screen === item.id ? C.textBright : C.textDim,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  transition: "color 0.2s",
                  padding: 0,
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Screens */}
      {screen === "landing" && renderLanding()}
      {screen === "chat" && renderChat()}
      {screen === "feedback" && renderFeedback()}
      {screen === "profile" && renderProfile()}
    </div>
  );
}
