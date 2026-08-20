// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式
// 所有状态存 window，避免 Next.js 代码分割导致模块重复实例化

export const POSTOFFICE_EVENT = "postoffice-new-messages";

// chat-storage.ts 导出的事件名，硬编码避免循环依赖
const CHAT_REQUEST_REPLY = "chat-request-reply";

declare global {
    interface Window {
        __postoffice?: {
            started: boolean;
            pending: any[];
        };
    }
}

function _state() {
    if (typeof window === "undefined") return { started: false, pending: [] as any[] };
    if (!window.__postoffice) window.__postoffice = { started: false, pending: [] };
    return window.__postoffice;
}

export function isPostofficeMode(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("float-postoffice-mode") !== "false";
}

export async function sendPostofficeMessage(content: string): Promise<boolean> {
    try {
        console.log("[Postoffice] Sending message:", content.slice(0, 50));
        const res = await fetch("/api/float-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
        });
        console.log("[Postoffice] Send result:", res.ok);
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
 * 全局 LLM 阻断：在 capture 阶段拦截 chat-request-reply 事件，
 * 阻止 ChatRoom 的 triggerAIResponse 被任何路径触发（FollowUp / KeyboardAutoSend / 外部调用）。
 * 同时 commitSendText 内部的 isPostofficeMode() return 阻止 setPendingGenerate(true)。
 * 两层防线确保邮局模式下 LLM 完全不被调用。
 */
function _blockLLMTriggers(): void {
    console.log("[Postoffice] LLM triggers blocked (capture-phase event interception)");
    window.addEventListener(CHAT_REQUEST_REPLY, (e) => {
        e.stopImmediatePropagation();
        console.log("[Postoffice] Blocked chat-request-reply event");
    }, true); // capture phase — runs before ChatRoom's bubble-phase listener
}

if (typeof window !== "undefined" && isPostofficeMode()) {
    _startGlobalPolling();
    _blockLLMTriggers();
}
