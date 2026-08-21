// app/api/float-chat/route.ts
// Float · Nox♡Ning Edition — 邮局消息中转站
// POST: 凝凝发消息 → 写入 float_messages (sender='ning')
// GET:  拉取最近100条所有消息（nox+ning），客户端localStorage去重

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

// GET: 拉取最近100条所有消息（nox+ning），客户端自行去重
export async function GET() {
    try {
        const query = "float_messages?order=created_at.desc&limit=100";
        const res = await fetch(supabaseRest(query), {
            method: "GET",
            headers: { ...supabaseHeaders(), Prefer: "" },
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Supabase query failed: ${res.status} ${text}`);
        }
        const messages = await res.json();
        return NextResponse.json({ messages: messages || [] });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
