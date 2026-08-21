// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v4.1
// 双向 DOM 方案：发送用 MutationObserver 捕获用户气泡，接收用 DOM 注入 assistant 气泡

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

/**
 * 接收方向：将收到的消息注入聊天 DOM
 * 不依赖 chat-room.tsx 的任何代码
 */
function _injectAssistantBubble(content: string): boolean {
    // 找到聊天滚动容器
    const scrollContainer = document.querySelector('.page-body.chat-scroll-anchored') as HTMLElement | null;
    if (!scrollContainer) {
        console.warn("[Postoffice] No chat scroll container found, trying fallback");
        // fallback: 找任何 page-body
        const fallback = document.querySelector('.page-body') as HTMLElement | null;
        if (!fallback) return false;
        return _doInjectBubble(fallback, content);
    }
    return _doInjectBubble(scrollContainer, content);
}

function _doInjectBubble(container: HTMLElement, content: string): boolean {
    // 创建 wrapper (chat-msg-wrapper data-role="assistant")
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-wrapper';
    wrapper.setAttribute('data-role', 'assistant');
    wrapper.id = `message-postoffice-${Date.now()}`;

    // 创建气泡容器
    const bubbleOuter = document.createElement('div');
    bubbleOuter.className = 'flex flex-col min-w-0 max-w-[75%]';

    // 创建气泡本体
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble-role-assistant py-2 px-3 rounded-md break-words';
    
    // 创建文字内容
    const textDiv = document.createElement('div');
    textDiv.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
    textDiv.textContent = content;
    
    bubble.appendChild(textDiv);
    bubbleOuter.appendChild(bubble);
    wrapper.appendChild(bubbleOuter);
    container.appendChild(wrapper);
    
    // 滚动到底部
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });
    
    console.log("[Postoffice] ✔ Injected assistant bubble:", content.slice(0, 50));
    return true;
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
                for (const msg of data.messages) {
                    // 尝试直接注入 DOM
                    const injected = _injectAssistantBubble(msg.content);
                    if (!injected) {
                        // 如果聊天室没打开，存入 pending
                        _state().pending.push(msg);
                    }
                }
                // 同时派发事件（以防 chat-room.tsx 的 useEffect 偶尔能工作）
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
 * 发送方向：MutationObserver 监听 DOM
 * 用户消息气泡出现在 DOM 时，提取文字内容发到邮局
 */
function _watchDOMForUserMessages(): void {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (!(node instanceof HTMLElement)) continue;
                // 跳过我们自己注入的 postoffice 气泡
                if (node.id?.startsWith('message-postoffice-')) continue;
                // 查找 data-role="user" 的消息 wrapper
                const userMsgs = node.matches?.('[data-role="user"]')
                    ? [node]
                    : Array.from(node.querySelectorAll?.('[data-role="user"]') || []);
                for (const msgEl of userMsgs) {
                    if ((msgEl as HTMLElement).id?.startsWith('message-postoffice-')) continue;
                    const bubble = (msgEl as HTMLElement).querySelector?.('.chat-bubble-role-user, [class*="bubble"]');
                    const textEl = bubble || msgEl;
                    const text = (textEl as HTMLElement).textContent?.trim();
                    if (!text) continue;
                    const state = _state();
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
    console.log("[Postoffice] ✔ DOM MutationObserver active");
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
