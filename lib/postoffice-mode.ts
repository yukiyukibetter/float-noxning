// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v6.2
// v6.1 → v6.2 改动：
//   P1 加强: _patchURLConstructor 拦截 new URL() 错误（chat-engine 在 fetch 之前就炸的根源）
//   P1 加强: _suppressErrorToasts 隐藏 "生成失败" toast
//   → 现在不需要配任何 API 设置，postoffice 模式完全自治
// v6.0 → v6.1 改动：
//   P0: 消息按 timestamp 排序 + insertBefore 正确位置
//   P1: _patchFetch 增加 llm-sink 拦截
//   P4: 发送方向用 localStorage 持久化去重

export const POSTOFFICE_EVENT = "postoffice-new-messages";

const LS_KEY = "float-postoffice-messages";
const LS_SENT_KEY = "float-postoffice-sent";
const LS_USER_TS_KEY = "float-postoffice-user-ts";

declare global {
    interface Window {
        __postoffice_started?: boolean;
    }
}

// ─── localStorage 持久化（邮局消息） ───

interface StoredMessage {
    id: number;
    content: string;
    timestamp: string;
}

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

// ─── localStorage 持久化（发送去重 P4） ───

interface SentRecord {
    text: string;
    ts: number;
}

function _getSentRecords(): SentRecord[] {
    try {
        const raw = localStorage.getItem(LS_SENT_KEY);
        const records: SentRecord[] = raw ? JSON.parse(raw) : [];
        const cutoff = Date.now() - 3600000;
        return records.filter(r => r.ts > cutoff);
    } catch { return []; }
}

function _isAlreadySent(text: string): boolean {
    return _getSentRecords().some(r => r.text === text);
}

function _markAsSentText(text: string): void {
    try {
        const records = _getSentRecords();
        records.push({ text, ts: Date.now() });
        while (records.length > 80) records.shift();
        localStorage.setItem(LS_SENT_KEY, JSON.stringify(records));
    } catch {}
}

// ─── localStorage 持久化（用户气泡时间戳 P0） ───

function _getUserTimestamps(): Record<string, string> {
    try {
        return JSON.parse(localStorage.getItem(LS_USER_TS_KEY) || "{}");
    } catch { return {}; }
}

function _setUserTimestamp(key: string, ts: string): void {
    try {
        const map = _getUserTimestamps();
        map[key] = ts;
        const keys = Object.keys(map);
        while (keys.length > 100) delete map[keys.shift()!];
        localStorage.setItem(LS_USER_TS_KEY, JSON.stringify(map));
    } catch {}
}

// ─── 基础工具 ───

export function isPostofficeMode(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("float-postoffice-mode") !== "false";
}

export async function sendPostofficeMessage(content: string): Promise<boolean> {
    console.log("[Postoffice] ★ Sending:", content.slice(0, 80));
    try {
        const res = await fetch("/api/float-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
        });
        return res.ok;
    } catch (err) {
        console.error("[Postoffice] Send error:", err);
        return false;
    }
}

async function _markAsRead(ids: number[]): Promise<void> {
    try {
        await fetch("/api/float-chat", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
        });
        console.log("[Postoffice] Marked as read:", ids);
    } catch (err) {
        console.warn("[Postoffice] Mark-read failed:", err);
    }
}

// ─── DOM 注入（P0: 按时间戳插入正确位置） ───

function _injectBubble(container: HTMLElement, content: string, msgId: number, timestamp: string): void {
    if (container.querySelector(`[data-postoffice-id="${msgId}"]`)) return;

    const wrapper = document.createElement("div");
    wrapper.className = "chat-msg-wrapper";
    wrapper.setAttribute("data-role", "assistant");
    wrapper.setAttribute("data-postoffice-id", String(msgId));
    wrapper.setAttribute("data-postoffice-ts", timestamp);
    wrapper.id = `message-postoffice-${msgId}`;

    const avatar = document.createElement("div");
    avatar.className = "chat-msg-avatar w-[40px] h-[40px] rounded-[20px] bg-white shrink-0 flex items-center justify-center overflow-hidden";
    avatar.innerHTML = '<img class="w-full h-full object-contain p-[2px]" alt="澈澈" src="/mascot.png">';

    const contentWrap = document.createElement("div");
    contentWrap.className = "chat-msg-content-wrap flex flex-col min-w-0 max-w-[70%]";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble-role-assistant chat-bubble-role-mascot rounded-md break-words relative cursor-pointer select-none";
    bubble.setAttribute("data-ui", "bubble-bot");

    const innerDiv = document.createElement("div");
    const markdown = document.createElement("div");
    markdown.className = "chat-markdown hide-scrollbar break-words";
    const paragraph = document.createElement("div");
    paragraph.className = "chat-markdown-paragraph";
    paragraph.textContent = content;

    markdown.appendChild(paragraph);
    innerDiv.appendChild(markdown);
    bubble.appendChild(innerDiv);
    contentWrap.appendChild(bubble);
    wrapper.appendChild(avatar);
    wrapper.appendChild(contentWrap);

    const children = Array.from(container.children);
    let insertTarget: Element | null = null;
    for (const child of children) {
        const childTs = (child as HTMLElement).getAttribute("data-postoffice-ts");
        if (childTs && childTs > timestamp) {
            insertTarget = child;
            break;
        }
    }

    if (insertTarget) {
        container.insertBefore(wrapper, insertTarget);
    } else {
        container.appendChild(wrapper);
    }

    console.log("[Postoffice] ✔ Injected bubble #" + msgId + ":", content.slice(0, 40));
}

// ─── 核心：同步所有邮局消息到 DOM ───

function _syncBubblesToDOM(): void {
    const container = document.querySelector(".page-body.chat-scroll-anchored") as HTMLElement | null;
    if (!container) return;

    const userTsMap = _getUserTimestamps();
    const allUserBubbles = container.querySelectorAll('[data-role="user"]');
    for (const el of Array.from(allUserBubbles)) {
        const htmlEl = el as HTMLElement;
        if (!htmlEl.getAttribute("data-postoffice-ts")) {
            const textKey = _extractUserBubbleText(htmlEl);
            if (textKey && userTsMap[textKey]) {
                htmlEl.setAttribute("data-postoffice-ts", userTsMap[textKey]);
            }
        }
    }

    const messages = _getStoredMessages();
    if (messages.length === 0) return;

    let injectedAny = false;
    for (const msg of messages) {
        if (!container.querySelector(`[data-postoffice-id="${msg.id}"]`)) {
            _injectBubble(container, msg.content, msg.id, msg.timestamp);
            injectedAny = true;
        }
    }

    if (injectedAny) {
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    const allAssistant = container.querySelectorAll('[data-role="assistant"]');
    for (const el of Array.from(allAssistant)) {
        const htmlEl = el as HTMLElement;
        if (!htmlEl.id?.startsWith("message-postoffice-")) {
            htmlEl.style.display = "none";
        }
    }
}

function _extractUserBubbleText(el: HTMLElement): string {
    const bubble = el.querySelector('.chat-bubble-role-user, [class*="bubble"]');
    const textEl = bubble || el;
    return (textEl.textContent?.trim() || "").slice(0, 100);
}

// ─── MutationObserver ───

function _startDOMWatcher(): void {
    _syncBubblesToDOM();

    const observer = new MutationObserver(() => {
        requestAnimationFrame(() => {
            _syncBubblesToDOM();
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ DOM watcher active (sync on every mutation)");

    setInterval(_syncBubblesToDOM, 2000);
}

// ─── 轮询 ───

function _startGlobalPolling(): void {
    if (window.__postoffice_started) return;
    window.__postoffice_started = true;
    console.log("[Postoffice] Global polling started");

    const poll = async () => {
        try {
            const res = await fetch("/api/float-chat");
            if (!res.ok) return;
            const data = await res.json();
            if (data.messages?.length > 0) {
                console.log("[Postoffice] New messages:", data.messages.length);
                const ids: number[] = [];
                for (const msg of data.messages) {
                    _storeMessage({ id: msg.id, content: msg.content, timestamp: msg.created_at });
                    ids.push(msg.id);
                }
                _markAsRead(ids);
                _syncBubblesToDOM();
                window.dispatchEvent(
                    new CustomEvent(POSTOFFICE_EVENT, { detail: { messages: data.messages } }),
                );
            }
        } catch (err) {
            console.warn("[Postoffice] Poll error:", err);
        }
    };

    setTimeout(poll, 1500);
    setInterval(poll, 3000);
}

// ─── 发送方向（P4: localStorage 持久化去重） ───

function _watchDOMForUserMessages(): void {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (!(node instanceof HTMLElement)) continue;
                if (node.id?.startsWith("message-postoffice-")) continue;
                const userMsgs = node.matches?.('[data-role="user"]')
                    ? [node]
                    : Array.from(node.querySelectorAll?.('[data-role="user"]') || []);
                for (const msgEl of userMsgs) {
                    const htmlEl = msgEl as HTMLElement;
                    if (htmlEl.id?.startsWith("message-postoffice-")) continue;

                    if (htmlEl.getAttribute("data-postoffice-sent") === "1") continue;

                    const text = _extractUserBubbleText(htmlEl);
                    if (!text) continue;

                    if (_isAlreadySent(text)) {
                        htmlEl.setAttribute("data-postoffice-sent", "1");
                        continue;
                    }

                    htmlEl.setAttribute("data-postoffice-sent", "1");
                    _markAsSentText(text);

                    const nowTs = new Date().toISOString();
                    htmlEl.setAttribute("data-postoffice-ts", nowTs);
                    _setUserTimestamp(text, nowTs);

                    console.log("[Postoffice] ★★★ DOM: user bubble detected! ★★★", text.slice(0, 50));
                    sendPostofficeMessage(text);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ Send watcher active (localStorage dedup)");
}

// ─── URL 构造器补丁（P1 v6.2: 在 new URL() 爆炸前拦截） ───

function _patchURLConstructor(): void {
    const OrigURL = globalThis.URL;

    function PatchedURL(...args: ConstructorParameters<typeof URL>): URL {
        try {
            // @ts-ignore
            return new OrigURL(...args);
        } catch (_e) {
            console.warn("[Postoffice] URL() failed, returning dummy →", String(args[0]).slice(0, 60));
            return new OrigURL("https://postoffice-sink.local/v1/chat/completions");
        }
    }

    PatchedURL.prototype = OrigURL.prototype;
    for (const key of Object.getOwnPropertyNames(OrigURL)) {
        if (key !== "prototype" && key !== "length" && key !== "name") {
            try { (PatchedURL as any)[key] = (OrigURL as any)[key]; } catch {}
        }
    }

    (globalThis as any).URL = PatchedURL;
    console.log("[Postoffice] ✔ URL constructor patched");
}

// ─── 错误弹窗抑制（P1 v6.2） ───

function _suppressErrorToasts(): void {
    const observer = new MutationObserver(() => {
        const alerts = document.querySelectorAll('[role="alert"]');
        for (const el of Array.from(alerts)) {
            const text = (el as HTMLElement).textContent || "";
            if (text.includes("生成失败") || text.includes("出错了") || text.includes("expected pattern")) {
                (el as HTMLElement).style.display = "none";
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ Error toast suppressor active");
}

// ─── fetch patch ───

function _patchFetch(): void {
    const originalFetch = window.fetch.bind(window);
    window.fetch = function patchedFetch(
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> {
        const url = typeof input === "string"
            ? input
            : input instanceof URL
                ? input.toString()
                : (input as Request).url;

        const isLocal = url.startsWith("/") || url.startsWith(window.location.origin);
        const isPost = init?.method?.toUpperCase() === "POST"
            || (typeof input !== "string" && !(input instanceof URL) && (input as Request).method?.toUpperCase() === "POST");

        const isLlmSink = url.includes("/llm-sink/") || url.includes("/llm-sink?");
        const isDummySink = url.includes("postoffice-sink.local");

        if (isLlmSink || isDummySink || (!isLocal && isPost)) {
            return Promise.resolve(new Response(
                "data: {\"choices\":[{\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
                { status: 200, headers: { "content-type": "text/event-stream" } },
            ));
        }
        return originalFetch(input, init);
    } as typeof window.fetch;
    console.log("[Postoffice] ✔ fetch patched (with llm-sink + dummy intercept)");
}

// ─── 初始化 ───

if (typeof window !== "undefined" && isPostofficeMode()) {
    _patchURLConstructor();   // v6.2: 必须最先执行，拦截 new URL() 错误
    _startGlobalPolling();
    _patchFetch();
    _suppressErrorToasts();
    _watchDOMForUserMessages();
    _startDOMWatcher();
}
