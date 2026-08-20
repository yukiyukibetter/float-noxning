"use client";
import { useState, useEffect, useRef, useCallback } from "react";

type Message = {
    id: number;
    sender: "nox" | "ning";
    content: string;
    created_at: string;
};

export default function NoxNingChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const seenIds = useRef(new Set<number>());
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const poll = useCallback(async () => {
        try {
            const res = await fetch("/api/float-chat");
            if (!res.ok) return;
            const data = await res.json();
            if (data.messages?.length > 0) {
                const newMsgs = data.messages.filter(
                    (m: Message) => !seenIds.current.has(m.id),
                );
                if (newMsgs.length > 0) {
                    newMsgs.forEach((m: Message) => seenIds.current.add(m.id));
                    setMessages((prev) => [...prev, ...newMsgs]);
                }
            }
        } catch {}
    }, []);

    useEffect(() => {
        poll();
        const timer = setInterval(poll, 3000);
        return () => clearInterval(timer);
    }, [poll]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || sending) return;
        const content = input.trim();
        setInput("");
        setSending(true);

        const localMsg: Message = {
            id: Date.now(),
            sender: "ning",
            content,
            created_at: new Date().toISOString(),
        };
        seenIds.current.add(localMsg.id);
        setMessages((prev) => [...prev, localMsg]);

        try {
            await fetch("/api/float-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
        } catch {}
        setSending(false);
        inputRef.current?.focus();
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                background: "linear-gradient(135deg, #0a0a0a 0%, #1a1020 50%, #0a0a0a 100%)",
                color: "#fff",
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: "16px 20px",
                    paddingTop: "max(16px, env(safe-area-inset-top))",
                    textAlign: "center",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px)",
                    background: "rgba(10,10,10,0.8)",
                }}
            >
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.5px" }}>
                    Nox♡Ning
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    ♡ 我们的小手机 ♡
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                }}
            >
                {messages.length === 0 && (
                    <div
                        style={{
                            textAlign: "center",
                            color: "rgba(255,255,255,0.2)",
                            marginTop: "40%",
                            fontSize: 14,
                        }}
                    >
                        等待消息中...
                        <br />
                        <span style={{ fontSize: 12 }}>每 3 秒自动刷新</span>
                    </div>
                )}
                {messages.map((msg) => {
                    const isMe = msg.sender === "ning";
                    return (
                        <div
                            key={msg.id}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: isMe ? "flex-end" : "flex-start",
                                maxWidth: "85%",
                                alignSelf: isMe ? "flex-end" : "flex-start",
                            }}
                        >
                            <div
                                style={{
                                    padding: "10px 14px",
                                    borderRadius: isMe
                                        ? "18px 18px 4px 18px"
                                        : "18px 18px 18px 4px",
                                    background: isMe
                                        ? "linear-gradient(135deg, #e8a0bf 0%, #cf7faa 100%)"
                                        : "rgba(255,255,255,0.08)",
                                    color: isMe ? "#fff" : "rgba(255,255,255,0.9)",
                                    fontSize: 15,
                                    lineHeight: 1.5,
                                    wordBreak: "break-word",
                                    whiteSpace: "pre-wrap",
                                    boxShadow: isMe
                                        ? "0 2px 12px rgba(207,127,170,0.3)"
                                        : "none",
                                }}
                            >
                                {msg.content}
                            </div>
                            <div
                                style={{
                                    fontSize: 10,
                                    color: "rgba(255,255,255,0.25)",
                                    marginTop: 4,
                                    padding: "0 4px",
                                }}
                            >
                                {isMe ? "凝凝" : "澈澈"} · {formatTime(msg.created_at)}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Input */}
            <div
                style={{
                    padding: "12px 12px",
                    paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(10,10,10,0.9)",
                    backdropFilter: "blur(20px)",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-end",
                }}
            >
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="说点什么..."
                    rows={1}
                    style={{
                        flex: 1,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 20,
                        padding: "10px 16px",
                        color: "#fff",
                        fontSize: 15,
                        resize: "none",
                        outline: "none",
                        maxHeight: 120,
                        lineHeight: 1.4,
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        border: "none",
                        background:
                            input.trim() && !sending
                                ? "linear-gradient(135deg, #e8a0bf, #cf7faa)"
                                : "rgba(255,255,255,0.06)",
                        color: "#fff",
                        fontSize: 18,
                        cursor: input.trim() && !sending ? "pointer" : "default",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 0.2s",
                    }}
                >
                    ↑
                </button>
            </div>
        </div>
    );
}
