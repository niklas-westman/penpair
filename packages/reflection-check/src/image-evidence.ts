import { createHash } from "node:crypto";
import { readImageEvidence as readCoreImageEvidence } from "@penpair/core";

export function hashImageBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readImageEvidence(
  root: string,
  file: string,
): Promise<{
  bytes: Buffer;
  width: number;
  height: number;
}> {
  const { bytes, width, height } = await readCoreImageEvidence(root, file);
  return {
    bytes,
    width,
    height,
  };
}
