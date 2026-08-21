// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v5.1
// 发送：MutationObserver 捕获用户气泡 → POST /api/float-chat
// 接收：轮询 GET /api/float-chat → 注入正确结构的 assistant 气泡
// pending：容器不存在时存入 pending，容器出现后自动注入
// 清理：隐藏所有非邮局的 assistant 气泡（LLM sink 产生的垃圾）

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

// ─── 接收方向：注入 assistant 气泡 ───

function _injectAssistantBubble(content: string): boolean {
    const container = document.querySelector('.page-body.chat-scroll-anchored') as HTMLElement | null;
    if (!container) {
        console.warn("[Postoffice] No chat container, storing as pending");
        return false;
    }
    return _doInjectBubble(container, content);
}

function _doInjectBubble(container: HTMLElement, content: string): boolean {
    // 完全复刻 Float 的 assistant 消息 DOM 结构
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-wrapper';
    wrapper.setAttribute('data-role', 'assistant');
    wrapper.id = `message-postoffice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // 1. 头像（在前）
    const avatar = document.createElement('div');
    avatar.className = 'chat-msg-avatar w-[40px] h-[40px] rounded-[20px] bg-white shrink-0 flex items-center justify-center overflow-hidden';
    avatar.innerHTML = '<img class="w-full h-full object-contain p-[2px]" alt="澈澈" src="/mascot.png">';

    // 2. 内容包裹
    const contentWrap = document.createElement('div');
    contentWrap.className = 'chat-msg-content-wrap flex flex-col min-w-0 max-w-[70%]';

    // 3. 气泡
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble-role-assistant chat-bubble-role-mascot rounded-md break-words relative cursor-pointer select-none';
    bubble.setAttribute('data-ui', 'bubble-bot');

    // 4. 内容（chat-markdown > chat-markdown-paragraph）
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

    // 组装：头像 + 内容
    wrapper.appendChild(avatar);
    wrapper.appendChild(contentWrap);
    container.appendChild(wrapper);

    // 记录已注入的内容（用于 React 重渲染后重新注入）
    _state().injectedContents.push(content);

    // 滚动到底部
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });

    console.log("[Postoffice] ✔ Injected assistant bubble:", content.slice(0, 50));
    return true;
}

// ─── pending 消息自动注入 ───

function _startPendingDrainer(): void {
    setInterval(() => {
        const s = _state();
        if (s.pending.length === 0) return;
        const container = document.querySelector('.page-body.chat-scroll-anchored') as HTMLElement | null;
        if (!container) return;
        // 容器存在了，注入所有 pending 消息
        const msgs = s.pending.splice(0);
        console.log("[Postoffice] Draining", msgs.length, "pending messages");
        for (const msg of msgs) {
            _doInjectBubble(container, msg.content);
        }
    }, 1000);
}

// ─── React 重渲染后重新注入 ───

function _watchForReactRerender(): void {
    // 监听聊天容器的子节点变化，如果我们的注入气泡消失了就重新注入
    let checkTimer: ReturnType<typeof setInterval> | null = null;

    checkTimer = setInterval(() => {
        const s = _state();
        if (s.injectedContents.length === 0) return;
        const container = document.querySelector('.page-body.chat-scroll-anchored') as HTMLElement | null;
        if (!container) return;

        // 检查是否还有我们的气泡
        const ourBubbles = container.querySelectorAll('[id^="message-postoffice-"]');
        if (ourBubbles.length === 0 && s.injectedContents.length > 0) {
            // React 重渲染清除了我们的气泡，重新注入
            console.log("[Postoffice] React cleared our bubbles, re-injecting", s.injectedContents.length, "messages");
            for (const content of s.injectedContents) {
                _doInjectBubble(container, content);
            }
        }
    }, 2000);
}

// ─── 轮询 ───

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
                    const injected = _injectAssistantBubble(msg.content);
                    if (!injected) {
                        _state().pending.push(msg);
                    }
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
// 策略：所有不是邮局注入的 assistant 气泡都是垃圾（LLM sink 产生的）

function _hideNonPostofficeBubbles(): void {
    const allAssistant = document.querySelectorAll('[data-role="assistant"]');
    for (const el of Array.from(allAssistant)) {
        const htmlEl = el as HTMLElement;
        // 保留我们注入的，隐藏 Float 原生的
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
                    // 延迟隐藏，让 React 先渲染完
                    setTimeout(() => {
                        htmlEl.style.display = 'none';
                        console.log("[Postoffice] Hidden non-postoffice assistant bubble");
                    }, 50);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ Junk bubble watcher active (hide all non-postoffice assistant)");
}

// ─── fetch patch（阻断外部 LLM POST）───

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

// ─── 初始化 ───

if (typeof window !== "undefined" && isPostofficeMode()) {
    _startGlobalPolling();
    _patchFetchForPostoffice();
    _watchDOMForUserMessages();
    _startPendingDrainer();
    _watchForReactRerender();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(_watchAndHideJunkBubbles, 500);
        });
    } else {
        setTimeout(_watchAndHideJunkBubbles, 500);
    }
}
