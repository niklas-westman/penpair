import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { childMapRunId } from "../src/design-releases/child-journals.js";
import { releaseRecovery } from "../src/design-releases/status.js";
import type { DesignRelease } from "../src/design-releases/types.js";
import { observationHash, runJournaledSteps } from "../src/journal.js";

const release = {
  id: "release-101",
  productVersion: "1.0.1",
  fileId: "file",
  contracts: [
    {
      path: "a.json",
      sha256: "a".repeat(64),
    },
    {
      path: "b.json",
      sha256: "b".repeat(64),
    },
  ],
} as unknown as DesignRelease;
const target = async () => ({
  fileId: "file",
  revision: 1,
});

async function journal(root: string, runId: string, operation: string, payload: unknown) {
  await runJournaledSteps([], {
    root,
    runId,
    operation,
    input: {
      runId,
    },
    payload,
    target,
  });
}

describe("child map journals in release status", () => {
  it("keeps the deterministic child ID formula", () => {
    expect(childMapRunId("parent", 1)).toBe(
      `map-${observationHash({
        runId: "parent",
        index: 1,
      }).slice(0, 48)}`,
    );
  });

  it("never reads a verified parent as a full assembly", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-child-journals-"));
    const payload = {
      kind: "design-release-operation",
      releaseId: release.id,
      productVersion: release.productVersion,
      designHash: "hash",
    };
    await journal(root, "parent", "design-release-assemble", payload);
    await journal(root, childMapRunId("parent", 0), "publish-map", {});
    const recovery = await releaseRecovery(root, release, "hash");
    expect(
      recovery.map((entry) => [
        entry.runId,
        entry.state,
      ]),
    ).toEqual([
      [
        childMapRunId("parent", 1),
        "missing",
      ],
    ]);
    expect(recovery[0]!.reason).toMatch(/partial/);
    expect(recovery[0]!.resumeEligible).toBe(false);
  });
});
