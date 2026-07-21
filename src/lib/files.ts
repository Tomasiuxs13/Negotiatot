import "server-only";
import fs from "fs";
import path from "path";

const filesDir = path.join(process.cwd(), "data", "files");

/** Stores an uploaded file on disk and returns its path relative to data/files. */
export function saveFile(subdir: string, originalName: string, buffer: Buffer): string {
  const dir = path.join(filesDir, subdir);
  fs.mkdirSync(dir, { recursive: true });

  const safeName = path
    .basename(originalName)
    .replace(/[^\w.\-]+/g, "_")
    .slice(-80);
  const relative = path.join(subdir, `${Date.now()}-${safeName}`);
  fs.writeFileSync(path.join(filesDir, relative), buffer);
  return relative;
}

export function readFile(relativePath: string): Buffer {
  const full = path.join(filesDir, relativePath);
  if (!full.startsWith(filesDir)) throw new Error("Invalid file path");
  return fs.readFileSync(full);
}

export function deleteFile(relativePath: string) {
  const full = path.join(filesDir, relativePath);
  if (!full.startsWith(filesDir)) return;
  if (fs.existsSync(full)) fs.unlinkSync(full);
}
