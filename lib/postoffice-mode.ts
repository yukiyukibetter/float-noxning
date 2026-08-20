// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式
// 提供消息发送、轮询、模式检测

// ── 模式检测 ──
// Nox♡Ning Edition 默认启用邮局模式
// 可通过 localStorage 覆盖（调试用）
export function isPostofficeMode(): boolean {
    if (typeof window === "undefined") return false;
    const override = localStorage.getItem("float-postoffice-mode");
    if (override === "false") return false;
    if (override === "true") return true;
    return true; // Nox♡Ning Edition 默认启用
}

// ── 发送消息 ──
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

// ── 轮询服务 ──
export type PostofficeMessage = {
    id: string;
    sender: string;
    content: string;
    created_at: string;
};

export type PostofficePollingCallbacks = {
    onNewMessages: (messages: PostofficeMessage[]) => void;
    onError?: (error: Error) => void;
};

const POLL_INTERVAL = 3000; // 3秒

export function startPostofficePolling(
    callbacks: PostofficePollingCallbacks,
): () => void {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
        if (!active) return;
        try {
            const res = await fetch("/api/float-chat");
            if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
            const data = await res.json();
            if (data.messages?.length > 0) {
                callbacks.onNewMessages(data.messages);
            }
        } catch (err) {
            callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
        if (active) {
            timer = setTimeout(poll, POLL_INTERVAL);
        }
    };

    // 首次延迟 1 秒后开始，避免页面加载时的请求拥堵
    timer = setTimeout(poll, 1000);

    // 返回清理函数
    return () => {
        active = false;
        if (timer) clearTimeout(timer);
    };
}
