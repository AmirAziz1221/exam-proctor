// Storage: Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise a local .data folder (local testing only).
import fs from "fs/promises";
import path from "path";

export const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
export const root = path.join(process.cwd(), ".data");
export const clean = (s) => String(s || "x").replace(/[^\w.-]/g, "").slice(0, 120);

export async function saveLocal(rel, data) {
  const f = path.join(root, rel);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, data);
}
export async function readLocalEvents() {
  const dir = path.join(root, "events");
  let files = [];
  try { files = await fs.readdir(dir); } catch { return []; }
  const out = await Promise.all(files.map((n) => fs.readFile(path.join(dir, n), "utf8").then(JSON.parse).catch(() => null)));
  return out.filter(Boolean);
}
