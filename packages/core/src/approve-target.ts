import type { PenpotToolClient } from "./client.js";
import type { BaselineCase } from "./baselines-config.js";
import { resolveBaselineImageFormat } from "./baselines.js";
import type { BaselineImageFormat } from "./image-evidence.js";
import { runOnPage, type OperationOptions } from "./operation.js";
import { selectPage } from "./page-session.js";
import type { ProjectConfig } from "./instance/config.js";
import { findShapesByName } from "./shots.js";
import { frames as baselineFrames } from "./snippets/read.js";

export interface ApprovalTarget {
  intent?: BaselineCase;
  imageFormat: BaselineImageFormat;
  /** The page name to export from; absent when the configured case pins the page by id. */
  approvalPage?: string;
  approvalPageId?: string;
}

export interface ApprovalTargetInput {
  page: string;
  frame: string;
  caseId?: string;
  format?: string;
}

/**
 * Checks a frame against its configured approval case (page, frame identity, intent) and says which image format and page to use.
 * Nothing is rendered or written here; a frame that does not match its case is refused.
 */
export async function resolveApprovalTarget(
  client: PenpotToolClient,
  root: string,
  config: ProjectConfig | undefined,
  options: OperationOptions,
  input: ApprovalTargetInput,
): Promise<ApprovalTarget> {
  let intent: BaselineCase | undefined;
  let imageFormat: BaselineImageFormat =
    (input.format as BaselineImageFormat | undefined) ?? "webp";
  let approvalPage: string | undefined = input.page;
  let approvalPageId: string | undefined;
  if (input.caseId) {
    const baseline = config?.baselines;
    const wanted = baseline?.frames.find((f) => f.id === input.caseId);
    if (!wanted?.case || (!wanted.pageId && (wanted.page ?? baseline?.page) !== input.page)) {
      throw new Error("Approval case must reference an explicitly configured frame on this page");
    }
    if (wanted.pageId) {
      await selectPage(
        client,
        {
          id: wanted.pageId.toLowerCase(),
        },
        options,
      );
      const observed = await runOnPage(
        client,
        baselineFrames({
          pageId: wanted.pageId.toLowerCase(),
          frameIds: [
            input.frame.toLowerCase(),
          ],
        }),
        undefined,
        options,
      );
      if (
        observed.pageId !== wanted.pageId.toLowerCase() ||
        (wanted.page !== undefined && observed.page !== wanted.page) ||
        (input.page.toLowerCase() !== wanted.pageId.toLowerCase() && input.page !== observed.page)
      ) {
        throw new Error("Approval page ID and configured or supplied page name do not match");
      }
      const selected = Array.isArray(observed.frames)
        ? (observed.frames as {
            id: string;
            name: string;
          }[])
        : [];
      if (
        selected.length !== 1 ||
        (wanted.frame !== undefined && selected[0]!.name !== wanted.frame)
      ) {
        throw new Error("Approval frame does not match the configured case on this page");
      }
      approvalPageId = wanted.pageId.toLowerCase();
      approvalPage = undefined;
    }
    if (wanted.frameId) {
      if (wanted.frameId.toLowerCase() !== input.frame.toLowerCase()) {
        throw new Error("Approval frame ID does not match the configured case");
      }
    } else if (!wanted.pageId) {
      const found = await findShapesByName(client, wanted.frame!, input.page);
      if (found.matches.length !== 1 || found.matches[0]!.id !== input.frame) {
        throw new Error("Approval frame ID does not match the configured case");
      }
    }
    intent = wanted.case;
    imageFormat = input.format
      ? (input.format as BaselineImageFormat)
      : await resolveBaselineImageFormat(root, baseline!, wanted.id);
  }
  return {
    intent,
    imageFormat,
    approvalPage,
    approvalPageId,
  };
}
