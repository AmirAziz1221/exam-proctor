import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { clean, saveLocal, useBlob } from "../../../lib/store";

export async function POST(req) {
  try {
    const e = await req.json();
    const rel = `events/${clean(e.sessionId)}-${clean(e.id)}.json`;
    if (useBlob) await put(rel, JSON.stringify(e), { access: "public", contentType: "application/json", addRandomSuffix: true });
    else await saveLocal(rel, JSON.stringify(e));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
