import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { resolveProjectInput } from "./project-input.js";
import { maxSkillBytes } from "./skill-metadata.js";

/** Read only bounded regular files inside the explicitly selected project. */
export async function readSkillFile(root: string, relative: string): Promise<string> {
  const resolved = await resolveProjectInput(root, relative);
  const handle = await open(
    resolved,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  );

  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxSkillBytes) {
      throw new Error("Skill input must be a regular file within the 128 KB limit");
    }

    const buffer = Buffer.alloc(maxSkillBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) {
        break;
      }
      length += bytesRead;
    }
    if (length > maxSkillBytes) {
      throw new Error("Skill input exceeds the 128 KB limit");
    }

    return buffer.subarray(0, length).toString("utf8");
  } finally {
    await handle.close();
  }
}
