// app/api/float-chat/route.ts
// Float · Nox♡Ning Edition — 邮局消息中转站
// POST: 凝凝发消息 → 写入 float_messages (sender='ning')
// GET:  拉取澈澈的回复 → 读取 float_messages (sender='nox', is_read=false)

import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://qaefaadqtqndchmgtgat.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZWZhYWRxdHFuZGNobWd0Z2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjM2NzEsImV4cCI6MjA4ODg5OTY3MX0.LFCLgMioMb7Je5yVyVLoEfdctzqJrNTfu0vnvfr5Fa4";

function supabaseHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=representation",
    };
}

function supabaseRest(path: string): string {
    return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
}

// POST: 发送消息
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const content = typeof body.content === "string" ? body.content.trim() : "";
        if (!content) {
            return NextResponse.json({ error: "Empty message" }, { status: 400 });
        }
        const res = await fetch(supabaseRest("float_messages"), {
            method: "POST",
            headers: supabaseHeaders(),
            body: JSON.stringify({ sender: "ning", content }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Supabase insert failed: ${res.status} ${text}`);
        }
        const data = await res.json();
        return NextResponse.json({ ok: true, message: data?.[0] ?? null });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// GET: 拉取新消息（sender='nox', is_read=false）
export async function GET() {
    try {
        // 查询未读消息
        const query = "float_messages?sender=eq.nox&is_read=eq.false&order=created_at.asc";
        const res = await fetch(supabaseRest(query), {
            method: "GET",
            headers: { ...supabaseHeaders(), Prefer: "" },
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Supabase query failed: ${res.status} ${text}`);
        }
        const messages = await res.json();

        // 标记已读
        if (Array.isArray(messages) && messages.length > 0) {
            const ids = messages.map((m: { id: string }) => m.id);
            await fetch(supabaseRest(`float_messages?id=in.(${ids.join(",")})`), {
                method: "PATCH",
                headers: supabaseHeaders(),
                body: JSON.stringify({ is_read: true }),
            });
        }

        return NextResponse.json({ messages: messages || [] });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
