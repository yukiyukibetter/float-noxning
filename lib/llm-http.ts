// lib/llm-http.ts
// LLM 请求的统一 fetch 出口。所有走 buildProviderRequest 的调用点统一经它发请求：
//  - 普通 provider：浏览器直连（现状不变）；
//  - serverProxy 标记（OpenCode 网关）：改发本站 /api/llm-proxy，由服务端转发，
//    绕过 opencode.ai 未开放浏览器 CORS 的问题。
// Nox♡Ning: 邮局模式下全部 LLM 请求被拦截，返回空回复。

import type { LlmRequestPayload } from "./llm-provider-adapter";

export type FetchLlmPayloadOptions = {
    signal?: AbortSignal;
};

/**
 * 邮局模式检查：直接读 localStorage，避免循环依赖 postoffice-mode.ts
 */
function _isPostofficeMode(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("float-postoffice-mode") !== "false";
}

export function fetchLlmPayload(
    payload: LlmRequestPayload,
    options: FetchLlmPayloadOptions = {},
): Promise<Response> {
    // —— Nox♡Ning 邮局模式：拦截所有 LLM 请求 ——
    if (_isPostofficeMode()) {
        console.log("[Postoffice] LLM request blocked by llm-http guard");
        // 返回一个空的流式响应，让 chat-engine 的流式解析器认为生成已完成（不产生任何文本）
        return Promise.resolve(new Response(
            new ReadableStream({
                start(controller) { controller.close(); }
            }),
            { status: 200, headers: { "content-type": "text/event-stream" } }
        ));
    }

    const bodyText = JSON.stringify(payload.body);
    if (payload.serverProxy) {
        return fetch("/api/llm-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: payload.url,
                headers: payload.headers,
                body: bodyText,
            }),
            signal: options.signal,
        });
    }
    return fetch(payload.url, {
        method: "POST",
        headers: payload.headers,
        body: bodyText,
        signal: options.signal,
    });
}
