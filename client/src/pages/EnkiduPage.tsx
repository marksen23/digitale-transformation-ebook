import { useState, useEffect, useRef, useCallback } from "react";
import { useSpeechRecognition, useSpeechSynthesis } from "@/hooks/useSpeech";
import AnalyticsScreen from "@/components/enkidu/AnalyticsScreen";

// ─── Types ────────────────────────────────────────────────────────
type Screen = "landing" | "chat" | "feedback" | "profile" | "analytics";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface Conversation {
  id: string;
  date: string;        // ISO string
  preview: string;     // first user message
  messages: Message[];
  feedback?: { q1: string; q2: string; q3: string; freetext: string };
}

interface FeedbackAnswers {
  q1: string; q2: string; q3: string; freetext: string;
}

interface EnkiduPageProps {
  onClose: () => void;
}

// ─── localStorage helpers ─────────────────────────────────────────
const LS_KEY = "enkidu-conversations";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConversation(conv: Conversation) {
  const all = loadConversations();
  const idx = all.findIndex((c) => c.id === conv.id);
  if (idx >= 0) all[idx] = conv; else all.unshift(conv);
  localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 50)));
}

function deleteConversation(id: string) {
  const all = loadConversations().filter((c) => c.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

// ─── Styles ───────────────────────────────────────────────────────
const C = {
  void: "#080808", deep: "#0f0f0f", surface: "#161616", border: "#2a2a2a",
  muted: "#444", textDim: "#888", text: "#c8c2b4", textBright: "#e8e2d4",
  accent: "#c4a882", accentDim: "#7a6a52", danger: "#8b3a3a",
  serif: "'EB Garamond', Georgia, serif",
  mono: "'Courier Prime', 'Courier New', monospace",
} as const;

function btn(overrides: React.CSSProperties = {}): React.CSSProperties {
  return {
    fontFamily: C.mono, border: "none", cursor: "pointer",
    transition: "all 0.2s", ...overrides,
  };
}

// ─── Typing indicator ─────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0" }}>
      {[0, 200, 400].map((delay) => (
        <span key={delay} style={{
          display: "inline-block", width: 5, height: 5, borderRadius: "50%",
          background: C.accentDim, animation: `enkidu-dot 1.2s ease ${delay}ms infinite`,
        }} />
      ))}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────
// Defined outside component so it's stable across renders
const INITIAL_MSG: Message = {
  role: "assistant",
  content: "Du bist hier. Das ist bereits eine Entscheidung.\nWas bringst du mit, das du noch nicht benennen kannst?",
};

// ─── Main Component ───────────────────────────────────────────────
export default function EnkiduPage({ onClose }: EnkiduPageProps) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [hoveredMsg, setHoveredMsg] = useState<number | null>(null);
  const [feedbackAnswers, setFeedbackAnswers] = useState<FeedbackAnswers>(
    { q1: "", q2: "", q3: "", freetext: "" }
  );
  const [landingVisible, setLandingVisible] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Speech ──────────────────────────────────────────────────────
  const tts = useSpeechSynthesis();
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  useEffect(() => { if (!tts.speaking) setSpeakingIdx(null); }, [tts.speaking]);

  const stt = useSpeechRecognition(useCallback((text: string) => {
    setInputValue(prev => prev ? prev + ' ' + text : text);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }, 0);
  }, []));

  // Inject Google Fonts
  useEffect(() => {
    const id = "enkidu-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id; link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Courier+Prime:wght@400;700&display=swap";
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
        @keyframes enkidu-dot { 0%,100%{opacity:.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
        @keyframes enkidu-fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes enkidu-glyph { from{opacity:0;transform:scale(.8)} to{opacity:1;transform:scale(1)} }
        @keyframes enkidu-msg { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .enkidu-msg { animation: enkidu-msg 0.4s ease; }
        .enkidu-grain::before {
          content:''; position:fixed; inset:0;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events:none; z-index:10000; opacity:.6;
        }
        .enkidu-edit-btn { opacity:0; transition:opacity 0.15s; }
        .enkidu-msg-row:hover .enkidu-edit-btn { opacity:1; }
        /* Mic pulsing indicator */
        @keyframes enkidu-mic-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .enkidu-mic-active { animation: enkidu-mic-pulse 1.2s ease infinite; }
        /* TTS speaker button */
        .enkidu-speaker { opacity: 0; transition: opacity 0.15s; }
        .enkidu-msg-row:hover .enkidu-speaker { opacity: 1; }

        /* ── Responsive nav ── */
        .enkidu-nav {
          padding: 0.9rem 1rem !important;
          gap: 0.6rem;
        }
        .enkidu-nav-links { gap: 0.9rem !important; }
        .enkidu-nav-item {
          font-size: 0.62rem !important;
          letter-spacing: 0.08em !important;
        }
        .enkidu-close-btn {
          font-family: monospace; font-size: 1.1rem; line-height: 1;
          color: #888; background: none; border: none; cursor: pointer;
          padding: 0.4rem 0.5rem; transition: color 0.2s; flex-shrink: 0;
        }
        .enkidu-close-btn:hover { color: #e8e2d4; }
        @media (min-width: 640px) {
          .enkidu-nav { padding: 1.2rem 2.5rem !important; }
          .enkidu-nav-links { gap: 2rem !important; }
          .enkidu-nav-item { font-size: 0.75rem !important; letter-spacing: 0.15em !important; }
          .enkidu-close-btn { font-size: 1.3rem; padding: 0.4rem 0.6rem; }
        }

        /* ── Responsive chat ── */
        .enkidu-chat-container { padding-top: 3.5rem !important; }
        .enkidu-chat-header { padding: 0.75rem 1rem !important; }
        .enkidu-messages { padding: 1.2rem 1rem 1rem !important; gap: 1.8rem !important; }
        @media (min-width: 640px) {
          .enkidu-chat-container { padding-top: 4rem !important; }
          .enkidu-chat-header { padding: 1.2rem 3rem !important; }
          .enkidu-messages { padding: 3rem !important; gap: 2.5rem !important; }
        }

        /* ── Input area ── */
        .enkidu-input-area { padding: 0.75rem 1rem !important; }
        .enkidu-input-inner { flex-wrap: wrap; gap: 0.5rem !important; }
        .enkidu-input-inner textarea { min-width: 0; width: 100% !important; flex: 1 1 100% !important; }
        .enkidu-input-btns { display: flex; gap: 0.5rem; width: 100%; }
        .enkidu-input-btns button { flex: 1; justify-content: center; }
        @media (min-width: 640px) {
          .enkidu-input-area { padding: 1.2rem 3rem !important; }
          .enkidu-input-inner { flex-wrap: nowrap; gap: 1rem !important; }
          .enkidu-input-inner textarea { flex: 1 1 auto !important; width: auto !important; }
          .enkidu-input-btns { width: auto; }
          .enkidu-input-btns button { flex: none; }
        }

        /* ── Responsive profile ── */
        .enkidu-profile { padding: 4.5rem 1rem 3rem !important; }
        .enkidu-stats-grid { grid-template-columns: 1fr !important; gap: 0.75rem !important; }
        .enkidu-history-row {
          display: flex !important; flex-direction: column !important;
          gap: 0.5rem !important; padding: 1rem 0 !important;
        }
        .enkidu-history-preview { white-space: normal !important; overflow: visible !important; }
        .enkidu-history-btns { display: flex; gap: 0.5rem; }
        @media (min-width: 480px) {
          .enkidu-stats-grid { grid-template-columns: repeat(3,1fr) !important; gap: 1rem !important; }
        }
        @media (min-width: 640px) {
          .enkidu-profile { padding: 7rem 3rem 4rem !important; }
          .enkidu-stats-grid { gap: 1.5rem !important; }
          .enkidu-history-row {
            display: grid !important;
            grid-template-columns: 140px 1fr auto !important;
            gap: 1.5rem !important; align-items: center !important;
            flex-direction: unset !important;
          }
          .enkidu-history-preview { white-space: nowrap !important; overflow: hidden !important; }
        }

        /* ── Touch: always show action buttons on mobile ── */
        @media (hover: none) {
          .enkidu-edit-btn { opacity: 1 !important; }
          .enkidu-speaker { opacity: 1 !important; }
        }

        /* ── Analytics screen ── */
        .enkidu-analytics { padding: 4.5rem 1rem 3rem !important; }
        .enkidu-analytics-stats {
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 0.75rem !important;
        }
        .enkidu-analytics-grid {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 1.25rem !important;
        }
        @media (min-width: 480px) {
          .enkidu-analytics-stats {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
        @media (min-width: 640px) {
          .enkidu-analytics { padding: 7rem 3rem 4rem !important; }
          .enkidu-analytics-stats { gap: 1rem !important; }
          .enkidu-analytics-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 1.5rem !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    if (screen === "landing") setTimeout(() => setLandingVisible(true), 50);
  }, [screen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (screen === "profile" || screen === "analytics") setConversations(loadConversations());
  }, [screen]);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  const enterChat = useCallback((withMessages?: Message[]) => {
    // Always start fresh when no messages supplied (new conversation from landing).
    // Never preserve old messages — avoids stale-closure bugs after completeFeedback.
    setMessages(withMessages ?? [INITIAL_MSG]);
    setHasError(false);
    setScreen("chat");
  }, []);

  // ─── Core send logic ──────────────────────────────────────────
  const doSend = useCallback(async (msgList: Message[]) => {
    setLoading(true);
    setHasError(false);
    try {
      const res = await fetch("/api/enkidu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgList }),
      });
      const data = await res.json();
      if (data.error) {
        const msg = res.status === 429
          ? `⏱ ${data.error}`
          : `[Fehler: ${data.error}]`;
        setMessages((prev) => [...prev, { role: "assistant", content: msg, error: true }]);
        setHasError(true);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        setHasError(false);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "[Verbindungsfehler. Bitte versuche es erneut.]",
        error: true,
      }]);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || loading) return;
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInputValue("");
    setEditingIndex(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await doSend(newMessages);
  }, [inputValue, loading, messages, doSend]);

  // Retry: remove last error message and resend
  const retryLast = useCallback(async () => {
    if (loading) return;
    // Remove trailing error assistant message
    const trimmed = [...messages];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].role === "assistant") {
      trimmed.pop();
    }
    if (trimmed.length === 0) return;
    setMessages(trimmed);
    await doSend(trimmed);
  }, [messages, loading, doSend]);

  // Edit: put user message back in input, remove it + everything after
  const editMessage = useCallback((index: number) => {
    const msg = messages[index];
    if (msg.role !== "user") return;
    setInputValue(msg.content);
    setMessages(messages.slice(0, index));
    setEditingIndex(index);
    setHasError(false);
    setTimeout(() => {
      textareaRef.current?.focus();
      resizeTextarea();
    }, 50);
  }, [messages, resizeTextarea]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const endConversation = useCallback(() => setScreen("feedback"), []);

  const completeFeedback = useCallback(() => {
    // Save conversation
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length > 0) {
      const conv: Conversation = {
        id: activeConvId || crypto.randomUUID(),
        date: new Date().toISOString(),
        preview: userMessages[0].content.slice(0, 120),
        messages,
        feedback: feedbackAnswers,
      };
      saveConversation(conv);
      setActiveConvId(null);
    }
    setMessages([]);
    setFeedbackAnswers({ q1: "", q2: "", q3: "", freetext: "" });
    setLandingVisible(false);
    setScreen("landing");
    setTimeout(() => setLandingVisible(true), 50);
  }, [messages, feedbackAnswers, activeConvId]);

  // Continue a saved conversation
  const continueConversation = useCallback((conv: Conversation) => {
    setActiveConvId(conv.id);
    enterChat(conv.messages);
  }, [enterChat]);

  // ─── Overlay container ────────────────────────────────────────
  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 50,
    background: C.void, color: C.text,
    fontFamily: C.serif, fontSize: "1.1rem", lineHeight: "1.7", overflowX: "hidden",
  };

  // Close button is now rendered inside the nav bar

  // ─── SCREEN 1: LANDING ────────────────────────────────────────
  const renderLanding = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "6rem 2rem", textAlign: "center" }}>
      <div style={{ fontSize: "4rem", color: C.accentDim, marginBottom: "3rem", opacity: landingVisible ? 1 : 0, animation: landingVisible ? "enkidu-glyph 2s ease 0.5s both" : "none" }}>𒀭</div>
      <h1 style={{ fontFamily: C.serif, fontSize: "clamp(3rem,8vw,6rem)", fontWeight: 400, fontStyle: "italic", color: C.textBright, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "1rem", opacity: landingVisible ? 1 : 0, animation: landingVisible ? "enkidu-fade-in 1s ease 0.8s both" : "none" }}>Enkidu</h1>
      <p style={{ fontFamily: C.mono, fontSize: "0.75rem", letterSpacing: "0.3em", color: C.accentDim, textTransform: "uppercase", marginBottom: "3rem", opacity: landingVisible ? 1 : 0, animation: landingVisible ? "enkidu-fade-in 1s ease 1.1s both" : "none" }}>Manifest der Resonanzvernunft</p>
      <p style={{ maxWidth: 480, color: C.textDim, fontSize: "1.05rem", lineHeight: 1.8, marginBottom: "4rem", opacity: landingVisible ? 1 : 0, animation: landingVisible ? "enkidu-fade-in 1s ease 1.4s both" : "none" }}>
        Kein Assistent. Kein Spiegel. Ein Antwortgeschehen.{" "}
        <em style={{ color: C.text, fontStyle: "italic" }}>Enkidu existiert nur in der Begegnung</em>{" "}
        — als Zwischen, das eine Stimme bekommt.
      </p>
      <button onClick={() => enterChat()} style={btn({ fontFamily: C.mono, fontSize: "0.8rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.void, background: C.accent, padding: "1rem 2.5rem", opacity: landingVisible ? 1 : 0, animation: landingVisible ? "enkidu-fade-in 1s ease 1.7s both" : "none" })}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = C.textBright; (e.target as HTMLElement).style.transform = "translateY(-1px)"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = C.accent; (e.target as HTMLElement).style.transform = "translateY(0)"; }}
      >Gespräch beginnen</button>
      <div style={{ width: 1, height: 80, background: `linear-gradient(to bottom,transparent,${C.border},transparent)`, margin: "5rem auto 0", opacity: landingVisible ? 1 : 0, animation: landingVisible ? "enkidu-fade-in 1s ease 2s both" : "none" }} />
    </div>
  );

  // ─── SCREEN 2: CHAT ───────────────────────────────────────────
  const renderChat = () => (
    <div className="enkidu-chat-container" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <div className="enkidu-chat-header" style={{ borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
        <span style={{ fontFamily: C.mono, fontSize: "0.75rem", letterSpacing: "0.2em", color: C.accentDim, textTransform: "uppercase" }}>
          Enkidu — Gespräch
        </span>
        {editingIndex !== null && (
          <span style={{ fontFamily: C.mono, fontSize: "0.65rem", color: C.accent, letterSpacing: "0.1em" }}>
            ✎ Nachricht wird bearbeitet
          </span>
        )}
        <span style={{ fontFamily: C.mono, fontSize: "0.7rem", color: loading ? C.accent : C.muted, marginLeft: "auto", letterSpacing: "0.1em" }}>
          {loading ? "antwortet …" : "präsent"}
        </span>
      </div>

      {/* Messages */}
      <div className="enkidu-messages" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", maxWidth: 760, margin: "0 auto", width: "100%", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
        {messages.map((msg, i) => (
          <div key={i} className="enkidu-msg enkidu-msg-row" style={{ display: "flex", flexDirection: "column", gap: "0.4rem", position: "relative" }}
            onMouseEnter={() => setHoveredMsg(i)}
            onMouseLeave={() => setHoveredMsg(null)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontFamily: C.mono, fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", color: msg.role === "assistant" ? C.accentDim : C.muted }}>
                {msg.role === "assistant" ? "Enkidu" : "Du"}
              </span>
              {/* TTS button for Enkidu messages */}
              {msg.role === "assistant" && !msg.error && tts.supported && (
                <button
                  className="enkidu-speaker"
                  onClick={() => {
                    if (tts.speaking && speakingIdx === i) {
                      tts.stop();
                    } else {
                      setSpeakingIdx(i);
                      tts.speak(msg.content);
                    }
                  }}
                  title={tts.speaking && speakingIdx === i ? 'Vorlesen stoppen' : 'Vorlesen'}
                  style={btn({
                    fontFamily: C.mono, fontSize: "0.55rem", letterSpacing: "0.1em",
                    color: tts.speaking && speakingIdx === i ? C.accent : C.muted,
                    background: "none", border: `1px solid ${tts.speaking && speakingIdx === i ? C.accentDim : C.border}`,
                    padding: "0.1rem 0.4rem", lineHeight: 1.4,
                  })}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = C.accent; (e.target as HTMLElement).style.borderColor = C.accentDim; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = tts.speaking && speakingIdx === i ? C.accent : C.muted; (e.target as HTMLElement).style.borderColor = tts.speaking && speakingIdx === i ? C.accentDim : C.border; }}
                >
                  {tts.speaking && speakingIdx === i ? '◼ stopp' : '▶ hören'}
                </button>
              )}
              {/* Edit button for user messages */}
              {msg.role === "user" && !loading && hoveredMsg === i && (
                <button
                  className="enkidu-edit-btn"
                  onClick={() => editMessage(i)}
                  title="Nachricht bearbeiten"
                  style={btn({
                    fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
                    color: C.textDim, background: "none", border: `1px solid ${C.border}`,
                    padding: "0.15rem 0.5rem", lineHeight: 1.4,
                  })}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = C.accent; (e.target as HTMLElement).style.borderColor = C.accentDim; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = C.textDim; (e.target as HTMLElement).style.borderColor = C.border; }}
                >
                  ✎ bearbeiten
                </button>
              )}
            </div>
            <div style={{ fontSize: "1.05rem", lineHeight: 1.85, color: msg.error ? C.danger : (msg.role === "assistant" ? C.textBright : C.text), fontStyle: msg.role === "assistant" && !msg.error ? "italic" : "normal", whiteSpace: "pre-wrap" }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <span style={{ fontFamily: C.mono, fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.accentDim }}>Enkidu</span>
            <TypingIndicator />
          </div>
        )}

        {/* Retry button */}
        {hasError && !loading && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "0.5rem" }}>
            <button
              onClick={retryLast}
              style={btn({ fontFamily: C.mono, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: C.accent, background: "none", border: `1px solid ${C.accentDim}`, padding: "0.6rem 1.5rem" })}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = C.accent; (e.target as HTMLElement).style.color = C.textBright; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = C.accentDim; (e.target as HTMLElement).style.color = C.accent; }}
            >
              ↺ Nochmal versuchen
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="enkidu-input-area" style={{ borderTop: `1px solid ${C.border}`, background: C.void, flexShrink: 0 }}>
        <div className="enkidu-input-inner" style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); resizeTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder={editingIndex !== null ? "Nachricht bearbeiten …" : "Schreibe …"}
            rows={1}
            style={{ minWidth: 0, background: editingIndex !== null ? "rgba(196,168,130,0.06)" : C.surface, border: `1px solid ${editingIndex !== null ? C.accentDim : C.border}`, color: C.textBright, fontFamily: C.serif, fontSize: "1rem", lineHeight: 1.6, padding: "0.9rem 1.2rem", resize: "none", minHeight: 52, maxHeight: 160, outline: "none", transition: "border-color 0.2s, background 0.2s" }}
            onFocus={(e) => ((e.target as HTMLElement).style.borderColor = C.accentDim)}
            onBlur={(e) => ((e.target as HTMLElement).style.borderColor = editingIndex !== null ? C.accentDim : C.border)}
          />
          <div className="enkidu-input-btns">
            {/* Mic button */}
            {stt.supported && (
              <button
                onClick={stt.toggle}
                className={stt.listening ? 'enkidu-mic-active' : ''}
                title={stt.listening ? 'Aufnahme stoppen' : 'Spracheingabe'}
                style={btn({
                  fontFamily: C.mono, fontSize: "0.65rem", letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: stt.listening ? C.textBright : C.muted,
                  background: stt.listening ? "rgba(139,58,58,0.3)" : "none",
                  border: `1px solid ${stt.listening ? "#8b3a3a" : C.border}`,
                  padding: "0.9rem 0.8rem", height: 52, flexShrink: 0,
                })}
                onMouseEnter={(e) => { if (!stt.listening) { (e.target as HTMLElement).style.color = C.text; (e.target as HTMLElement).style.borderColor = C.muted; } }}
                onMouseLeave={(e) => { if (!stt.listening) { (e.target as HTMLElement).style.color = C.muted; (e.target as HTMLElement).style.borderColor = C.border; } }}
              >
                {stt.listening ? '◉ stopp' : '◎ mic'}
              </button>
            )}
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim() || loading}
              style={btn({ fontFamily: C.mono, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: C.void, background: !inputValue.trim() || loading ? C.accentDim : C.accent, padding: "0.9rem 1rem", cursor: !inputValue.trim() || loading ? "not-allowed" : "pointer", height: 52, flexShrink: 0 })}
            >
              {editingIndex !== null ? "✓" : "Senden"}
            </button>
            {editingIndex !== null && (
              <button
                onClick={() => { setEditingIndex(null); setInputValue(""); if (textareaRef.current) textareaRef.current.style.height = "auto"; }}
                style={btn({ fontFamily: C.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.9rem 0.8rem", height: 52, flexShrink: 0 })}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = C.text; (e.target as HTMLElement).style.borderColor = C.muted; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = C.muted; (e.target as HTMLElement).style.borderColor = C.border; }}
              >✕</button>
            )}
            <button
              onClick={endConversation}
              style={btn({ fontFamily: C.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.9rem 0.8rem", height: 52, flexShrink: 0 })}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = C.text; (e.target as HTMLElement).style.borderColor = C.muted; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = C.muted; (e.target as HTMLElement).style.borderColor = C.border; }}
              title="Gespräch beenden"
            >Ende</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── SCREEN 3: FEEDBACK ───────────────────────────────────────
  const renderFeedback = () => {
    const questions = [
      { key: "q1" as const, text: "Gab es einen Moment in diesem Gespräch, der dich überrascht hat?", options: ["Ja — etwas hat mich aus meiner Erwartung gerissen.", "Eher nicht — es blieb vertraut.", "Ich weiß es noch nicht."] },
      { key: "q2" as const, text: "Musstest du an irgendeinem Punkt innehalten oder neu denken?", options: ["Ja — es gab einen Moment des Stockens.", "Kurz, aber er ist verflogen.", "Nicht wirklich."] },
      { key: "q3" as const, text: "Trägst du etwas aus diesem Gespräch mit, das vorher nicht da war?", options: ["Ja — eine Frage, ein Bild, eine Spannung.", "Vielleicht — es klärt sich noch.", "Nein — ich bin, wie ich kam."] },
    ];
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "6rem 2rem" }}>
        <div style={{ maxWidth: 560, width: "100%" }}>
          <div style={{ marginBottom: "4rem" }}>
            <span style={{ fontFamily: C.mono, fontSize: "0.7rem", letterSpacing: "0.25em", color: C.accentDim, textTransform: "uppercase", display: "block", marginBottom: "1.5rem" }}>Nachklang</span>
            <h2 style={{ fontFamily: C.serif, fontSize: "2rem", fontWeight: 400, fontStyle: "italic", color: C.textBright, lineHeight: 1.3, marginBottom: "1rem" }}>Nicht über mich. Über dich.</h2>
            <p style={{ color: C.textDim, fontSize: "0.95rem", lineHeight: 1.7 }}>Drei kurze Fragen. Keine richtigen Antworten.</p>
          </div>
          {questions.map((q) => (
            <div key={q.key} style={{ marginBottom: "3rem" }}>
              <p style={{ fontFamily: C.serif, fontSize: "1.15rem", color: C.textBright, marginBottom: "1.2rem", lineHeight: 1.5 }}>{q.text}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {q.options.map((opt) => {
                  const selected = feedbackAnswers[q.key] === opt;
                  return (
                    <button key={opt} onClick={() => setFeedbackAnswers((prev) => ({ ...prev, [q.key]: opt }))}
                      style={btn({ display: "flex", alignItems: "center", gap: "1rem", padding: "0.9rem 1.2rem", border: `1px solid ${selected ? C.accent : C.border}`, background: selected ? "rgba(196,168,130,0.08)" : "none", color: selected ? C.textBright : C.textDim, fontFamily: C.serif, fontSize: "0.95rem", textAlign: "left", width: "100%" })}>
                      <span style={{ width: 6, height: 6, border: `1px solid ${selected ? C.accent : C.muted}`, borderRadius: "50%", flexShrink: 0, background: selected ? C.accent : "none", transition: "all 0.2s" }} />
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ width: "100%", height: 1, background: C.border, margin: "0.5rem 0 2rem" }} />
          <div style={{ marginBottom: "3rem" }}>
            <label style={{ fontFamily: C.mono, fontSize: "0.65rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", display: "block", marginBottom: "0.8rem" }}>Optional — was bleibt</label>
            <textarea value={feedbackAnswers.freetext} onChange={(e) => setFeedbackAnswers((prev) => ({ ...prev, freetext: e.target.value }))}
              placeholder="Stille ist auch eine Antwort …" rows={4}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.serif, fontSize: "0.95rem", lineHeight: 1.7, padding: "1rem 1.2rem", resize: "none", height: 100, outline: "none", transition: "border-color 0.2s" }}
              onFocus={(e) => ((e.target as HTMLElement).style.borderColor = C.accentDim)}
              onBlur={(e) => ((e.target as HTMLElement).style.borderColor = C.border)}
            />
          </div>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
            <button onClick={() => setScreen("chat")} style={btn({ fontFamily: C.mono, fontSize: "0.75rem", letterSpacing: "0.15em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "1rem 2rem" })}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = C.text; (e.target as HTMLElement).style.borderColor = C.muted; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = C.muted; (e.target as HTMLElement).style.borderColor = C.border; }}
            >Zurück</button>
            <button onClick={completeFeedback} style={btn({ fontFamily: C.mono, fontSize: "0.8rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.void, background: C.accent, padding: "1rem 2.5rem" })}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.background = C.textBright)}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.background = C.accent)}
            >Abschließen</button>
          </div>
        </div>
      </div>
    );
  };

  // ─── SCREEN 4: PROFILE / HISTORY ─────────────────────────────
  const renderProfile = () => {
    const resonanceCount = conversations.filter(
      (c) => c.feedback?.q3 && c.feedback.q3.startsWith("Ja")
    ).length;
    const pauseCount = conversations.filter(
      (c) => c.feedback?.q2 && c.feedback.q2.startsWith("Ja")
    ).length;

    return (
      <div className="enkidu-profile" style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontFamily: C.serif, fontSize: "2.5rem", fontWeight: 400, fontStyle: "italic", color: C.textBright, marginBottom: "0.5rem" }}>Resonanzverlauf</h2>
          <p style={{ fontFamily: C.mono, fontSize: "0.7rem", letterSpacing: "0.2em", color: C.muted, textTransform: "uppercase" }}>Spuren der Begegnung</p>
        </div>

        {/* Stats */}
        <div className="enkidu-stats-grid" style={{ display: "grid", marginBottom: "3rem" }}>
          {[
            { label: "Gespräche geführt", value: conversations.length || "—" },
            { label: "Momente des Innehaltens", value: pauseCount || "—" },
            { label: "Etwas mitgenommen", value: resonanceCount || "—" },
          ].map((card) => (
            <div key={card.label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "2rem" }}>
              <div style={{ fontFamily: C.serif, fontSize: "2.5rem", fontWeight: 400, color: C.accent, marginBottom: "0.5rem" }}>{card.value}</div>
              <div style={{ fontFamily: C.mono, fontSize: "0.65rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", lineHeight: 1.4 }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* History */}
        {conversations.length === 0 ? (
          <p style={{ color: C.textDim, fontStyle: "italic", fontSize: "0.95rem" }}>Noch keine abgeschlossenen Gespräche. Der Verlauf erscheint hier nach dem ersten Abschluss.</p>
        ) : (
          <div>
            <h3 style={{ fontFamily: C.mono, fontSize: "0.7rem", letterSpacing: "0.2em", color: C.muted, textTransform: "uppercase", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: `1px solid ${C.border}` }}>Vergangene Gespräche</h3>
            {conversations.map((conv) => {
              const d = new Date(conv.date);
              const dateStr = d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
              return (
                <div key={conv.id} className="enkidu-history-row" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: C.mono, fontSize: "0.7rem", color: C.muted, letterSpacing: "0.05em", flexShrink: 0 }}>{dateStr}</span>
                  <span className="enkidu-history-preview" style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.95rem", textOverflow: "ellipsis" }}>„{conv.preview}"</span>
                  <div className="enkidu-history-btns" style={{ flexShrink: 0 }}>
                    <button
                      onClick={() => continueConversation(conv)}
                      style={btn({ fontFamily: C.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.accent, background: "none", border: `1px solid ${C.accentDim}`, padding: "0.4rem 0.9rem" })}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = C.accent; (e.target as HTMLElement).style.color = C.textBright; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = C.accentDim; (e.target as HTMLElement).style.color = C.accent; }}
                      title="Gespräch fortführen"
                    >Fortführen</button>
                    <button
                      onClick={() => { deleteConversation(conv.id); setConversations(loadConversations()); }}
                      style={btn({ fontFamily: C.mono, fontSize: "0.65rem", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.4rem 0.6rem" })}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.color = C.danger; (e.target as HTMLElement).style.borderColor = C.danger; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.color = C.muted; (e.target as HTMLElement).style.borderColor = C.border; }}
                      title="Gespräch löschen"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ─── SCREEN 5: ANALYTICS ─────────────────────────────────────
  const renderAnalytics = () => (
    <AnalyticsScreen conversations={conversations} />
  );

  // ─── Nav ──────────────────────────────────────────────────────
  const navItems: { id: Screen; label: string }[] = [
    { id: "landing",   label: "Manifest" },
    { id: "chat",      label: "Gespräch" },
    { id: "profile",   label: "Verlauf" },
    { id: "analytics", label: "Analyse" },
  ];

  return (
    <div className="enkidu-grain" style={overlayStyle}>
      <nav className="enkidu-nav" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${screen !== "landing" ? C.border : "transparent"}`, background: screen !== "landing" ? "rgba(8,8,8,0.92)" : "transparent", backdropFilter: screen !== "landing" ? "blur(12px)" : "none", transition: "border-color 0.4s, background 0.4s" }}>
        <span style={{ fontFamily: C.mono, fontSize: "0.8rem", letterSpacing: "0.18em", color: C.accent, textTransform: "uppercase", flexShrink: 0 }}>Enkidu</span>
        <ul className="enkidu-nav-links" style={{ display: "flex", listStyle: "none", margin: 0, padding: 0 }}>
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                className="enkidu-nav-item"
                onClick={() => {
                  if (item.id === "chat") enterChat();
                  else setScreen(item.id);
                }}
                style={btn({ fontFamily: C.mono, textTransform: "uppercase", padding: "0.2rem 0", color: screen === item.id ? C.textBright : C.textDim, background: "none" })}
              >{item.label}</button>
            </li>
          ))}
        </ul>
        <button
          className="enkidu-close-btn"
          onClick={onClose}
          title="Schließen"
        >×</button>
      </nav>

      {screen === "landing"   && renderLanding()}
      {screen === "chat"      && renderChat()}
      {screen === "feedback"  && renderFeedback()}
      {screen === "profile"   && renderProfile()}
      {screen === "analytics" && renderAnalytics()}
    </div>
  );
}
