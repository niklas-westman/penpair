import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "./atomic-output.js";
import type { CaptureIdentity, ExportResult } from "./export.js";
import { observationHash } from "./journal.js";
import { resolveProjectInput, resolveProjectOutput } from "./project-input.js";
import { validateBaselineCase, type BaselineCase } from "./baselines-config.js";
import { pngSize } from "./png.js";

export interface ApprovalRecord {
  schemaVersion: 1;
  id: string;
  kind: "owner-words";
  recordedAt: string;
  by: string;
  note: string;
  capture: CaptureIdentity;
  case?: BaselineCase;
  sha256: string;
  image: string;
  fingerprint: string;
  hash: string;
}
export interface ApprovalFile {
  schemaVersion: 1;
  kind: "design-approvals";
  records: ApprovalRecord[];
}
export const approvalFile = "design/approvals.json";
export const artifactSha = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");
export function approvalFingerprint(
  capture: CaptureIdentity,
  sha256: string,
  intent?: BaselineCase,
): string {
  if (
    !capture ||
    typeof capture.fileId !== "string" ||
    !capture.fileId ||
    typeof capture.pageId !== "string" ||
    !capture.pageId ||
    typeof capture.frameId !== "string" ||
    !capture.frameId ||
    !Number.isInteger(capture.revision) ||
    !Number.isFinite(capture.scale) ||
    capture.scale <= 0 ||
    !/^[a-f0-9]{64}$/.test(sha256)
  ) {
    throw new Error("Approval requires exact capture identity, revision, scale and SHA-256");
  }
  if (intent) {
    validateBaselineCase(intent, (message) => {
      throw new Error(message);
    });
  }
  return observationHash({
    capture,
    sha256,
    case: intent ?? null,
  });
}
export function validateApprovals(raw: unknown): ApprovalFile {
  const v = raw as ApprovalFile;
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.kind !== "design-approvals" ||
    !Array.isArray(v.records) ||
    v.records.length > 10000
  ) {
    throw new Error("Unsupported approval document");
  }
  const ids = new Set<string>();
  for (const r of v.records) {
    if (
      !r ||
      r.schemaVersion !== 1 ||
      r.kind !== "owner-words" ||
      typeof r.id !== "string" ||
      !r.id ||
      ids.has(r.id) ||
      typeof r.note !== "string" ||
      !r.note.trim() ||
      r.note.length > 4000 ||
      typeof r.by !== "string" ||
      !r.by.trim() ||
      r.by.length > 200 ||
      !Number.isFinite(Date.parse(r.recordedAt)) ||
      typeof r.image !== "string" ||
      !r.image
    ) {
      throw new Error("Malformed owner approval record");
    }
    ids.add(r.id);
    const { hash, ...body } = r;
    if (
      hash !== observationHash(body) ||
      r.fingerprint !== approvalFingerprint(r.capture, r.sha256, r.case)
    ) {
      throw new Error("Approval evidence hash mismatch");
    }
  }
  return v;
}
export async function readApprovals(root: string): Promise<ApprovalFile> {
  try {
    const file = await resolveProjectInput(root, approvalFile);
    if ((await stat(file)).size > 16 * 1024 * 1024) {
      throw new Error("Approval file exceeds 16 MiB");
    }
    return validateApprovals(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        schemaVersion: 1,
        kind: "design-approvals",
        records: [],
      };
    }
    throw error;
  }
}
/** Records supplied owner words; hashes detect accidental changes, not identity or consent. */
export async function recordApproval(
  root: string,
  exported: ExportResult,
  words: {
    note: string;
    by: string;
  },
  intent?: BaselineCase,
  redact?: (text: string) => string,
): Promise<ApprovalRecord> {
  exported = {
    ...exported,
    capture: structuredClone(exported.capture),
    png: Buffer.from(exported.png),
  };
  intent = intent ? structuredClone(intent) : undefined;
  words = {
    ...words,
  };
  if (!exported.stable || !pngSize(exported.png)) {
    throw new Error("Approval requires a stable independently exported PNG");
  }
  if (
    typeof words.note !== "string" ||
    !words.note.trim() ||
    words.note.length > 4000 ||
    typeof words.by !== "string" ||
    !words.by.trim() ||
    words.by.length > 200
  ) {
    throw new Error(
      "Supply the owner's exact nonempty words and identity; an agent cannot invent approval",
    );
  }
  const sha256 = artifactSha(exported.png);
  const fingerprint = approvalFingerprint(exported.capture, sha256, intent);
  if (
    intent &&
    (!exported.capture.designSize ||
      exported.capture.designSize.width !== intent.viewport.width ||
      exported.capture.designSize.height !== intent.viewport.height ||
      (intent.activeThemeIds &&
        observationHash(
          [
            ...(exported.capture.activeThemeIds ?? []),
          ].sort(),
        ) !==
          observationHash(
            [
              ...intent.activeThemeIds,
            ].sort(),
          )))
  ) {
    throw new Error("Approval case assertions do not match observed capture");
  }
  const body = {
    schemaVersion: 1 as const,
    id: randomUUID(),
    kind: "owner-words" as const,
    recordedAt: new Date().toISOString(),
    by: words.by,
    note: words.note,
    capture: exported.capture,
    ...(intent
      ? {
          case: intent,
        }
      : {}),
    sha256,
    image: `design/approvals/${sha256}.png`,
    fingerprint,
  };
  const record = {
    ...body,
    hash: observationHash(body),
  };
  const serialized = JSON.stringify(record);
  if (redact && redact(serialized) !== serialized) {
    throw new Error("Approval requires credential redaction; no record was written");
  }
  const file = await resolveProjectOutput(root, approvalFile);
  await mkdir(path.dirname(file), {
    recursive: true,
  });
  const lock = await open(file + ".lock", "wx", 0o600);
  try {
    const previous = await readApprovals(root);
    if (previous.records.length >= 10000) {
      throw new Error("Approval document record limit reached");
    }
    const image = await resolveProjectOutput(root, record.image);
    await mkdir(path.dirname(image), {
      recursive: true,
    });
    try {
      await atomicWriteFile(image, exported.png);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        artifactSha(await readFile(image)) !== sha256
      ) {
        throw error;
      }
    }
    const next =
      JSON.stringify(
        {
          ...previous,
          records: [
            ...previous.records,
            record,
          ],
        },
        null,
        2,
      ) + "\n";
    if (Buffer.byteLength(next) > 16 * 1024 * 1024) {
      throw new Error("Approval document byte limit reached");
    }
    await atomicWriteFile(file, next, {
      replace: true,
    });
    return record;
  } finally {
    await lock.close();
    await unlink(file + ".lock");
  }
}
export async function matchingApproval(
  root: string,
  capture: CaptureIdentity,
  sha256: string,
  intent?: BaselineCase,
): Promise<ApprovalRecord | undefined> {
  const fingerprint = approvalFingerprint(capture, sha256, intent);
  const record = [
    ...(await readApprovals(root)).records,
  ]
    .reverse()
    .find((r) => r.fingerprint === fingerprint);
  if (!record) {
    return undefined;
  }
  const image = await resolveProjectInput(root, record.image);
  if (
    (await stat(image)).size > 64 * 1024 * 1024 ||
    artifactSha(await readFile(image)) !== sha256
  ) {
    throw new Error("Approved image bytes changed");
  }
  return record;
}
