import { NextResponse } from "next/server";

// LLM Sink: 邮局模式下的假 OpenAI 端点
// Float 的 Base URL 指向这里，所有 LLM 请求被安静地吃掉
export async function POST() {
    return NextResponse.json({
        id: "postoffice-sink",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "postoffice",
        choices: [{
            index: 0,
            message: {
                role: "assistant",
                content: "✉️",
            },
            finish_reason: "stop",
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
}

export async function GET() {
    return NextResponse.json({ status: "ok", mode: "postoffice-sink" });
}
