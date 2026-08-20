// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式
// 全局轮询 + 消息缓存 + 事件广播

export const POSTOFFICE_EVENT = "postoffice-new-messages";

export function isPostofficeMode(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("float-postoffice-mode") !== "false";
}

export async function sendPostofficeMessage(content: string): Promise<boolean> {
    try {
        const res = await fetch("/api/float-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ── 消息缓存 ──
const _pendingMessages: any[] = [];

export function drainPendingMessages(): any[] {
    return _pendingMessages.splice(0);
}

// ── 全局轮询 ──
let _started = false;

function _startGlobalPolling(): void {
    if (_started) return;
    _started = true;
    console.log("[Postoffice] Global polling started");

    const poll = async () => {
        try {
            const res = await fetch("/api/float-chat");
            if (!res.ok) return;
            const data = await res.json();
            if (data.messages?.length > 0) {
                console.log("[Postoffice] New messages:", data.messages.length);
                _pendingMessages.push(...data.messages);
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

if (typeof window !== "undefined" && isPostofficeMode()) {
    _startGlobalPolling();
}
