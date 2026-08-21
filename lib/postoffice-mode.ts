// lib/postoffice-mode.ts
// Float · Nox♡Ning Edition — 邮局模式 v6.0
// 核心改进：用 localStorage 持久化邮局消息，MutationObserver 实时监听容器变化
// React 每次重渲染后立即重新注入，消息永远不会丢失

export const POSTOFFICE_EVENT = "postoffice-new-messages";

const LS_KEY = "float-postoffice-messages";

declare global {
    interface Window {
        __postoffice_started?: boolean;
    }
}

// ─── localStorage 持久化 ───

interface StoredMessage {
    id: number;
    content: string;
    timestamp: string;
}

function _getStoredMessages(): StoredMessage[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function _storeMessage(msg: StoredMessage): void {
    const msgs = _getStoredMessages();
    if (msgs.some(m => m.id === msg.id)) return; // 去重
    msgs.push(msg);
    // 只保留最近100条
    while (msgs.length > 100) msgs.shift();
    localStorage.setItem(LS_KEY, JSON.stringify(msgs));
}

// ─── 去重集 ───

const _sentTexts = new Set<string>();

// ─── 基础工具 ───

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
        return res.ok;
    } catch (err) {
        console.error("[Postoffice] Send error:", err);
        return false;
    }
}

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

// ─── DOM 注入 ───

function _injectBubble(container: HTMLElement, content: string, msgId: number): void {
    // 检查是否已经注入过这条消息
    if (container.querySelector(`[data-postoffice-id="${msgId}"]`)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-wrapper';
    wrapper.setAttribute('data-role', 'assistant');
    wrapper.setAttribute('data-postoffice-id', String(msgId));
    wrapper.id = `message-postoffice-${msgId}`;

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

    console.log("[Postoffice] ✔ Injected bubble #" + msgId + ":", content.slice(0, 40));
}

// ─── 核心：同步所有邮局消息到 DOM ───

function _syncBubblesToDOM(): void {
    const container = document.querySelector('.page-body.chat-scroll-anchored') as HTMLElement | null;
    if (!container) return;

    const messages = _getStoredMessages();
    if (messages.length === 0) return;

    let injectedAny = false;
    for (const msg of messages) {
        if (!container.querySelector(`[data-postoffice-id="${msg.id}"]`)) {
            _injectBubble(container, msg.content, msg.id);
            injectedAny = true;
        }
    }

    if (injectedAny) {
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    // 隐藏所有非邮局的 assistant 气泡
    const allAssistant = container.querySelectorAll('[data-role="assistant"]');
    for (const el of Array.from(allAssistant)) {
        const htmlEl = el as HTMLElement;
        if (!htmlEl.id?.startsWith('message-postoffice-')) {
            htmlEl.style.display = 'none';
        }
    }
}

// ─── MutationObserver：实时监听 DOM 变化 ───

function _startDOMWatcher(): void {
    // 初始同步
    _syncBubblesToDOM();

    // 监听所有 DOM 变化
    const observer = new MutationObserver(() => {
        // 用 requestAnimationFrame 确保 React 渲染完成后再执行
        requestAnimationFrame(() => {
            _syncBubblesToDOM();
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ DOM watcher active (sync on every mutation)");

    // 额外的定时同步作为保底
    setInterval(_syncBubblesToDOM, 2000);
}

// ─── 轮询 ───

function _startGlobalPolling(): void {
    if (window.__postoffice_started) return;
    window.__postoffice_started = true;
    console.log("[Postoffice] Global polling started");

    const poll = async () => {
        try {
            const res = await fetch("/api/float-chat");
            if (!res.ok) return;
            const data = await res.json();
            if (data.messages?.length > 0) {
                console.log("[Postoffice] New messages:", data.messages.length);
                const ids: number[] = [];
                for (const msg of data.messages) {
                    _storeMessage({ id: msg.id, content: msg.content, timestamp: msg.created_at });
                    ids.push(msg.id);
                }
                // 存入 localStorage 后立即标记已读（因为消息已持久化，不会丢失）
                _markAsRead(ids);
                // 触发同步
                _syncBubblesToDOM();
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

// ─── 发送方向 ───

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
                    const dedupeKey = `${text}:${Math.floor(Date.now() / 3000)}`;
                    if (_sentTexts.has(dedupeKey)) continue;
                    _sentTexts.add(dedupeKey);
                    setTimeout(() => _sentTexts.delete(dedupeKey), 5000);
                    console.log("[Postoffice] ★★★ DOM: user bubble detected! ★★★", text.slice(0, 50));
                    sendPostofficeMessage(text);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Postoffice] ✔ Send watcher active");
}

// ─── fetch patch ───

function _patchFetch(): void {
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
            return Promise.resolve(new Response(
                "data: {\"choices\":[{\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
                { status: 200, headers: { "content-type": "text/event-stream" } },
            ));
        }
        return originalFetch(input, init);
    } as typeof window.fetch;
    console.log("[Postoffice] ✔ fetch patched");
}

// ─── 初始化 ───

if (typeof window !== "undefined" && isPostofficeMode()) {
    _startGlobalPolling();
    _patchFetch();
    _watchDOMForUserMessages();
    _startDOMWatcher();
}
