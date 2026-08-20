import { NextResponse } from "next/server";

// LLM Sink: models endpoint
export async function GET() {
    return NextResponse.json({
        object: "list",
        data: [{ id: "postoffice", object: "model", owned_by: "noxning" }],
    });
}
