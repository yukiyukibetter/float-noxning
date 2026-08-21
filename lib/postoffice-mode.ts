// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式
// 所有状态存 window，避免 Next.js 代码分割导致模块重复实例化

export const POSTOFFICE_EVENT = "postoffice-new-messages";

declare global {
    interface Window {
        __postoffice?: {
            started: boolean;
            pending: any[];
            sentContents: Set<string>;
        };
    }
}

function _state() {
    if (typeof window === "undefined") return { started: false, pending: [] as any[], sentContents: new Set<string>() };
    if (!window.__postoffice) window.__postoffice = { started: false, pending: [], sentContents: new Set<string>() };
    // 兼容旧版本没有 sentContents 的情况
    if (!window.__postoffice.sentContents) window.__postoffice.sentContents = new Set<string>();
    return window.__postoffice;
}

export function isPostofficeMode(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("float-postoffice-mode") !== "false";
}

export async function sendPostofficeMessage(content: string): Promise<boolean> {
    console.log("[Postoffice] ★ Sending message:", content.slice(0, 80));
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
    console.log("[Postoffice] Global polling started (window-state)");

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
 * 核弹级方案 v2：监听 chat-message-pushed 事件
 * pushChatMessage 每次创建消息后都会派发这个事件
 * 不依赖 chat-room.tsx 里的任何代码
 */
function _watchUserMessages(): void {
    window.addEventListener("chat-message-pushed", (e: Event) => {
        const msg = (e as CustomEvent).detail?.message;
        if (!msg || msg.role !== "user") return;
        // 跳过特殊消息类型（拍一拍、红包等不需要发到邮局）
        if (msg.mediaType && msg.mediaType !== "quote") return;
        const content = msg.content?.trim();
        if (!content) return;
        // 防重复：同样内容2秒内不重复发送
        const state = _state();
        const dedupeKey = `${content}:${Math.floor(Date.now() / 2000)}`;
        if (state.sentContents.has(dedupeKey)) return;
        state.sentContents.add(dedupeKey);
        // 3秒后清理防重复记录
        setTimeout(() => state.sentContents.delete(dedupeKey), 3000);
        console.log("[Postoffice] ★★★ User message detected via event! Sending to postoffice ★★★", content.slice(0, 50));
        sendPostofficeMessage(content);
    });
    console.log("[Postoffice] ✔ Watching chat-message-pushed events for user messages");
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
    console.log("[Postoffice] ✔ window.fetch patched — external POST requests will be blocked");
}

if (typeof window !== "undefined" && isPostofficeMode()) {
    _startGlobalPolling();
    _patchFetchForPostoffice();
    _watchUserMessages();
}
