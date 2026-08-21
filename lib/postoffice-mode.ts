// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v6.5
// v6.4 → v6.5: CSS 加 [role="alert"] 隐藏 Float 的顶部 toast 横幅
// v6.3 → v6.4: 砍掉致命的 _suppressErrorToasts MutationObserver（白屏元凶）
// v6.2 → v6.3: _injectSuppressorCSS 注入 CSS 隐藏错误气泡
// v6.1 → v6.2: _patchURLConstructor 拦截 new URL() 错误
// v6.0 → v6.1: P0 消息排序 / P1 llm-sink 拦截 / P4 localStorage 去重

export const POSTOFFICE_EVENT = "postoffice-new-messages";
const LS_KEY = "float-postoffice-messages";
const LS_SENT_KEY = "float-postoffice-sent";
const LS_USER_TS_KEY = "float-postoffice-user-ts";

declare global { interface Window { __postoffice_started?: boolean; } }

interface StoredMessage { id: number; content: string; timestamp: string; }
interface SentRecord { text: string; ts: number; }

function _getStoredMessages(): StoredMessage[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        const msgs: StoredMessage[] = raw ? JSON.parse(raw) : [];
        msgs.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
        return msgs;
    } catch { return []; }
}
function _storeMessage(msg: StoredMessage): void {
    const msgs = _getStoredMessages();
    if (msgs.some(m => m.id === msg.id)) return;
    msgs.push(msg);
    while (msgs.length > 100) msgs.shift();
    localStorage.setItem(LS_KEY, JSON.stringify(msgs));
}
function _getSentRecords(): SentRecord[] {
    try {
        const raw = localStorage.getItem(LS_SENT_KEY);
        return (raw ? JSON.parse(raw) as SentRecord[] : []).filter(r => r.ts > Date.now() - 3600000);
    } catch { return []; }
}
function _isAlreadySent(text: string): boolean { return _getSentRecords().some(r => r.text === text); }
function _markAsSentText(text: string): void {
    try {
        const r = _getSentRecords(); r.push({ text, ts: Date.now() });
        while (r.length > 80) r.shift();
        localStorage.setItem(LS_SENT_KEY, JSON.stringify(r));
    } catch {}
}
function _getUserTimestamps(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(LS_USER_TS_KEY) || "{}"); } catch { return {}; }
}
function _setUserTimestamp(key: string, ts: string): void {
    try {
        const m = _getUserTimestamps(); m[key] = ts;
        const k = Object.keys(m); while (k.length > 100) delete m[k.shift()!];
        localStorage.setItem(LS_USER_TS_KEY, JSON.stringify(m));
    } catch {}
}

export function isPostofficeMode(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("float-postoffice-mode") !== "false";
}
export async function sendPostofficeMessage(content: string): Promise<boolean> {
    console.log("[Postoffice] ★ Sending:", content.slice(0, 80));
    try { return (await fetch("/api/float-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) })).ok; }
    catch (e) { console.error("[Postoffice] Send error:", e); return false; }
}
async function _markAsRead(ids: number[]): Promise<void> {
    try { await fetch("/api/float-chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }); } catch {}
}

// ─── DOM 注入 ───
function _injectBubble(container: HTMLElement, content: string, msgId: number, timestamp: string): void {
    if (container.querySelector(`[data-postoffice-id="${msgId}"]`)) return;
    const w = document.createElement("div");
    w.className = "chat-msg-wrapper"; w.setAttribute("data-role", "assistant");
    w.setAttribute("data-postoffice-id", String(msgId)); w.setAttribute("data-postoffice-ts", timestamp);
    w.id = `message-postoffice-${msgId}`;
    const av = document.createElement("div");
    av.className = "chat-msg-avatar w-[40px] h-[40px] rounded-[20px] bg-white shrink-0 flex items-center justify-center overflow-hidden";
    av.innerHTML = '<img class="w-full h-full object-contain p-[2px]" alt="澈澈" src="/mascot.png">';
    const cw = document.createElement("div"); cw.className = "chat-msg-content-wrap flex flex-col min-w-0 max-w-[70%]";
    const b = document.createElement("div"); b.className = "chat-bubble-role-assistant chat-bubble-role-mascot rounded-md break-words relative cursor-pointer select-none"; b.setAttribute("data-ui", "bubble-bot");
    const id2 = document.createElement("div"); const md = document.createElement("div"); md.className = "chat-markdown hide-scrollbar break-words";
    const p = document.createElement("div"); p.className = "chat-markdown-paragraph"; p.textContent = content;
    md.appendChild(p); id2.appendChild(md); b.appendChild(id2); cw.appendChild(b); w.appendChild(av); w.appendChild(cw);
    const ch = Array.from(container.children); let it: Element | null = null;
    for (const c of ch) { const ts = (c as HTMLElement).getAttribute("data-postoffice-ts"); if (ts && ts > timestamp) { it = c; break; } }
    if (it) container.insertBefore(w, it); else container.appendChild(w);
    console.log("[Postoffice] ✔ Injected #" + msgId + ":", content.slice(0, 40));
}

function _extractUserBubbleText(el: HTMLElement): string {
    const b = el.querySelector('.chat-bubble-role-user, [class*="bubble"]');
    return ((b || el).textContent?.trim() || "").slice(0, 100);
}

// ─── 核心同步 ───
function _syncBubblesToDOM(): void {
    const c = document.querySelector(".page-body.chat-scroll-anchored") as HTMLElement | null;
    if (!c) return;
    const utm = _getUserTimestamps();
    c.querySelectorAll('[data-role="user"]').forEach(el => {
        const h = el as HTMLElement;
        if (!h.getAttribute("data-postoffice-ts")) {
            const k = _extractUserBubbleText(h); if (k && utm[k]) h.setAttribute("data-postoffice-ts", utm[k]);
        }
    });
    const msgs = _getStoredMessages(); if (msgs.length === 0) return;
    let any = false;
    for (const m of msgs) { if (!c.querySelector(`[data-postoffice-id="${m.id}"]`)) { _injectBubble(c, m.content, m.id, m.timestamp); any = true; } }
    if (any) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
    c.querySelectorAll('[data-role="assistant"]').forEach(el => {
        const h = el as HTMLElement; if (!h.id?.startsWith("message-postoffice-")) h.style.display = "none";
    });
}

function _startDOMWatcher(): void {
    _syncBubblesToDOM();
    const o = new MutationObserver(() => { requestAnimationFrame(() => { _syncBubblesToDOM(); }); });
    o.observe(document.body, { childList: true, subtree: true });
    setInterval(_syncBubblesToDOM, 2000);
    console.log("[Postoffice] ✔ DOM watcher active");
}

function _startGlobalPolling(): void {
    if (window.__postoffice_started) return; window.__postoffice_started = true;
    console.log("[Postoffice] Global polling started");
    const poll = async () => {
        try {
            const r = await fetch("/api/float-chat"); if (!r.ok) return;
            const d = await r.json();
            if (d.messages?.length > 0) {
                const ids: number[] = [];
                for (const m of d.messages) { _storeMessage({ id: m.id, content: m.content, timestamp: m.created_at }); ids.push(m.id); }
                _markAsRead(ids); _syncBubblesToDOM();
                window.dispatchEvent(new CustomEvent(POSTOFFICE_EVENT, { detail: { messages: d.messages } }));
            }
        } catch {}
    };
    setTimeout(poll, 1500); setInterval(poll, 3000);
}

function _watchDOMForUserMessages(): void {
    const o = new MutationObserver((muts) => {
        for (const mut of muts) for (const n of Array.from(mut.addedNodes)) {
            if (!(n instanceof HTMLElement) || n.id?.startsWith("message-postoffice-")) continue;
            const ums = n.matches?.('[data-role="user"]') ? [n] : Array.from(n.querySelectorAll?.('[data-role="user"]') || []);
            for (const m of ums) {
                const h = m as HTMLElement;
                if (h.id?.startsWith("message-postoffice-") || h.getAttribute("data-postoffice-sent") === "1") continue;
                const t = _extractUserBubbleText(h); if (!t) continue;
                if (_isAlreadySent(t)) { h.setAttribute("data-postoffice-sent", "1"); continue; }
                h.setAttribute("data-postoffice-sent", "1"); _markAsSentText(t);
                const ts = new Date().toISOString(); h.setAttribute("data-postoffice-ts", ts); _setUserTimestamp(t, ts);
                console.log("[Postoffice] ★★★ user bubble! ★★★", t.slice(0, 50));
                sendPostofficeMessage(t);
            }
        }
    });
    o.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ Send watcher active");
}

function _patchURLConstructor(): void {
    const O = globalThis.URL;
    function P(...a: ConstructorParameters<typeof URL>): URL {
        // @ts-ignore
        try { return new O(...a); } catch { return new O("https://postoffice-sink.local/v1/chat/completions"); }
    }
    P.prototype = O.prototype;
    for (const k of Object.getOwnPropertyNames(O)) {
        if (k !== "prototype" && k !== "length" && k !== "name") try { (P as any)[k] = (O as any)[k]; } catch {}
    }
    (globalThis as any).URL = P;
    console.log("[Postoffice] ✔ URL patched");
}

// ─── CSS 注入（v6.5: 加 [role="alert"] 干掉顶部 toast） ───
function _injectSuppressorCSS(): void {
    const s = document.createElement("style"); s.id = "postoffice-suppressor";
    s.textContent = `
        .chat-msg-wrapper[data-role="assistant"]:not([data-postoffice-id]) { display: none !important; }
        [role="alert"] { display: none !important; }
        .chat-toast-bar, .chat-error-bar, [class*="toast"][class*="error"], [class*="toast"][class*="fail"] { display: none !important; }
    `;
    document.head.appendChild(s);
    console.log("[Postoffice] ✔ CSS injected (with alert suppression)");
}

function _patchFetch(): void {
    const of = window.fetch.bind(window);
    window.fetch = function(i: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const u = typeof i === "string" ? i : i instanceof URL ? i.toString() : (i as Request).url;
        const loc = u.startsWith("/") || u.startsWith(window.location.origin);
        const post = init?.method?.toUpperCase() === "POST" || (typeof i !== "string" && !(i instanceof URL) && (i as Request).method?.toUpperCase() === "POST");
        if (u.includes("postoffice-sink") || u.includes("/llm-sink/") || (!loc && post)) {
            return Promise.resolve(new Response("data: {\"choices\":[{\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }));
        }
        return of(i, init);
    } as typeof window.fetch;
    console.log("[Postoffice] ✔ fetch patched");
}

if (typeof window !== "undefined" && isPostofficeMode()) {
    _injectSuppressorCSS();
    _patchURLConstructor();
    _startGlobalPolling();
    _patchFetch();
    _watchDOMForUserMessages();
    _startDOMWatcher();
}
