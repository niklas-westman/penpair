import type { PenpotToolClient } from "../client.js";
import { listJournals, readJournal } from "../journal.js";
import { childMapRunId } from "./child-journals.js";
import { assessReleaseImplementation } from "./implementation-status.js";
import { checkRelease } from "./check.js";
import { evaluateReleaseStatus } from "./status-evaluation.js";
import { validateDesignRelease } from "./validation.js";
import type { DesignRelease, ReleaseCheck, ReleaseOptions } from "./types.js";
import type { ReleaseRecovery, ReleaseStatus } from "./status-types.js";

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function releaseRecovery(
  root: string,
  release: DesignRelease,
  designHash: string,
): Promise<ReleaseRecovery[]> {
  const result: ReleaseRecovery[] = [];
  const journals = await listJournals(root);
  const states = new Map(
    journals.map((summary) => [
      summary.runId,
      summary.state,
    ]),
  );
  for (const summary of journals) {
    if (
      !summary.operation.startsWith("design-release-") ||
      summary.target.fileId !== release.fileId
    ) {
      continue;
    }
    const journal = await readJournal(root, summary.runId);
    const payload = object(journal.payload);
    if (
      payload?.kind !== "design-release-operation" ||
      payload.releaseId !== release.id ||
      payload.productVersion !== release.productVersion
    ) {
      continue;
    }
    if (summary.operation === "design-release-assemble") {
      // A verified parent covers only the page and overview; each map has its own journal.
      for (const [index, contract] of release.contracts.entries()) {
        const childId = childMapRunId(summary.runId, index);
        const childState = states.get(childId);
        if (childState === "verified") {
          continue;
        }
        result.push({
          runId: childId,
          operation: "publish-map",
          state: childState ?? "missing",
          inputsMatch: !journal.redacted && payload.designHash === designHash,
          resumeEligible: false,
          reason: `Assembly ${summary.runId} is partial: the map journal for contract ${contract.id} is ${childState ?? "absent"}. Inspect it and independently read back Penpot before resuming; never infer full assembly from a verified parent`,
        });
      }
    }
    if (summary.state === "verified") {
      continue;
    }
    result.push({
      runId: summary.runId,
      operation: summary.operation,
      state: summary.state,
      inputsMatch: !journal.redacted && payload.designHash === designHash,
      resumeEligible: false,
      reason:
        "Inspect this journal and independently read back Penpot before resume; matching saved inputs do not prove current target or step compatibility",
    });
  }
  return result;
}

export async function releaseStatus(
  root: string,
  raw: DesignRelease,
  options: ReleaseOptions & {
    from?: string;
    client?: PenpotToolClient;
    checked?: ReleaseCheck;
    comparison?: import("./types.js").ReleaseArtifactRef;
  } = {},
): Promise<ReleaseStatus> {
  const release = validateDesignRelease(raw);
  const checked = options.checked ?? (await checkRelease(options.client, root, release, options));
  const implementation = await assessReleaseImplementation(
    root,
    release,
    checked.designHash,
    options.comparison,
  );
  const recovery = await releaseRecovery(root, release, checked.designHash);
  if (checked.live && checked.valid && release.status === "final") {
    for (const journal of recovery) {
      journal.reconciled = true;
      journal.reason =
        "Historical operation superseded by independent live verification of this exact finalized release; do not replay it";
    }
  }
  return evaluateReleaseStatus(release, checked, implementation, {
    from: options.from,
    recovery,
  });
}
