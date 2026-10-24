import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolveProjectInput } from "./project-input.js";

/** Read a regular project file with an allocation bound even if another process grows it. */
export async function readProjectBytes(
  root: string,
  file: string,
  maxBytes: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("A positive file byte budget is required");
  }
  const input = await resolveProjectInput(root, file);
  if (!(await lstat(input)).isFile()) {
    throw new Error("Artifact input must be a regular file");
  }
  const handle = await open(
    input,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) {
      throw new Error("Artifact input is not a regular file within its byte budget");
    }
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maxBytes) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total);
      if (bytesRead === 0) {
        return Buffer.concat(chunks, total);
      }
      total += bytesRead;
      if (total > maxBytes) {
        throw new Error("Artifact input exceeds its byte budget");
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    throw new Error("Artifact input exceeds its byte budget");
  } finally {
    await handle.close();
  }
}
