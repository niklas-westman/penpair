import { createHash } from "node:crypto";
import type { PenpotToolClient } from "./client.js";
import { runSnippet, snippet } from "./snippet.js";
import { redactEndpoint } from "./endpoint.js";

export type FileArchive = {
  status: "exported";
  bytes: Buffer;
  fileId: string;
  revn: number;
  sha256: string;
  restoreVerified: false;
} | { status: "unsupported" | "failed" | "too-large" | "changed"; message: string };

/** Full-fidelity recovery is established by import/readback, not by receiving archive bytes. */
export async function exportFileArchive(client: PenpotToolClient, options: { maxBytes?: number } = {}): Promise<FileArchive> {
  const maxBytes = options.maxBytes ?? 512 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 16 * 1024 * 1024) throw new Error("Archive budget must be positive and at most 16 MiB");
  const result = await runSnippet(client, snippet("file-archive", `
const file = penpot.currentFile, fileId = file.id, revn = file.revn;
if (typeof file.export !== "function") return { ok: true, status: "unsupported", message: "File export is unavailable; use Penpot's File export menu" };
let bytes;
try { bytes = await file.export("penpot", "all"); }
catch (error) { return { ok: true, status: "failed", message: "Archive export failed: " + String(error && error.message || error) + ". Use the manual export route." }; }
if (penpot.currentFile.id !== fileId || penpot.currentFile.revn !== revn) return { ok: true, status: "changed", message: "The file changed during export; archive was not accepted" };
if (!bytes || !Number.isSafeInteger(bytes.length) || bytes.length === 0) return { ok: true, status: "failed", message: "File export returned no archive bytes" };
if (bytes.length > CFG.maxBytes) return { ok: true, status: "too-large", message: "Archive exceeds the configured response budget; export it manually" };
let binary = "";
for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
return { ok: true, status: "exported", fileId, revn, length: bytes.length, base64: btoa(binary) };`, { maxBytes }, "read"));
  if (result.status !== "exported") {
    if (!["unsupported", "failed", "too-large", "changed"].includes(String(result.status)) || typeof result.message !== "string") throw new Error("Archive response contained no valid outcome");
    return { status: result.status as "unsupported" | "failed" | "too-large" | "changed", message: redactEndpoint(result.message) };
  }
  if (result.ok !== true || typeof result.fileId !== "string" || !Number.isInteger(result.revn) || typeof result.base64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(result.base64))
    throw new Error("Archive response contained incomplete metadata");
  const bytes = Buffer.from(result.base64, "base64");
  if (bytes.length === 0 || bytes.length > maxBytes || bytes.length !== result.length) throw new Error("Archive response was empty, truncated or over budget");
  return { status: "exported", bytes, fileId: result.fileId, revn: Number(result.revn), sha256: createHash("sha256").update(bytes).digest("hex"), restoreVerified: false };
}
