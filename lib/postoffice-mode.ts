// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式
// 全局轮询 + 事件广播，不依赖 React 生命周期

export const POSTOFFICE_EVENT = "postoffice-new-messages";

export function isPostofficeMode(): boolean {
    if (typeof window === "undefined") return false;
    const override = localStorage.getItem("float-postoffice-mode");
    if (override === "false") return false;
    return true;
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

// ── 全局轮询（module 级别自启动）──
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
                window.dispatchEvent(
                    new CustomEvent(POSTOFFICE_EVENT, { detail: { messages: data.messages } }),
                );
            }
        } catch (err) {
            console.warn("[Postoffice] Poll error:", err);
        }
    };

    // 首次 1 秒后开始，之后每 3 秒
    setTimeout(poll, 1000);
    setInterval(poll, 3000);
}

// 浏览器环境下自动启动
if (typeof window !== "undefined" && isPostofficeMode()) {
    _startGlobalPolling();
}
