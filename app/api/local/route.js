import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { clean, root, saveLocal, useBlob } from "../../../lib/store";
export const dynamic = "force-dynamic";

// Local-only clip storage (used when no Blob token is configured).
export async function POST(req) {
  if (useBlob || process.env.VERCEL) return NextResponse.json({ error: "disabled" }, { status: 403 });
  const name = clean(new URL(req.url).searchParams.get("name"));
  await saveLocal(path.join("clips", name), Buffer.from(await req.arrayBuffer()));
  return NextResponse.json({ url: `/api/local?name=${name}` });
}

export async function GET(req) {
  const name = clean(new URL(req.url).searchParams.get("name"));
  try {
    const buf = await fs.readFile(path.join(root, "clips", name));
    return new Response(buf, { headers: { "content-type": name.endsWith(".mp4") ? "video/mp4" : "video/webm" } });
  } catch { return new NextResponse("not found", { status: 404 }); }
}
