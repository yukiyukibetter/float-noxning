// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v5.2
// 改进：GET 不再自动标记已读，注入成功后才 PATCH 标记
// 这样即使页面刷新丢失 pending，下次轮询还能拉到同样的消息

export const POSTOFFICE_EVENT = "postoffice-new-messages";

declare global {
    interface Window {
        __postoffice?: {
            started: boolean;
            pending: any[];
            sentTexts: Set<string>;
            injectedContents: string[];
        };
    }
}

function _state() {
    if (typeof window === "undefined") return { started: false, pending: [] as any[], sentTexts: new Set<string>(), injectedContents: [] as string[] };
    if (!window.__postoffice) window.__postoffice = { started: false, pending: [], sentTexts: new Set<string>(), injectedContents: [] };
    if (!window.__postoffice.sentTexts) window.__postoffice.sentTexts = new Set<string>();
    if (!window.__postoffice.injectedContents) window.__postoffice.injectedContents = [];
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

// ─── 标记已读（注入成功后调用）───

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

// ─── 接收方向：注入 assistant 气泡 ───

function _injectAssistantBubble(content: string): boolean {
    const container = document.querySelector('.page-body.chat-scroll-anchored') as HTMLElement | null;
    if (!container) {
        console.warn("[Postoffice] No chat container");
        return false;
    }
    return _doInjectBubble(container, content);
}

function _doInjectBubble(container: HTMLElement, content: string): boolean {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-wrapper';
    wrapper.setAttribute('data-role', 'assistant');
    wrapper.id = `message-postoffice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-msg-avatar w-[40px] h-[40px] rounded-[20px] bg-white shrink-0 flex items-center justify-center overflow-hidden';
    avatar.innerHTML = '<img class="w-full h-full object-contain p-[2px]" alt="澈澈" src="/mascot.png">';

    const contentWrap = document.createElement('div');
    contentWrap.className = 'chat-msg-content-wrap flex flex-col min-w-0 max-w-[70%]';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble-role-assistant chat-bubble-role-mascot rounded-md break-words relative cursor-pointer select-none';
    bubble.setAttribute('data-ui', 'bubble-bot');

    const innerDiv = document.createElement('div');
    const markdown = document.createElement('div');
    markdown.className = 'chat-markdown hide-scrollbar break-words';
    const paragraph = document.createElement('div');
    paragraph.className = 'chat-markdown-paragraph';
    paragraph.textContent = content;

    markdown.appendChild(paragraph);
    innerDiv.appendChild(markdown);
    bubble.appendChild(innerDiv);
    contentWrap.appendChild(bubble);

    wrapper.appendChild(avatar);
    wrapper.appendChild(contentWrap);
    container.appendChild(wrapper);

    _state().injectedContents.push(content);

    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });

    console.log("[Postoffice] ✔ Injected assistant bubble:", content.slice(0, 50));
    return true;
}

// ─── 轮询（拉取 → 尝试注入 → 成功后标记已读）───

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
                const successIds: number[] = [];
                for (const msg of data.messages) {
                    const injected = _injectAssistantBubble(msg.content);
                    if (injected) {
                        successIds.push(msg.id);
                    }
                    // 不再存 pending——因为没标记已读，下次轮询还会拉到
                }
                // 只标记成功注入的为已读
                if (successIds.length > 0) {
                    _markAsRead(successIds);
                }
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

// ─── 发送方向：MutationObserver 捕获用户气泡 ───

function _watchDOMForUserMessages(): void {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (!(node instanceof HTMLElement)) continue;
                if (node.id?.startsWith('message-postoffice-')) continue;
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

// ─── 清理 LLM sink 产生的垃圾气泡 ───

function _hideNonPostofficeBubbles(): void {
    const allAssistant = document.querySelectorAll('[data-role="assistant"]');
    for (const el of Array.from(allAssistant)) {
        const htmlEl = el as HTMLElement;
        if (!htmlEl.id?.startsWith('message-postoffice-')) {
            htmlEl.style.display = 'none';
        }
    }
}

function _watchAndHideJunkBubbles(): void {
    _hideNonPostofficeBubbles();

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (!(node instanceof HTMLElement)) continue;
                if (node.id?.startsWith('message-postoffice-')) continue;
                const assistantMsgs = node.matches?.('[data-role="assistant"]')
                    ? [node]
                    : Array.from(node.querySelectorAll?.('[data-role="assistant"]') || []);
                for (const msg of assistantMsgs) {
                    const htmlEl = msg as HTMLElement;
                    if (htmlEl.id?.startsWith('message-postoffice-')) continue;
                    setTimeout(() => {
                        htmlEl.style.display = 'none';
                        console.log("[Postoffice] Hidden non-postoffice assistant bubble");
                    }, 50);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ Junk bubble watcher active");
}

// ─── React 重渲染后重新注入 ───

function _watchForReactRerender(): void {
    setInterval(() => {
        const s = _state();
        if (s.injectedContents.length === 0) return;
        const container = document.querySelector('.page-body.chat-scroll-anchored') as HTMLElement | null;
        if (!container) return;
        const ourBubbles = container.querySelectorAll('[id^="message-postoffice-"]');
        if (ourBubbles.length === 0 && s.injectedContents.length > 0) {
            console.log("[Postoffice] React cleared our bubbles, re-injecting", s.injectedContents.length);
            for (const content of s.injectedContents) {
                _doInjectBubble(container, content);
            }
        }
    }, 2000);
}

// ─── fetch patch ───

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
                    headers: { "content-type": "text/event-stream" },
                },
            ));
        }

        return originalFetch(input, init);
    } as typeof window.fetch;
    console.log("[Postoffice] ✔ window.fetch patched");
}

// ─── 初始化 ───

if (typeof window !== "undefined" && isPostofficeMode()) {
    _startGlobalPolling();
    _patchFetchForPostoffice();
    _watchDOMForUserMessages();
    _watchForReactRerender();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(_watchAndHideJunkBubbles, 500);
        });
    } else {
        setTimeout(_watchAndHideJunkBubbles, 500);
    }
}
