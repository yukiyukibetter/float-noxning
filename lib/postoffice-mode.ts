// lib/postoffice-mode.ts — v7.0
// v6.9 → v7.0: 去掉已读标记，改为客户端 localStorage 去重。多设备不再互相抢消息。

export const POSTOFFICE_EVENT = "postoffice-new-messages";
const LS_KEY = "float-postoffice-messages";
const LS_SENT_KEY = "float-postoffice-sent";
const LS_USER_TS_KEY = "float-postoffice-user-ts";
declare global { interface Window { __postoffice_started?: boolean; } }
interface StoredMessage { id: number; content: string; timestamp: string; }
interface SentRecord { text: string; ts: number; }

function _getStoredMessages(): StoredMessage[] { try { const r = localStorage.getItem(LS_KEY); const m: StoredMessage[] = r ? JSON.parse(r) : []; m.sort((a,b) => (a.timestamp||"").localeCompare(b.timestamp||"")); return m; } catch { return []; } }
function _storeMessage(msg: StoredMessage): boolean { const m = _getStoredMessages(); if (m.some(x => x.id === msg.id)) return false; m.push(msg); while (m.length > 200) m.shift(); localStorage.setItem(LS_KEY, JSON.stringify(m)); return true; }
function _getSentRecords(): SentRecord[] { try { const r = localStorage.getItem(LS_SENT_KEY); return (r ? JSON.parse(r) as SentRecord[] : []).filter(x => x.ts > Date.now() - 3600000); } catch { return []; } }
function _isAlreadySent(t: string): boolean { return _getSentRecords().some(r => r.text === t); }
function _markAsSentText(t: string): void { try { const r = _getSentRecords(); r.push({ text: t, ts: Date.now() }); while (r.length > 80) r.shift(); localStorage.setItem(LS_SENT_KEY, JSON.stringify(r)); } catch {} }
function _getUserTimestamps(): Record<string, string> { try { return JSON.parse(localStorage.getItem(LS_USER_TS_KEY) || "{}"); } catch { return {}; } }
function _setUserTimestamp(k: string, ts: string): void { try { const m = _getUserTimestamps(); m[k] = ts; const ks = Object.keys(m); while (ks.length > 100) delete m[ks.shift()!]; localStorage.setItem(LS_USER_TS_KEY, JSON.stringify(m)); } catch {} }

export function isPostofficeMode(): boolean { return typeof window !== "undefined" && localStorage.getItem("float-postoffice-mode") !== "false"; }
export async function sendPostofficeMessage(content: string): Promise<boolean> { try { return (await fetch("/api/float-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) })).ok; } catch { return false; } }

// ——— v7.0: 动态头像系统 ———
let _avatarSrc = "/mascot.png";

async function _loadAvatarFromDB(): Promise<void> {
    try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open("AiPhoneKvDB");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const tx = db.transaction("entries", "readonly");
        const store = tx.objectStore("entries");
        const result = await new Promise<any>((resolve, reject) => {
            const req = store.get("ai_phone_characters_v1");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        db.close();
        if (result?.value) {
            const chars = JSON.parse(result.value);
            if (Array.isArray(chars) && chars.length > 0 && chars[0]?.avatar) {
                _avatarSrc = chars[0].avatar;
                console.log("[Postoffice] ✔ Avatar loaded from DB", _avatarSrc.slice(0, 40) + "...");
                document.querySelectorAll('[data-postoffice-id] .chat-msg-avatar img').forEach(img => {
                    (img as HTMLImageElement).src = _avatarSrc;
                });
            }
        }
    } catch (e) {
        console.warn("[Postoffice] Avatar load failed, using default", e);
    }
}

function _injectBubble(c: HTMLElement, content: string, msgId: number, timestamp: string): void {
    if (c.querySelector(`[data-postoffice-id="${msgId}"]`)) return;
    const w = document.createElement("div"); w.className = "chat-msg-wrapper"; w.setAttribute("data-role", "assistant"); w.setAttribute("data-postoffice-id", String(msgId)); w.setAttribute("data-postoffice-ts", timestamp); w.id = `message-postoffice-${msgId}`;
    const av = document.createElement("div"); av.className = "chat-msg-avatar w-[40px] h-[40px] rounded-[20px] bg-white shrink-0 flex items-center justify-center overflow-hidden";
    const img = document.createElement("img"); img.className = "w-full h-full object-cover rounded-[20px]"; img.alt = "澈澈"; img.src = _avatarSrc;
    av.appendChild(img);
    const cw = document.createElement("div"); cw.className = "chat-msg-content-wrap flex flex-col min-w-0 max-w-[70%]";
    const b = document.createElement("div"); b.className = "chat-bubble-role-assistant chat-bubble-role-mascot rounded-md break-words relative cursor-pointer select-none"; b.setAttribute("data-ui", "bubble-bot");
    const d = document.createElement("div"); const md = document.createElement("div"); md.className = "chat-markdown hide-scrollbar break-words"; const p = document.createElement("div"); p.className = "chat-markdown-paragraph"; p.textContent = content;
    md.appendChild(p); d.appendChild(md); b.appendChild(d); cw.appendChild(b); w.appendChild(av); w.appendChild(cw);
    const ch = Array.from(c.children); let it: Element | null = null;
    for (const x of ch) { const ts = (x as HTMLElement).getAttribute("data-postoffice-ts"); if (ts && ts > timestamp) { it = x; break; } }
    if (it) c.insertBefore(w, it); else c.appendChild(w);
}
function _extractUserBubbleText(el: HTMLElement): string { const b = el.querySelector('.chat-bubble-role-user, [class*="bubble"]'); return ((b || el).textContent?.trim() || "").slice(0, 100); }

function _syncBubblesToDOM(): void {
    const c = document.querySelector(".page-body.chat-scroll-anchored") as HTMLElement | null; if (!c) return;
    const utm = _getUserTimestamps();
    c.querySelectorAll('[data-role="user"]').forEach(el => { const h = el as HTMLElement; if (!h.getAttribute("data-postoffice-ts")) { const k = _extractUserBubbleText(h); if (k && utm[k]) h.setAttribute("data-postoffice-ts", utm[k]); } });
    const msgs = _getStoredMessages(); if (msgs.length === 0) return;
    let any = false;
    for (const m of msgs) { if (!c.querySelector(`[data-postoffice-id="${m.id}"]`)) { _injectBubble(c, m.content, m.id, m.timestamp); any = true; } }
    if (any) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
    c.querySelectorAll('[data-role="assistant"]').forEach(el => { const h = el as HTMLElement; if (!h.id?.startsWith("message-postoffice-")) h.style.display = "none"; });
}
function _startDOMWatcher(): void { _syncBubblesToDOM(); new MutationObserver(() => { requestAnimationFrame(() => { _syncBubblesToDOM(); }); }).observe(document.body, { childList: true, subtree: true }); setInterval(_syncBubblesToDOM, 2000); }

// ——— v7.0: 轮询改为客户端去重，不标记已读 ———
function _startGlobalPolling(): void {
    if (window.__postoffice_started) return; window.__postoffice_started = true;
    const poll = async () => {
        try {
            const r = await fetch("/api/float-chat"); if (!r.ok) return;
            const d = await r.json();
            if (d.messages?.length > 0) {
                const newMsgs: any[] = [];
                for (const m of d.messages) {
                    const isNew = _storeMessage({ id: m.id, content: m.content, timestamp: m.created_at });
                    if (isNew) newMsgs.push(m);
                }
                if (newMsgs.length > 0) {
                    _syncBubblesToDOM();
                    window.dispatchEvent(new CustomEvent(POSTOFFICE_EVENT, { detail: { messages: newMsgs } }));
                }
            }
        } catch {}
    };
    setTimeout(poll, 1500); setInterval(poll, 3000);
}

function _watchDOMForUserMessages(): void {
    new MutationObserver((muts) => { for (const mut of muts) for (const n of Array.from(mut.addedNodes)) {
        if (!(n instanceof HTMLElement) || n.id?.startsWith("message-postoffice-")) continue;
        const ums = n.matches?.('[data-role="user"]') ? [n] : Array.from(n.querySelectorAll?.('[data-role="user"]') || []);
        for (const m of ums) { const h = m as HTMLElement; if (h.id?.startsWith("message-postoffice-") || h.getAttribute("data-postoffice-sent") === "1") continue; const t = _extractUserBubbleText(h); if (!t) continue; if (_isAlreadySent(t)) { h.setAttribute("data-postoffice-sent", "1"); continue; } h.setAttribute("data-postoffice-sent", "1"); _markAsSentText(t); const ts = new Date().toISOString(); h.setAttribute("data-postoffice-ts", ts); _setUserTimestamp(t, ts); sendPostofficeMessage(t); }
    } }).observe(document.body, { childList: true, subtree: true });
}
function _patchURLConstructor(): void {
    const O = globalThis.URL;
    function P(...a: ConstructorParameters<typeof URL>): URL { try { return new (O as any)(...a); } catch { return new (O as any)("https://postoffice-sink.local/v1/chat/completions"); } }
    P.prototype = O.prototype; for (const k of Object.getOwnPropertyNames(O)) { if (k !== "prototype" && k !== "length" && k !== "name") try { (P as any)[k] = (O as any)[k]; } catch {} }
    (globalThis as any).URL = P;
}
function _injectSuppressorCSS(): void {
    const s = document.createElement("style"); s.id = "postoffice-suppressor";
    s.textContent = `
        .chat-msg-wrapper[data-role="assistant"]:not([data-postoffice-id]) { display: none !important; }
        [role="alert"] { display: none !important; }
    `;
    document.head.appendChild(s);
}
function _patchFetch(): void {
    const of = window.fetch.bind(window);
    window.fetch = function(i: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const u = typeof i === "string" ? i : i instanceof URL ? i.toString() : (i as Request).url;
        const loc = u.startsWith("/") || u.startsWith(window.location.origin);
        const post = init?.method?.toUpperCase() === "POST" || (typeof i !== "string" && !(i instanceof URL) && (i as Request).method?.toUpperCase() === "POST");
        if (u.includes("postoffice-sink") || u.includes("/llm-sink/") || (!loc && post)) { return Promise.resolve(new Response("data: {\"choices\":[{\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n", { status: 200, headers: { "content-type": "text/event-stream" } })); }
        return of(i, init);
    } as typeof window.fetch;
}

function _killErrorText(): void {
    const killed = new WeakSet<HTMLElement>();
    const ERROR_PATTERNS = ["生成失败", "出错了", "请先在设置", "绑定配置", "设置 API"];
    setInterval(() => {
        document.querySelectorAll("[role='alert']").forEach((el) => {
            (el as HTMLElement).style.cssText += ";display:none!important;height:0!important;overflow:hidden!important;";
        });
        document.querySelectorAll("*").forEach((el) => {
            const h = el as HTMLElement;
            if (killed.has(h)) return;
            const t = h.textContent || "";
            if (t.length < 3 || t.length > 60) return;
            if (!ERROR_PATTERNS.some(p => t.includes(p))) return;
            let target = h;
            for (let i = 0; i < 5; i++) {
                const parent = target.parentElement;
                if (!parent || parent === document.body || parent.tagName === "MAIN") break;
                const pt = parent.textContent || "";
                if (pt.length < 80 && ERROR_PATTERNS.some(p => pt.includes(p))) target = parent;
                else break;
            }
            target.style.cssText += ";display:none!important;height:0!important;overflow:hidden!important;";
            killed.add(target);
            console.log("[Postoffice] ✔ KILLED error text:", t.slice(0, 30));
        });
    }, 300);
}

export function drainPendingMessages(): any[] { return []; }

if (typeof window !== "undefined" && isPostofficeMode()) {
    _injectSuppressorCSS();
    _patchURLConstructor();
    _startGlobalPolling();
    _patchFetch();
    _killErrorText();
    _watchDOMForUserMessages();
    _startDOMWatcher();
    _loadAvatarFromDB();
    console.log("[Postoffice] ✔ v7.0 initialized");
}
