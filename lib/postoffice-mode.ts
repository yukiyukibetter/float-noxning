// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式
// 所有状态存 window，避免 Next.js 代码分割导致模块重复实例化

export const POSTOFFICE_EVENT = "postoffice-new-messages";

declare global {
    interface Window {
        __postoffice?: {
            started: boolean;
            pending: any[];
            sentIds: Set<string>;
        };
    }
}

function _state() {
    if (typeof window === "undefined") return { started: false, pending: [] as any[], sentIds: new Set<string>() };
    if (!window.__postoffice) window.__postoffice = { started: false, pending: [], sentIds: new Set<string>() };
    if (!window.__postoffice.sentIds) window.__postoffice.sentIds = new Set<string>();
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
 * 核弹级方案 v3：hook IndexedDB put 操作
 * pushChatMessage 最终会调用 IDBObjectStore.put 写入消息
 * 这是最底层的拦截，不可能被 tree-shake
 */
function _hookIndexedDBForUserMessages(): void {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: any, key?: IDBValidKey) {
        // 只拦截 messages 表的 user 消息
        if (
            this.name === "messages" &&
            value &&
            typeof value === "object" &&
            value.role === "user" &&
            typeof value.content === "string" &&
            value.content.trim()
        ) {
            const msgId = value.id || "";
            const state = _state();
            // 防重复：同一个消息ID只发一次
            if (msgId && !state.sentIds.has(msgId)) {
                state.sentIds.add(msgId);
                // 10秒后清理防重复记录
                setTimeout(() => state.sentIds.delete(msgId), 10000);
                // 跳过特殊消息类型（拍一拍、骰子、工具等）
                const mt = value.mediaType;
                if (!mt || mt === "quote") {
                    console.log("[Postoffice] ★★★ IDB hook: user message detected! ★★★", value.content.slice(0, 50));
                    sendPostofficeMessage(value.content.trim());
                }
            }
        }
        return originalPut.call(this, value, key);
    };
    console.log("[Postoffice] ✔ IndexedDB put hooked — user messages will be auto-sent to postoffice");
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
    _hookIndexedDBForUserMessages();
}
