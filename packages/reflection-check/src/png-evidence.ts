import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolveProjectInput } from "@penpair/core";

export function hashPngBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readPngEvidence(
  root: string,
  file: string,
): Promise<{
  bytes: Buffer;
  width: number;
  height: number;
}> {
  const input = await resolveProjectInput(root, file);
  if ((await stat(input)).size > 64 * 1024 * 1024) {
    throw new Error("Image exceeds 64 MiB");
  }
  const bytes = await readFile(input);
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.subarray(12, 16).toString() !== "IHDR"
  ) {
    throw new Error("Provider evidence must reference PNG bytes");
  }
  return {
    bytes,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}
