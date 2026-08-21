// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v4
// DOM MutationObserver：监听用户消息气泡出现，提取文字发邮局

export const POSTOFFICE_EVENT = "postoffice-new-messages";

declare global {
    interface Window {
        __postoffice?: {
            started: boolean;
            pending: any[];
            sentTexts: Set<string>;
        };
    }
}

function _state() {
    if (typeof window === "undefined") return { started: false, pending: [] as any[], sentTexts: new Set<string>() };
    if (!window.__postoffice) window.__postoffice = { started: false, pending: [], sentTexts: new Set<string>() };
    if (!window.__postoffice.sentTexts) window.__postoffice.sentTexts = new Set<string>();
    return window.__postoffice;
}

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
        console.log("[Postoffice] Send result:", res.ok, res.status);
        return res.ok;
    } catch (err) {
        console.error("[Postoffice] Send error:", err);
        return false;
    }
}

export function drainPendingMessages(): any[] {
    return _state().pending.splice(0);
}

function _startGlobalPolling(): void {
    const s = _state();
    if (s.started) return;
    s.started = true;
    console.log("[Postoffice] Global polling started");

    const poll = async () => {
        try {
            const res = await fetch("/api/float-chat");
            if (!res.ok) return;
            const data = await res.json();
            if (data.messages?.length > 0) {
                console.log("[Postoffice] New messages:", data.messages.length);
                _state().pending.push(...data.messages);
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

/**
 * 核弹级方案 v4：MutationObserver 监听 DOM
 * 用户消息气泡出现在 DOM 时，提取文字内容发到邮局
 * 这是最底层的拦截——DOM 变化不可能被任何编译器优化掉
 */
function _watchDOMForUserMessages(): void {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (!(node instanceof HTMLElement)) continue;
                // 查找 data-role="user" 的消息 wrapper
                const userMsgs = node.matches?.('[data-role="user"]')
                    ? [node]
                    : Array.from(node.querySelectorAll?.('[data-role="user"]') || []);
                for (const msgEl of userMsgs) {
                    // 提取消息文字（跳过系统消息、拍一拍等）
                    const bubble = (msgEl as HTMLElement).querySelector?.('.chat-bubble-role-user, [class*="bubble"]');
                    const textEl = bubble || msgEl;
                    const text = (textEl as HTMLElement).textContent?.trim();
                    if (!text) continue;
                    const state = _state();
                    // 防重复：同一文字3秒内不重复发送
                    const dedupeKey = `${text}:${Math.floor(Date.now() / 3000)}`;
                    if (state.sentTexts.has(dedupeKey)) continue;
                    state.sentTexts.add(dedupeKey);
                    setTimeout(() => state.sentTexts.delete(dedupeKey), 5000);
                    console.log("[Postoffice] ★★★ DOM: user bubble detected! ★★★", text.slice(0, 50));
                    sendPostofficeMessage(text);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ DOM MutationObserver active — watching for user message bubbles");
}

function _patchFetchForPostoffice(): void {
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

        if (!isLocal && isPost) {
            console.log("[Postoffice] ✘ Blocked external POST (LLM):", url.slice(0, 80));
            return Promise.resolve(new Response(
                "data: {\"choices\":[{\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
                {
                    status: 200,
                    headers: {
                        "content-type": "text/event-stream",
                    },
                },
            ));
        }

        return originalFetch(input, init);
    } as typeof window.fetch;
    console.log("[Postoffice] ✔ window.fetch patched");
}

if (typeof window !== "undefined" && isPostofficeMode()) {
    _startGlobalPolling();
    _patchFetchForPostoffice();
    _watchDOMForUserMessages();
}
