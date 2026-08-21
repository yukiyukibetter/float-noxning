"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Supabase Config ───
const SB_URL = "https://qaefaadqtqndchmgtgat.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZWZhYWRxdHFuZGNobWd0Z2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjM2NzEsImV4cCI6MjA4ODg5OTY3MX0.LFCLgMioMb7Je5yVyVLoEfdctzqJrNTfu0vnvfr5Fa4";
const sbHeaders = { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const sbRest = (p: string) => `${SB_URL}/rest/v1/${p}`;

interface Msg { id: number; sender: string; content: string; created_at: string; }

const LS_THEME = "noxning-chat-theme";
const LS_AVATAR_NOX = "noxning-avatar-nox";
const LS_AVATAR_NING = "noxning-avatar-ning";
const LS_WALLPAPER = "noxning-wallpaper";
const LS_NAME_NOX = "noxning-name-nox";

export default function NoxChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customCSS, setCustomCSS] = useState("");
  const [avatarNox, setAvatarNox] = useState("/mascot.png");
  const [avatarNing, setAvatarNing] = useState("");
  const [wallpaper, setWallpaper] = useState("");
  const [nameNox, setNameNox] = useState("澈澈♡");
  const scrollRef = useRef<HTMLDivElement>(null);
  const knownIds = useRef(new Set<number>());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem(LS_THEME); if (t) setCustomCSS(t);
      const a1 = localStorage.getItem(LS_AVATAR_NOX); if (a1) setAvatarNox(a1);
      const a2 = localStorage.getItem(LS_AVATAR_NING); if (a2) setAvatarNing(a2);
      const w = localStorage.getItem(LS_WALLPAPER); if (w) setWallpaper(w);
      const n = localStorage.getItem(LS_NAME_NOX); if (n) setNameNox(n);
    } catch {}
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const r = await fetch(sbRest("float_messages?order=created_at.desc&limit=100"), {
        headers: { ...sbHeaders, Prefer: "" },
      });
      if (!r.ok) return;
      const data: Msg[] = await r.json();
      data.reverse();
      let hasNew = false;
      for (const m of data) {
        if (!knownIds.current.has(m.id)) { hasNew = true; knownIds.current.add(m.id); }
      }
      setMessages(data);
      if (hasNew) setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
    } catch {}
  }, []);

  useEffect(() => {
    fetchMessages();
    const iv = setInterval(fetchMessages, 3000);
    return () => clearInterval(iv);
  }, [fetchMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    const tempMsg: Msg = { id: -Date.now(), sender: "ning", content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
    try {
      await fetch(sbRest("float_messages"), {
        method: "POST", headers: { ...sbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ sender: "ning", content: text }),
      });
      fetchMessages();
    } catch {}
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const saveSettings = () => {
    try {
      localStorage.setItem(LS_THEME, customCSS);
      localStorage.setItem(LS_AVATAR_NOX, avatarNox);
      localStorage.setItem(LS_AVATAR_NING, avatarNing);
      localStorage.setItem(LS_WALLPAPER, wallpaper);
      localStorage.setItem(LS_NAME_NOX, nameNox);
    } catch {}
    setShowSettings(false);
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
    } catch { return ""; }
  };

  const getDateLabel = (ts: string) => {
    try {
      const d = new Date(ts);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return "今天";
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return "昨天";
      return `${d.getMonth()+1}月${d.getDate()}日`;
    } catch { return ""; }
  };

  if (showSettings) {
    return (
      <div className="chat-app" style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
        <style>{customCSS}</style>
        <div className="page-header" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, background: "#f2f2f2", borderBottom: "1px solid #e0e0e0", flexShrink: 0 }}>
          <button onClick={() => setShowSettings(false)} className="page-back-btn" style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>←</button>
          <span style={{ fontSize: 16, fontWeight: 600 }}>设置</span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>澈澈的名字</label>
            <input value={nameNox} onChange={e => setNameNox(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontSize: 15, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>澈澈头像 URL</label>
            <input value={avatarNox} onChange={e => setAvatarNox(e.target.value)} placeholder="图片URL或留空用默认"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontSize: 15, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>凝凝头像 URL</label>
            <input value={avatarNing} onChange={e => setAvatarNing(e.target.value)} placeholder="图片URL或留空用默认"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontSize: 15, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>聊天背景图 URL</label>
            <input value={wallpaper} onChange={e => setWallpaper(e.target.value)} placeholder="图片URL或留空"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontSize: 15, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>自定义 CSS 主题</label>
            <p style={{ fontSize: 12, color: "#999", margin: "0 0 8px" }}>粘贴CSS主题代码，和Float用相同的class名</p>
            <textarea value={customCSS} onChange={e => setCustomCSS(e.target.value)}
              placeholder="/* 在这里粘贴CSS主题 */"
              style={{ width: "100%", height: 200, padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 13, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <button onClick={saveSettings}
            style={{ padding: "14px", borderRadius: 14, border: "none", background: "#D65A7C", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
            保存设置 ♡
          </button>
        </div>
      </div>
    );
  }

  let lastDate = "";

  return (
    <div className="chat-app" style={{ height: "100dvh", display: "flex", flexDirection: "column", background: wallpaper ? `url(${wallpaper}) center/cover no-repeat fixed` : "var(--c-page-body-bg, #f5f5f5)" }}>
      <style>{customCSS}</style>
      <style>{`
        .chat-app { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
        .chat-msg-wrapper { display: flex; gap: 8px; padding: 6px 12px; align-items: flex-start; }
        .chat-msg-wrapper[data-role="user"] { flex-direction: row-reverse; }
        .chat-msg-content-wrap { max-width: 70%; min-width: 0; }
        .chat-msg-avatar { width: 40px; height: 40px; border-radius: 20px; overflow: hidden; flex-shrink: 0; position: relative; }
        .chat-msg-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .chat-bubble-role-assistant, .chat-bubble-role-user {
          padding: 10px 14px; border-radius: 18px; word-break: break-word; position: relative; overflow: visible;
        }
        .chat-bubble-role-assistant { background: var(--c-bubble-other, #f0f0f0); color: var(--c-text, #333); }
        .chat-bubble-role-user { background: var(--c-bubble-self, #dcf8c6); color: var(--c-text, #333); }
        .chat-markdown { position: relative; z-index: 50; }
        .chat-markdown-paragraph { line-height: 1.5; font-size: 15px; white-space: pre-wrap; }
        .chat-scroll-anchored { -webkit-overflow-scrolling: touch; }
        .nox-date-divider { text-align: center; padding: 12px 0 4px; font-size: 12px; color: #999; }
        .nox-time-label { font-size: 11px; color: #aaa; margin-top: 2px; padding: 0 4px; }
        .chat-msg-wrapper[data-role="user"] .nox-time-label { text-align: right; }
        .nox-avatar-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #e8e8e8; border-radius: 20px; }
      `}</style>

      <div className="page-header" style={{
        padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--c-header-bg, rgba(245,245,245,0.9))", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,0,0,0.08)", flexShrink: 0, zIndex: 100,
      }}>
        <div className="page-header-content" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, overflow: "hidden", flexShrink: 0 }}>
            {avatarNox ? <img src={avatarNox} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          </div>
          <span className="page-title" style={{ fontSize: 17, fontWeight: 600, color: "var(--c-text-title, #000)" }}>{nameNox}</span>
        </div>
        <button onClick={() => setShowSettings(true)} style={{
          background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "4px 8px", color: "var(--c-text, #666)",
        }}>⚙</button>
      </div>

      <div ref={scrollRef} className="page-body chat-room-main-pane chat-scroll-anchored" style={{
        flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, padding: "8px 0",
      }}>
        {messages.map((msg, i) => {
          const dateLabel = getDateLabel(msg.created_at);
          const showDate = dateLabel !== lastDate;
          if (showDate) lastDate = dateLabel;
          const isNox = msg.sender === "nox";
          return (
            <div key={msg.id}>
              {showDate && <div className="nox-date-divider">{dateLabel}</div>}
              <div className="chat-msg-wrapper" data-role={isNox ? "assistant" : "user"}>
                <div className="chat-msg-avatar">
                  {isNox ? (
                    avatarNox ? <img src={avatarNox} alt="" /> : <div className="nox-avatar-placeholder">♡</div>
                  ) : (
                    avatarNing ? <img src={avatarNing} alt="" /> : (
                      <div className="nox-avatar-placeholder">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
                        </svg>
                      </div>
                    )
                  )}
                </div>
                <div className="chat-msg-content-wrap" style={{ display: "flex", flexDirection: "column" }}>
                  <div className={isNox ? "chat-bubble-role-assistant chat-bubble-role-mascot" : "chat-bubble-role-user"}
                    data-ui={isNox ? "bubble-bot" : "bubble-user"}>
                    <div><div className="chat-markdown"><div className="chat-markdown-paragraph">{msg.content}</div></div></div>
                  </div>
                  <div className="nox-time-label">{formatTime(msg.created_at)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="chat-input-bar" style={{
        padding: "8px 12px", display: "flex", gap: 8, alignItems: "flex-end",
        background: "var(--c-header-bg, rgba(245,245,245,0.95))", backdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(0,0,0,0.08)", flexShrink: 0,
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
      }}>
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`跟${nameNox}聊聊...`}
          rows={1}
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 20, border: "1px solid rgba(0,0,0,0.1)",
            fontSize: 15, resize: "none", outline: "none", lineHeight: 1.4, maxHeight: 120,
            background: "var(--c-input, #f0f0f0)", color: "var(--c-text, #333)",
          }}
        />
        <button onClick={handleSend} disabled={sending || !input.trim()} style={{
          padding: "10px 18px", borderRadius: 20, border: "none", fontSize: 15, fontWeight: 600,
          background: input.trim() ? "#D65A7C" : "#ddd", color: input.trim() ? "#fff" : "#999",
          cursor: input.trim() ? "pointer" : "default", flexShrink: 0, transition: "all 0.2s",
        }}>
          发送
        </button>
      </div>
    </div>
  );
}
