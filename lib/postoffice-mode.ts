// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v6.4
// v6.3 → v6.4: 砍掉 _suppressErrorToasts（MutationObserver + TreeWalker + style 修改 = 无限循环 → 白屏）
//   CSS 注入已经够用了，toast 用 setInterval 安全地处理
// v6.2 → v6.3: _injectSuppressorCSS 注入 CSS 隐藏错误气泡
// v6.1 → v6.2: _patchURLConstructor 拦截 new URL() 错误
// v6.0 → v6.1: P0 消息排序 / P1 llm-sink 拦截 / P4 localStorage 去重

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

interface SentRecord { text: string; ts: number; }

function _getSentRecords(): SentRecord[] {
    try {
        const raw = localStorage.getItem(LS_SENT_KEY);
        const records: SentRecord[] = raw ? JSON.parse(raw) : [];
        return records.filter(r => r.ts > Date.now() - 3600000);
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
    try { return JSON.parse(localStorage.getItem(LS_USER_TS_KEY) || "{}"); } catch { return {}; }
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
    } catch {}
}

// ─── DOM 注入 ───

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
        if (childTs && childTs > timestamp) { insertTarget = child; break; }
    }
    if (insertTarget) { container.insertBefore(wrapper, insertTarget); }
    else { container.appendChild(wrapper); }

    console.log("[Postoffice] ✔ Injected bubble #" + msgId + ":", content.slice(0, 40));
}

// ─── 核心同步 ───

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
        requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
    }

    // JS fallback: 也用 JS 隐藏（配合 CSS 双保险）
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
        requestAnimationFrame(() => { _syncBubblesToDOM(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ DOM watcher active");
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
                const ids: number[] = [];
                for (const msg of data.messages) {
                    _storeMessage({ id: msg.id, content: msg.content, timestamp: msg.created_at });
                    ids.push(msg.id);
                }
                _markAsRead(ids);
                _syncBubblesToDOM();
                window.dispatchEvent(new CustomEvent(POSTOFFICE_EVENT, { detail: { messages: data.messages } }));
            }
        } catch {}
    };

    setTimeout(poll, 1500);
    setInterval(poll, 3000);
}

// ─── 发送方向 ───

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
    console.log("[Postoffice] ✔ Send watcher active");
}

// ─── URL 构造器补丁 ───

function _patchURLConstructor(): void {
    const OrigURL = globalThis.URL;

    function PatchedURL(...args: ConstructorParameters<typeof URL>): URL {
        try {
            // @ts-ignore
            return new OrigURL(...args);
        } catch (_e) {
            console.warn("[Postoffice] URL() failed, returning dummy");
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

// ─── CSS 注入（v6.3 核心：立即隐藏所有 LLM 垃圾） ───

function _injectSuppressorCSS(): void {
    const style = document.createElement("style");
    style.id = "postoffice-suppressor";
    style.textContent = `
        /* 隐藏所有非邮局的 assistant 气泡 */
        .chat-msg-wrapper[data-role="assistant"]:not([data-postoffice-id]) {
            display: none !important;
        }
        /* 隐藏 Float 错误相关的 toast/banner */
        .chat-toast-bar, .chat-error-bar,
        [class*="toast"][class*="error"],
        [class*="toast"][class*="fail"] {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
    console.log("[Postoffice] ✔ Suppressor CSS injected");
}

// ─── 安全的 toast 隐藏（v6.4: 用 setInterval 代替 MutationObserver 避免无限循环） ───

function _suppressErrorToastsSafe(): void {
    setInterval(() => {
        // 只查找小元素，避免误杀大容器
        document.querySelectorAll('[class*="toast"], [class*="banner"], [class*="snackbar"]').forEach((el) => {
            const text = (el as HTMLElement).textContent || "";
            if (text.includes("生成失败") || text.includes("出错了")) {
                (el as HTMLElement).style.display = "none";
            }
        });
    }, 1000);
    console.log("[Postoffice] ✔ Toast suppressor active (safe interval)");
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
    console.log("[Postoffice] ✔ fetch patched");
}

// ─── 初始化 ───

if (typeof window !== "undefined" && isPostofficeMode()) {
    _injectSuppressorCSS();        // CSS 立即生效
    _patchURLConstructor();         // 拦截 new URL() 错误
    _startGlobalPolling();
    _patchFetch();
    _suppressErrorToastsSafe();     // v6.4: 安全的 setInterval 替代致命的 MutationObserver
    _watchDOMForUserMessages();
    _startDOMWatcher();
}
