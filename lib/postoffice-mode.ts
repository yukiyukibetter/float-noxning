// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v5.0
// 发送：MutationObserver 捕获用户气泡 → POST /api/float-chat
// 接收：轮询 GET /api/float-chat → 注入正确结构的 assistant 气泡
// 清理：隐藏 LLM sink 产生的错误/✉️ 气泡

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
    wrapper.id = `message-postoffice-${Date.now()}`;

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

    // 滚动到底部
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });

    console.log("[Postoffice] ✔ Injected assistant bubble:", content.slice(0, 50));
    return true;
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

// 匹配需要隐藏的 assistant 气泡内容
const LLM_JUNK_PATTERNS = [
    '出错了...请先在设置',
    '✉️',
    '出错了…请先在设置',
];

function _isJunkBubble(el: HTMLElement): boolean {
    const text = el.textContent?.trim() || '';
    return LLM_JUNK_PATTERNS.some(p => text.includes(p));
}

function _hideJunkBubbles(): void {
    // 隐藏已存在的垃圾气泡
    const assistantMsgs = document.querySelectorAll('[data-role="assistant"]:not([id^="message-postoffice-"])');
    for (const msg of Array.from(assistantMsgs)) {
        if (_isJunkBubble(msg as HTMLElement)) {
            (msg as HTMLElement).style.display = 'none';
        }
    }
}

function _watchAndHideJunkBubbles(): void {
    // 先清理现有的
    _hideJunkBubbles();

    // 监听新增的
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (!(node instanceof HTMLElement)) continue;
                // 跳过我们自己的气泡
                if (node.id?.startsWith('message-postoffice-')) continue;
                // 检查新增的 assistant 气泡
                const assistantMsgs = node.matches?.('[data-role="assistant"]')
                    ? [node]
                    : Array.from(node.querySelectorAll?.('[data-role="assistant"]') || []);
                for (const msg of assistantMsgs) {
                    if ((msg as HTMLElement).id?.startsWith('message-postoffice-')) continue;
                    // 延迟检查，等内容渲染完
                    setTimeout(() => {
                        if (_isJunkBubble(msg as HTMLElement)) {
                            (msg as HTMLElement).style.display = 'none';
                            console.log("[Postoffice] Hidden junk bubble");
                        }
                    }, 100);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ Junk bubble watcher active");
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
    // 等 DOM 加载完再启动清理
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(_watchAndHideJunkBubbles, 500);
        });
    } else {
        setTimeout(_watchAndHideJunkBubbles, 500);
    }
}
