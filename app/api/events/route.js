import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { readLocalEvents, useBlob } from "../../../lib/store";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let evs;
    if (useBlob) {
      const { blobs } = await list({ prefix: "events/", limit: 1000 });
      evs = (await Promise.all(blobs.map((b) =>
        fetch(b.url, { cache: "no-store" }).then((r) => r.json()).catch(() => null)))).filter(Boolean);
    } else evs = await readLocalEvents();
    return NextResponse.json(evs.sort((a, b) => a.start - b.start));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
