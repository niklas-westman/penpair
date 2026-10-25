import { createHash } from "node:crypto";
import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../atomic-output.js";
import { readProjectBytes } from "../bounded-file.js";
import type { ReleaseArtifactRef } from "./types.js";

export const maximumArtifactBytes = 16 * 1024 * 1024;

export function hashBytes(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function artifactPath(
  root: string,
  relative: string,
  createParents = false,
): Promise<string> {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.length > 1024 ||
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    relative.includes("\0") ||
    relative.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(
      "Release artifact path must be a bounded project-relative path without traversal",
    );
  }
  let current = await realpath(root);
  const segments = relative.split("/");
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const parent = index < segments.length - 1;
    try {
      if (parent && createParents) {
        await mkdir(current, {
          recursive: false,
        }).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") {
            throw error;
          }
        });
      }
      const info = await lstat(current);
      if (info.isSymbolicLink() || (parent ? !info.isDirectory() : !info.isFile())) {
        throw new Error("Release artifact paths must use real directories and regular files");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || (parent && createParents)) {
        throw error;
      }
      if (parent && !createParents) {
        return path.join(current, ...segments.slice(index + 1));
      }
    }
  }
  return current;
}

export async function readArtifact(
  root: string,
  reference: ReleaseArtifactRef,
  maximum = maximumArtifactBytes,
): Promise<Buffer> {
  await artifactPath(root, reference.path);
  const bytes = await readProjectBytes(root, reference.path, maximum);
  if (bytes.length > maximum || hashBytes(bytes) !== reference.sha256) {
    throw new Error(`Release artifact hash mismatch: ${reference.path}`);
  }
  return bytes;
}

export async function saveArtifact(
  root: string,
  relative: string,
  bytes: string | Uint8Array,
  redact?: (text: string) => string,
): Promise<ReleaseArtifactRef> {
  const text = typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8");
  if (redact && redact(text) !== text) {
    throw new Error("Release evidence contains protected data and cannot be persisted");
  }
  const destination = await artifactPath(root, relative, true);
  const sha256 = hashBytes(bytes);
  try {
    await atomicWriteFile(destination, bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    const actual = await readProjectBytes(root, relative, Math.max(bytes.length, 1));
    if (hashBytes(actual) !== sha256) {
      throw new Error("Immutable release artifact already exists with different bytes");
    }
  }
  return {
    path: relative,
    sha256,
  };
}
