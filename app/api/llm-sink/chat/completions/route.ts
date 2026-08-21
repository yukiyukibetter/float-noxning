import { NextResponse } from "next/server";

// LLM Sink: 邮局模式下的假 OpenAI 端点
// Float 的 Base URL 指向这里，所有 LLM 请求被安静地吃掉
// v1.1: 改为 SSE 流式响应（兼容 Float 的 stream 模式，避免 JSON 解析弹窗）
// 注意：正常情况下 _patchFetch 会在客户端拦截掉这个请求，
// 这个 route 只作为 fallback（Safari 缓存旧 bundle 时、_patchFetch 未生效时）

export async function POST() {
    // 返回标准的 OpenAI SSE 流式响应
    // 空 content + finish_reason: stop = 静默完成，不产生可见气泡
    const body = [
        `data: {"id":"postoffice-sink","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"postoffice","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}`,
        "",
        `data: {"id":"postoffice-sink","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"postoffice","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
        "",
        "data: [DONE]",
        "",
    ].join("\n");

    return new Response(body, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-store",
            "Connection": "keep-alive",
        },
    });
}

export async function GET() {
    return NextResponse.json({ status: "ok", mode: "postoffice-sink" });
}
