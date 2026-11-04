import {
  approvalFingerprint,
  artifactSha,
  recordApproval,
  type ApprovalRecord,
} from "./approvals.js";
import { resolveApprovalTarget } from "./approve-target.js";
import type { CapturePolicyName } from "./capture-policy.js";
import type { PenpotToolClient } from "./client.js";
import type { CaptureIdentity } from "./export.js";
import { encodeBaselineImage } from "./image-codec.js";
import type { BaselineImageFormat } from "./image-evidence.js";
import type { ProjectConfig } from "./instance/config.js";
import type { OperationOptions } from "./operation.js";
import { renderFrames } from "./render-service.js";

export interface ApproveBatchEntry {
  frame: string;
  caseId?: string;
}

export interface ApproveBatchCandidate {
  frame: string;
  capture: CaptureIdentity;
  sha256: string;
  imageFormat: BaselineImageFormat;
  fingerprint: string;
  recorded: boolean;
  recordId?: string;
}

export interface ApproveBatchReport {
  schemaVersion: 1;
  kind: "approval-batch";
  /** True only when every frame was recorded; a preview is never recorded. */
  recorded: boolean;
  complete: boolean;
  candidates: ApproveBatchCandidate[];
  failed: Array<{
    frame: string;
    message: string;
  }>;
}

const largestBatch = 200;

/** A list of frame ids, or of `{ "frame": ID, "case": CASE_ID }`, as JSON. */
export function parseApproveFrames(raw: unknown): ApproveBatchEntry[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > largestBatch) {
    throw new Error(`--frames FILE must hold a JSON array of 1 to ${largestBatch} frames`);
  }
  const entries = raw.map((value): ApproveBatchEntry => {
    if (typeof value === "string" && value.trim()) {
      return {
        frame: value.trim(),
      };
    }
    const entry = value as {
      frame?: unknown;
      case?: unknown;
    };
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.frame !== "string" ||
      !entry.frame.trim() ||
      (entry.case !== undefined && (typeof entry.case !== "string" || !entry.case.trim()))
    ) {
      throw new Error('Each --frames entry is a frame id or { "frame": ID, "case": CASE_ID }');
    }
    return {
      frame: entry.frame.trim(),
      ...(entry.case
        ? {
            caseId: String(entry.case).trim(),
          }
        : {}),
    };
  });
  if (new Set(entries.map((entry) => entry.frame)).size !== entries.length) {
    throw new Error("--frames entries must be distinct frames");
  }
  return entries;
}

/**
 * Approval evidence for many frames of one page in one run: each frame is checked against its case, all are rendered together
 * with the same stable double render as a single approval, and with `write` every record is made with the same owner words.
 * Nothing is written unless every frame was rendered, stable and matched its case, so a batch never half-approves.
 * Renders are always fresh and always the exporter's: approvals do not reuse images or take editor screenshots.
 */
export async function approveFrames(
  client: PenpotToolClient,
  root: string,
  config: ProjectConfig | undefined,
  options: OperationOptions & {
    capturePolicy?: CapturePolicyName;
    concurrency?: number;
  },
  input: {
    page: string;
    entries: ApproveBatchEntry[];
    format?: string;
    write?: {
      note: string;
      by: string;
    };
    redact?: (text: string) => string;
  },
): Promise<ApproveBatchReport> {
  const failed: ApproveBatchReport["failed"] = [];
  const targets = new Map<string, Awaited<ReturnType<typeof resolveApprovalTarget>>>();
  for (const entry of input.entries) {
    try {
      targets.set(
        entry.frame,
        await resolveApprovalTarget(client, root, config, options, {
          page: input.page,
          frame: entry.frame,
          caseId: entry.caseId,
          format: input.format,
        }),
      );
    } catch (error) {
      failed.push({
        frame: entry.frame,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const pages = new Set([
    ...[
      ...targets.values(),
    ].map((target) => target.approvalPageId ?? `name:${target.approvalPage}`),
  ]);
  if (pages.size > 1) {
    throw new Error("A batch approval covers the frames of one page; split it by page");
  }
  const [any] = [
    ...targets.values(),
  ];
  const rendered = any
    ? await renderFrames(
        client,
        [
          ...targets.keys(),
        ],
        {
          ...options,
          page: any.approvalPage,
          concurrency: options.concurrency,
        },
      )
    : new Map();
  const candidates: ApproveBatchCandidate[] = [];
  const ready: Array<{
    frame: string;
    candidate: ApproveBatchCandidate;
  }> = [];
  for (const [frame, target] of targets) {
    const outcome = rendered.get(frame);
    if (!outcome?.ok) {
      failed.push({
        frame,
        message: outcome?.message ?? "The frame was not rendered",
      });
      continue;
    }
    const { result } = outcome;
    if (!result.stable) {
      failed.push({
        frame,
        message: "Approval export did not stabilize",
      });
      continue;
    }
    if (target.approvalPageId && result.capture.pageId !== target.approvalPageId) {
      failed.push({
        frame,
        message: "Approval capture changed the configured page identity",
      });
      continue;
    }
    const image = await encodeBaselineImage(result.png, target.imageFormat);
    const sha256 = artifactSha(image);
    const candidate: ApproveBatchCandidate = {
      frame,
      capture: result.capture,
      sha256,
      imageFormat: target.imageFormat,
      fingerprint: approvalFingerprint(result.capture, sha256, target.intent),
      recorded: false,
    };
    candidates.push(candidate);
    ready.push({
      frame,
      candidate,
    });
  }
  if (input.write && !failed.length) {
    for (const { frame, candidate } of ready) {
      const target = targets.get(frame)!;
      const result = rendered.get(frame)!;
      if (!result.ok) {
        continue;
      }
      const record: ApprovalRecord = await recordApproval(
        root,
        result.result,
        input.write,
        target.intent,
        input.redact,
        {
          format: target.imageFormat,
        },
      );
      candidate.recorded = true;
      candidate.recordId = record.id;
    }
  }
  return {
    schemaVersion: 1,
    kind: "approval-batch",
    recorded: candidates.length > 0 && candidates.every((candidate) => candidate.recorded),
    complete: !failed.length,
    candidates,
    failed,
  };
}
